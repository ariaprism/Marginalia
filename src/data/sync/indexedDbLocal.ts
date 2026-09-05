import type { Book } from '../../domain/book'
import type { Annotation } from '../../domain/annotation'
import type { Highlight } from '../../domain/highlight'
import type { Marginalia } from '../../domain/marginalia'
import type { ReadingProgress } from '../../domain/readingProgress'
import type { StoredChapter } from '../local/bookStore'
import type { StoredProfile } from '../local/profileStore'
import { openMarginaliaDB } from '../local/db'
import {
  acknowledgeOutboxOperations,
  getOutboxOperations,
  getSyncState,
  markOutboxAttempt,
} from '../local/syncStore'
import type { SyncLocal } from './engine'
import type { RemoteChange, SyncOperation, SyncState } from './operations'

const bookChildStores = ['chapters', 'highlights', 'annotations', 'marginalia'] as const

function deleteBookChildren(transaction: IDBTransaction, bookId: string): void {
  transaction.objectStore('epubFiles').delete(bookId)
  transaction.objectStore('readingProgress').delete(bookId)
  transaction.objectStore('bookmarks').delete(bookId)
  for (const storeName of bookChildStores) {
    const index = transaction.objectStore(storeName).index('bookId')
    const request = index.openKeyCursor(IDBKeyRange.only(bookId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      transaction.objectStore(storeName).delete(cursor.primaryKey)
      cursor.continue()
    }
  }
}

/** IndexedDB half of the real sync engine. Remote writes never create a new outbox item. */
export class IndexedDbSyncLocal implements SyncLocal {
  private readonly remoteUserId: string

  constructor(remoteUserId: string) {
    this.remoteUserId = remoteUserId
  }

  pending(): Promise<SyncOperation[]> {
    return getOutboxOperations()
  }

  acknowledge(operationIds: string[]): Promise<void> {
    return acknowledgeOutboxOperations(operationIds)
  }

  recordFailure(operationId: string, message: string): Promise<void> {
    return markOutboxAttempt(operationId, message)
  }

  async cursor(): Promise<number> {
    return (await getSyncState(this.remoteUserId))?.lastPulledChangeId ?? 0
  }

  async apply(changes: RemoteChange[], cursor: number): Promise<void> {
    const db = await openMarginaliaDB()
    const stores = [
      'profiles', 'books', 'epubFiles', 'chapters', 'readingProgress', 'bookmarks',
      'highlights', 'annotations', 'marginalia', 'outbox', 'syncState',
    ]
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(stores, 'readwrite')
      const pendingRequest = transaction.objectStore('outbox').getAll()
      const stateRequest = transaction.objectStore('syncState').get(this.remoteUserId)

      pendingRequest.onsuccess = () => {
        const newestPending = new Map<string, string>()
        for (const operation of pendingRequest.result as SyncOperation[]) {
          const current = newestPending.get(operation.entityKey)
          if (!current || operation.occurredAt > current) {
            newestPending.set(operation.entityKey, operation.occurredAt)
          }
        }

        for (const change of changes) {
          const pendingAt = newestPending.get(`${change.entityType}:${change.entityId}`)
          if (pendingAt && pendingAt > change.occurredAt) continue

          if (change.entityType === 'profile' && change.operation === 'upsert' && change.payload) {
            transaction.objectStore('profiles').put(change.payload as StoredProfile)
          }
          if (change.entityType === 'book') {
            const books = transaction.objectStore('books')
            if (change.operation === 'delete') {
              books.delete(change.entityId)
              deleteBookChildren(transaction, change.entityId)
            } else if (change.payload) {
              const incoming = change.payload as Book
              const existingRequest = books.get(change.entityId)
              existingRequest.onsuccess = () => {
                const existing = existingRequest.result as Book | undefined
                books.put({
                  ...incoming,
                  ...(existing?.coverUrl ? { coverUrl: existing.coverUrl } : {}),
                  progress: existing?.progress ?? incoming.progress,
                })
              }
            }
          }
          if (change.entityType === 'chapter') {
            const store = transaction.objectStore('chapters')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload as StoredChapter)
          }
          if (change.entityType === 'readingProgress') {
            const store = transaction.objectStore('readingProgress')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload as ReadingProgress)
          }
          if (change.entityType === 'bookmark') {
            const store = transaction.objectStore('bookmarks')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload)
          }
          if (change.entityType === 'highlight') {
            const store = transaction.objectStore('highlights')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload as Highlight)
          }
          if (change.entityType === 'annotation') {
            const store = transaction.objectStore('annotations')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload as Annotation)
          }
          if (change.entityType === 'marginalia') {
            const store = transaction.objectStore('marginalia')
            if (change.operation === 'delete') store.delete(change.entityId)
            else if (change.payload) store.put(change.payload as Marginalia)
          }
        }
      }

      stateRequest.onsuccess = () => {
        const previous = stateRequest.result as SyncState | undefined
        transaction.objectStore('syncState').put({
          remoteUserId: this.remoteUserId,
          lastPulledChangeId: Math.max(previous?.lastPulledChangeId ?? 0, cursor),
          lastSuccessfulSyncAt: new Date().toISOString(),
          ...(previous?.initialSyncCompletedAt
            ? { initialSyncCompletedAt: previous.initialSyncCompletedAt }
            : {}),
          ...(previous?.profileBookInitialSyncCompletedAt
            ? { profileBookInitialSyncCompletedAt: previous.profileBookInitialSyncCompletedAt }
            : {}),
          ...(previous?.structuredInitialSyncCompletedAt
            ? { structuredInitialSyncCompletedAt: previous.structuredInitialSyncCompletedAt }
            : {}),
        } satisfies SyncState)
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('写回云端变化失败'))
      transaction.onabort = () => reject(transaction.error ?? new Error('写回云端变化的事务已中止'))
    })
  }
}
