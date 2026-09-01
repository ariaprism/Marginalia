import { describe, expect, it, vi } from 'vitest'
import { createSyncOperation } from '../sync/operations'
import { CloudInkRemote, type CloudInkGateway } from './cloudInkRemote'

const gateway = (): CloudInkGateway => ({
  apply: vi.fn(async () => true),
  listChanges: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
  getBooks: vi.fn(async () => []),
})

describe('CloudInkRemote profile/book slice', () => {
  it('sends supported metadata and leaves files and traces pending', async () => {
    const api = gateway()
    const remote = new CloudInkRemote(api)
    const profile = createSyncOperation({ entityType: 'profile', entityId: 'self', operation: 'upsert', payload: { userName: '小狐狸' } })
    const file = createSyncOperation({ entityType: 'epubFile', entityId: 'book-1', operation: 'upload_file' })

    await expect(remote.push([profile, file])).resolves.toEqual([
      { operationId: profile.operationId, accepted: true },
      { operationId: file.operationId, accepted: false },
    ])
    expect(api.apply).toHaveBeenCalledTimes(1)
    expect(api.apply).toHaveBeenCalledWith(profile)
  })

  it('normalizes the account profile to the local self id', async () => {
    const api = gateway()
    vi.mocked(api.listChanges).mockResolvedValue([{
      change_id: 7, changed_at: '2026-09-01T10:00:00.000Z', entity_id: 'remote-user',
      entity_type: 'profile', operation: 'upsert', owner_id: 'remote-user',
    }])
    vi.mocked(api.getProfile).mockResolvedValue({
      owner_id: 'remote-user', user_name: '小狐狸', companion_name: '小G',
      companion_subject: '她', updated_at: '2026-09-01T10:00:00.000Z',
    })

    await expect(new CloudInkRemote(api).pull(0)).resolves.toEqual({
      cursor: 7,
      changes: [{
        changeId: 7, entityType: 'profile', entityId: 'self', operation: 'upsert',
        occurredAt: '2026-09-01T10:00:00.000Z',
        payload: { id: 'self', userName: '小狐狸', companionName: '小G', companionPronoun: '她', updatedAt: '2026-09-01T10:00:00.000Z' },
      }],
    })
  })

  it('returns current book metadata once when the change stream repeats an entity', async () => {
    const api = gateway()
    vi.mocked(api.listChanges).mockResolvedValue([
      { change_id: 8, changed_at: '2026-09-01T10:00:00.000Z', entity_id: 'book-1', entity_type: 'book', operation: 'upsert', owner_id: 'user-1' },
      { change_id: 9, changed_at: '2026-09-01T10:01:00.000Z', entity_id: 'book-1', entity_type: 'book', operation: 'upsert', owner_id: 'user-1' },
    ])
    vi.mocked(api.getBooks).mockResolvedValue([{
      id: 'book-1', owner_id: 'user-1', title: '夜航', english_title: null, author: '甲', language: 'zh', description: '',
      source: 'marginalia', status: 'reading', cover_tone: 'blue', epub_path: null, cover_path: null, content_hash: null,
      added_at: '2026-08-01T00:00:00.000Z', last_opened_at: null, pinned_at: null,
      updated_at: '2026-09-01T10:01:00.000Z', deleted_at: null,
    }])

    const result = await new CloudInkRemote(api).pull(7)
    expect(result.cursor).toBe(9)
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0]).toMatchObject({ changeId: 9, entityId: 'book-1', operation: 'upsert', payload: { title: '夜航' } })
  })
})
