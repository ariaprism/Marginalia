import type { CallingCard } from '../../domain/profile'
import { createSyncOperation } from '../sync/operations'
import { openMarginaliaDB, withTransaction } from './db'
import { putOutboxOperation } from './syncStore'

const LOCAL_PROFILE_ID = 'self'

export type StoredProfile = CallingCard & {
  id: typeof LOCAL_PROFILE_ID
  updatedAt: string
}

export async function getStoredProfile(): Promise<StoredProfile | undefined> {
  return withTransaction('profiles', 'readonly', (store) => store.get(LOCAL_PROFILE_ID))
}

export async function saveStoredProfile(
  card: CallingCard,
  updatedAt = new Date().toISOString(),
): Promise<StoredProfile> {
  const record: StoredProfile = { id: LOCAL_PROFILE_ID, ...card, updatedAt }
  const db = await openMarginaliaDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['profiles', 'outbox'], 'readwrite')
    transaction.objectStore('profiles').put(record)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType: 'profile',
      entityId: LOCAL_PROFILE_ID,
      operation: 'upsert',
      payload: record,
      occurredAt: updatedAt,
    }))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('保存名帖的事务已中止'))
  })
  return record
}

/** 把旧 localStorage 名帖幂等地迁进 IndexedDB；已有记录时绝不覆盖。 */
export async function ensureStoredProfile(fallback: CallingCard): Promise<StoredProfile> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['profiles', 'outbox'], 'readwrite')
    const store = transaction.objectStore('profiles')
    const request = store.get(LOCAL_PROFILE_ID)
    let result: StoredProfile | undefined
    request.onsuccess = () => {
      const existing = request.result as StoredProfile | undefined
      if (existing) {
        result = existing
        return
      }
      const updatedAt = new Date().toISOString()
      result = { id: LOCAL_PROFILE_ID, ...fallback, updatedAt }
      store.put(result)
      putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
        entityType: 'profile',
        entityId: LOCAL_PROFILE_ID,
        operation: 'upsert',
        payload: result,
        occurredAt: updatedAt,
      }))
    }
    transaction.oncomplete = () => {
      if (result) resolve(result)
      else reject(new Error('名帖迁移没有生成记录'))
    }
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('迁移名帖的事务已中止'))
  })
}
