import { openMarginaliaDB, withStoresTransaction, withTransaction } from './db'
import {
  compactSyncOperations,
  createSyncOperation,
  type SyncEntityType,
  type SyncOperation,
  type SyncState,
} from '../sync/operations'

export function putOutboxOperation(store: IDBObjectStore, operation: SyncOperation): void {
  const request = store.index('entityKey').getAllKeys(IDBKeyRange.only(operation.entityKey))
  request.onsuccess = () => {
    for (const operationId of request.result) store.delete(operationId)
    store.put(operation)
  }
}

export async function getOutboxOperations(): Promise<SyncOperation[]> {
  const operations = await withTransaction<SyncOperation[]>('outbox', 'readonly', (store) => store.getAll())
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** 清理升级前留下的同对象历史动作；保留最后一笔即可表达当前本地状态。 */
export async function compactOutbox(): Promise<number> {
  const operations = await getOutboxOperations()
  const kept = new Set(compactSyncOperations(operations).map((operation) => operation.operationId))
  const obsolete = operations.filter((operation) => !kept.has(operation.operationId))
  await acknowledgeOutboxOperations(obsolete.map((operation) => operation.operationId))
  return obsolete.length
}

export type PendingSyncSummary = {
  operations: number
  books: number
  profile: number
  files: number
  chapters: number
  reading: number
  traces: number
}

function payloadBookId(operation: SyncOperation): string | undefined {
  if (operation.entityType === 'book') return operation.entityId
  if (operation.entityType === 'readingProgress' || operation.entityType === 'bookmark'
    || operation.entityType === 'epubFile') return operation.entityId
  const payload = operation.payload
  if (payload && typeof payload === 'object' && 'bookId' in payload) {
    const bookId = (payload as { bookId?: unknown }).bookId
    return typeof bookId === 'string' ? bookId : undefined
  }
  return undefined
}

export async function getPendingSyncSummary(): Promise<PendingSyncSummary> {
  const operations = compactSyncOperations(await getOutboxOperations())
  const byType = new Map<SyncEntityType, number>()
  const books = new Set<string>()
  for (const operation of operations) {
    byType.set(operation.entityType, (byType.get(operation.entityType) ?? 0) + 1)
    const bookId = payloadBookId(operation)
    if (bookId) books.add(bookId)
  }
  return {
    operations: operations.length,
    books: books.size,
    profile: byType.get('profile') ?? 0,
    files: byType.get('epubFile') ?? 0,
    chapters: byType.get('chapter') ?? 0,
    reading: (byType.get('readingProgress') ?? 0) + (byType.get('bookmark') ?? 0),
    traces: (byType.get('highlight') ?? 0) + (byType.get('annotation') ?? 0)
      + (byType.get('marginalia') ?? 0),
  }
}

export async function acknowledgeOutboxOperations(operationIds: string[]): Promise<void> {
  if (!operationIds.length) return
  await withStoresTransaction(['outbox'], 'readwrite', (transaction) => {
    const store = transaction.objectStore('outbox')
    operationIds.forEach((id) => store.delete(id))
  })
}

export async function markOutboxAttempt(operationId: string, error: string): Promise<void> {
  const dbOperation = await withTransaction<SyncOperation | undefined>('outbox', 'readonly', (store) => store.get(operationId))
  if (!dbOperation) return
  await withTransaction('outbox', 'readwrite', (store) => store.put({
    ...dbOperation,
    attempts: dbOperation.attempts + 1,
    lastError: error,
  }))
}

export async function getSyncState(remoteUserId: string): Promise<SyncState | undefined> {
  return withTransaction('syncState', 'readonly', (store) => store.get(remoteUserId))
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await withTransaction('syncState', 'readwrite', (store) => store.put(state))
}

type BootstrapSource = {
  storeName: string
  entityType: SyncOperation['entityType']
  entityId: (record: Record<string, unknown>) => string
  occurredAt: (record: Record<string, unknown>) => string | undefined
  operation: SyncOperation['operation']
  payload: (record: Record<string, unknown>) => unknown
}

const bootstrapSources: BootstrapSource[] = [
  { storeName: 'profiles', entityType: 'profile', entityId: (row) => String(row.id), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'books', entityType: 'book', entityId: (row) => String(row.id), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'epubFiles', entityType: 'epubFile', entityId: (row) => String(row.bookId), occurredAt: (row) => row.addedAt as string | undefined, operation: 'upload_file', payload: (row) => ({ bookId: row.bookId }) },
  { storeName: 'chapters', entityType: 'chapter', entityId: (row) => String(row.id), occurredAt: () => undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'readingProgress', entityType: 'readingProgress', entityId: (row) => String(row.bookId), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'bookmarks', entityType: 'bookmark', entityId: (row) => String(row.bookId), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'highlights', entityType: 'highlight', entityId: (row) => String(row.id), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'annotations', entityType: 'annotation', entityId: (row) => String(row.id), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
  { storeName: 'marginalia', entityType: 'marginalia', entityId: (row) => String(row.id), occurredAt: (row) => row.updatedAt as string | undefined, operation: 'upsert', payload: (row) => row },
]

function sourceNeedsInitialScan(source: BootstrapSource, state: SyncState | undefined): boolean {
  if (state?.initialSyncCompletedAt) return false
  if (state?.structuredInitialSyncCompletedAt && source.entityType !== 'epubFile') return false
  if (state?.profileBookInitialSyncCompletedAt
    && (source.entityType === 'profile' || source.entityType === 'book')) return false
  return true
}

/**
 * 第一次连接云端前，把升级数据库之前已经存在的书房内容补进 outbox。
 *
 * 已完成首次同步的账号不再扫描；尚未完成时也只为当前没有待寄项的实体补一笔，
 * 因此登录页重复挂载或刷新不会堆出重复纸条。
 */
export async function prepareInitialOutbox(remoteUserId: string): Promise<number> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const storeNames = [
      ...bootstrapSources.map((source) => source.storeName),
      'outbox',
      'syncState',
    ]
    const transaction = db.transaction(storeNames, 'readwrite')
    const outbox = transaction.objectStore('outbox')
    let added = 0

    const stateRequest = transaction.objectStore('syncState').get(remoteUserId)
    stateRequest.onsuccess = () => {
      const state = stateRequest.result as SyncState | undefined
      if (state?.initialSyncCompletedAt) return

      const pendingRequest = outbox.getAll()
      pendingRequest.onsuccess = () => {
        const pendingKeys = new Set(
          (pendingRequest.result as SyncOperation[]).map((operation) => operation.entityKey),
        )
        for (const source of bootstrapSources) {
          if (!sourceNeedsInitialScan(source, state)) continue
          const recordsRequest = transaction.objectStore(source.storeName).getAll()
          recordsRequest.onsuccess = () => {
            for (const value of recordsRequest.result as Record<string, unknown>[]) {
              const entityId = source.entityId(value)
              const entityKey = `${source.entityType}:${entityId}`
              if (pendingKeys.has(entityKey)) continue
              putOutboxOperation(outbox, createSyncOperation({
                entityType: source.entityType,
                entityId,
                operation: source.operation,
                payload: source.payload(value),
                occurredAt: source.occurredAt(value),
              }))
              pendingKeys.add(entityKey)
              added += 1
            }
          }
        }
      }
    }
    transaction.oncomplete = () => resolve(added)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('整理首次待寄清单的事务已中止'))
  })
}
