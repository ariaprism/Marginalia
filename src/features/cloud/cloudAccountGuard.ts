import { openMarginaliaDB } from '../../data/local/db'
import type { SyncState } from '../../data/sync/operations'

const CLOUD_OWNER_KEY = 'marginalia.cloud-owner-id'
export const CLOUD_ACCOUNT_BINDING_CHANGED_EVENT = 'marginalia:cloud-account-binding-changed'

export type CloudAccountAccess =
  | { kind: 'allowed'; ownerId: string }
  | { kind: 'unclaimed' }
  | { kind: 'blocked'; ownerId: string }

function completedAt(state: SyncState): string | undefined {
  return state.initialSyncCompletedAt
    ?? state.structuredInitialSyncCompletedAt
    ?? state.profileBookInitialSyncCompletedAt
    ?? state.lastSuccessfulSyncAt
}

async function readAccountEvidence(): Promise<{ states: SyncState[]; books: number }> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['syncState', 'books'], 'readonly')
    const statesRequest = transaction.objectStore('syncState').getAll()
    const booksRequest = transaction.objectStore('books').count()
    transaction.oncomplete = () => resolve({
      states: statesRequest.result as SyncState[],
      books: booksRequest.result,
    })
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function rememberOwner(ownerId: string): void {
  window.localStorage.setItem(CLOUD_OWNER_KEY, ownerId)
}

/**
 * 一间浏览器书房只能自动寄往一个 Supabase owner。
 *
 * 老版本没有显式绑定值，因此用最早完成同步的 syncState 迁移；这也能把已经误登过
 * 第二账号的浏览器稳稳认回最初账号。只有完全没有书的全新浏览器才自动认领新门帖。
 */
export async function inspectCloudAccountAccess(userId: string): Promise<CloudAccountAccess> {
  const remembered = window.localStorage.getItem(CLOUD_OWNER_KEY)
  if (remembered) {
    return remembered === userId
      ? { kind: 'allowed', ownerId: remembered }
      : { kind: 'blocked', ownerId: remembered }
  }

  const { states, books } = await readAccountEvidence()
  const completed = states
    .map((state) => ({ state, at: completedAt(state) }))
    .filter((item): item is { state: SyncState; at: string } => Boolean(item.at))
    .sort((a, b) => a.at.localeCompare(b.at))
  const originalOwner = completed[0]?.state.remoteUserId
  if (originalOwner) {
    rememberOwner(originalOwner)
    return originalOwner === userId
      ? { kind: 'allowed', ownerId: originalOwner }
      : { kind: 'blocked', ownerId: originalOwner }
  }

  if (books === 0) {
    rememberOwner(userId)
    return { kind: 'allowed', ownerId: userId }
  }
  return { kind: 'unclaimed' }
}

export function claimCloudAccount(userId: string): void {
  rememberOwner(userId)
  window.dispatchEvent(new Event(CLOUD_ACCOUNT_BINDING_CHANGED_EVENT))
}
