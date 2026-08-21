import { withStoresTransaction, withTransaction } from './db'
import type { SyncOperation, SyncState } from '../sync/operations'

export function putOutboxOperation(store: IDBObjectStore, operation: SyncOperation): void {
  store.put(operation)
}

export async function getOutboxOperations(): Promise<SyncOperation[]> {
  const operations = await withTransaction<SyncOperation[]>('outbox', 'readonly', (store) => store.getAll())
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
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
