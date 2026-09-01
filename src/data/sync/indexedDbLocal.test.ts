import { describe, expect, it } from 'vitest'
import { getAllBooks, getBook, saveBook } from '../local/bookStore'
import { getStoredProfile } from '../local/profileStore'
import { getSyncState } from '../local/syncStore'
import { IndexedDbSyncLocal } from './indexedDbLocal'

describe('IndexedDbSyncLocal profile/book slice', () => {
  it('applies profile and book metadata with the cursor in one local pass', async () => {
    const local = new IndexedDbSyncLocal('user-1')
    await local.apply([
      { changeId: 1, entityType: 'profile', entityId: 'self', operation: 'upsert', occurredAt: '2026-09-01T10:00:00.000Z', payload: { id: 'self', userName: '小狐狸', companionName: '小G', companionPronoun: '她', updatedAt: '2026-09-01T10:00:00.000Z' } },
      { changeId: 2, entityType: 'book', entityId: 'book-1', operation: 'upsert', occurredAt: '2026-09-01T10:01:00.000Z', payload: { id: 'book-1', title: '夜航', author: '甲', source: 'marginalia', status: 'wish', progress: 0, addedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T10:01:00.000Z' } },
    ], 2)

    expect((await getStoredProfile())?.companionName).toBe('小G')
    expect((await getBook('book-1'))?.title).toBe('夜航')
    expect((await getSyncState('user-1'))?.lastPulledChangeId).toBe(2)
  })

  it('does not overwrite a newer unsent local book', async () => {
    await saveBook({ id: 'book-1', title: '本地新题名', author: '甲', source: 'marginalia', status: 'wish', progress: 0, addedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T11:00:00.000Z' })
    const local = new IndexedDbSyncLocal('user-1')
    await local.apply([{ changeId: 3, entityType: 'book', entityId: 'book-1', operation: 'upsert', occurredAt: '2026-09-01T10:00:00.000Z', payload: { id: 'book-1', title: '云端旧题名', author: '甲', source: 'marginalia', status: 'wish', progress: 0, addedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' } }], 3)

    expect((await getBook('book-1'))?.title).toBe('本地新题名')
    expect((await getSyncState('user-1'))?.lastPulledChangeId).toBe(3)
  })

  it('removes a remotely deleted book', async () => {
    await saveBook({ id: 'book-1', title: '待删', author: '', source: 'marginalia', status: 'wish', progress: 0, addedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' })
    const pending = await new IndexedDbSyncLocal('user-1').pending()
    await new IndexedDbSyncLocal('user-1').acknowledge(pending.map((item) => item.operationId))
    await new IndexedDbSyncLocal('user-1').apply([{ changeId: 4, entityType: 'book', entityId: 'book-1', operation: 'delete', occurredAt: '2026-09-01T11:00:00.000Z' }], 4)

    expect(await getAllBooks()).toEqual([])
  })
})
