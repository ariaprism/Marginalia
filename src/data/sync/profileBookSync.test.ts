import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CALLING_CARD } from '../../domain/profile'
import { ensureStoredProfile, getStoredProfile, saveStoredProfile } from '../local/profileStore'
import { getSyncState } from '../local/syncStore'
import type { PushResult, SyncRemote } from './engine'
import type { RemoteChange, SyncOperation } from './operations'
import { syncProfileAndBooksWithRemote } from './profileBookSync'

const cloudProfile: RemoteChange = {
  changeId: 4,
  entityType: 'profile',
  entityId: 'self',
  operation: 'upsert',
  occurredAt: '2026-08-01T10:00:00.000Z',
  payload: {
    id: 'self', userName: '云端小狐狸', companionName: '小G', companionPronoun: '她',
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
}

function remoteWithProfile() {
  const pushed: SyncOperation[][] = []
  const pull = vi.fn(async (after: number) => after < 4
    ? { changes: [cloudProfile], cursor: 4 }
    : { changes: [], cursor: 4 })
  const remote: SyncRemote = {
    pull,
    async push(operations): Promise<PushResult[]> {
      pushed.push(operations)
      return operations.map((operation) => ({ operationId: operation.operationId, accepted: true }))
    },
  }
  return { remote, pushed, pull }
}

describe('profile/book first merge protection', () => {
  it('lets an existing cloud profile replace a fresh browser default', async () => {
    await ensureStoredProfile(DEFAULT_CALLING_CARD)
    const { remote, pushed } = remoteWithProfile()

    await expect(syncProfileAndBooksWithRemote(remote, 'reader-1')).resolves.toMatchObject({
      pushed: 0,
      pulled: 1,
      cursor: 4,
    })
    expect(pushed).toEqual([])
    expect((await getStoredProfile())?.userName).toBe('云端小狐狸')
    expect((await getSyncState('reader-1'))?.profileBookInitialSyncCompletedAt).toBeTruthy()
  })

  it('keeps and sends a genuinely edited local profile when it is newer', async () => {
    await saveStoredProfile({
      userName: '本机小狐狸', companionName: '小G', companionPronoun: '她',
    }, '2026-09-01T10:00:00.000Z')
    const { remote, pushed } = remoteWithProfile()

    await expect(syncProfileAndBooksWithRemote(remote, 'reader-1')).resolves.toMatchObject({ pushed: 1 })
    expect(pushed).toHaveLength(1)
    expect(pushed[0][0]).toMatchObject({ entityType: 'profile', payload: { userName: '本机小狐狸' } })
    expect((await getStoredProfile())?.userName).toBe('本机小狐狸')
  })
})
