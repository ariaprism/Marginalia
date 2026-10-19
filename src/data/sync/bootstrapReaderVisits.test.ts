import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../remote/database.types'
import { withTransaction } from '../local/db'
import { getOutboxOperations, getSyncState, saveSyncState } from '../local/syncStore'
import { IndexedDbSyncLocal } from './indexedDbLocal'
import { bootstrapReaderVisits } from './bootstrapReaderVisits'

describe('来访升级补取', () => {
  it('已越过事件的老客户端仍能取到旧来访，不倒退游标或生成待寄项，后续同步保留标记', async () => {
    await saveSyncState({ remoteUserId: 'owner', lastPulledChangeId: 400, initialSyncCompletedAt: '2026-10-01' })
    const range = vi.fn().mockResolvedValue({ data: [{ id: 'visit', owner_id: 'owner', reader_id: 'xiaog', book_id: 'book', started_at: '2026-10-01T00:00:00Z', closed_at: null, start_cursor: 'p1:0:0:0', end_cursor: 'p1:0:0:9', character_count: 9, trace_count: 0, state_snapshot: null }], error: null })
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range }
    const client = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient<Database>
    await bootstrapReaderVisits(client, 'owner')
    expect(await withTransaction('readerSessions', 'readonly', store => store.get('visit'))).toMatchObject({ mode: 'unknown', characterCount: 9 })
    expect(await getOutboxOperations()).toEqual([])
    await new IndexedDbSyncLocal('owner').apply([], 401)
    expect(await getSyncState('owner')).toMatchObject({ lastPulledChangeId: 401, readerVisitsBootstrappedAt: expect.any(String) })
    await bootstrapReaderVisits(client, 'owner')
    expect(range).toHaveBeenCalledTimes(1)
  })
  it('补取中断不记完成，下次仍可重试', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }) }
    await expect(bootstrapReaderVisits({ from: () => query } as unknown as SupabaseClient<Database>, 'owner')).rejects.toThrow('offline')
    expect((await getSyncState('owner'))?.readerVisitsBootstrappedAt).toBeUndefined()
  })
})
