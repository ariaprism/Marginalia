import { describe, expect, it, vi } from 'vitest'
import { createSyncOperation } from '../sync/operations'
import { CloudInkRemote, type CloudInkGateway } from './cloudInkRemote'

const gateway = (): CloudInkGateway => ({
  apply: vi.fn(async () => true),
  listChanges: vi.fn(async () => []),
  getProfile: vi.fn(async () => null),
  getBooks: vi.fn(async () => []),
  getChapters: vi.fn(async () => []),
  getReadingPositions: vi.fn(async () => []),
  getBookmarks: vi.fn(async () => []),
  getHighlights: vi.fn(async () => []),
  getAnnotations: vi.fn(async () => []),
  getMarginalia: vi.fn(async () => []),
})

describe('CloudInkRemote structured sync', () => {
  it('sends structured records in dependency order and leaves EPUB bytes pending', async () => {
    const api = gateway()
    const remote = new CloudInkRemote(api)
    const profile = createSyncOperation({ entityType: 'profile', entityId: 'self', operation: 'upsert', payload: { userName: '小狐狸' } })
    const file = createSyncOperation({ entityType: 'epubFile', entityId: 'book-1', operation: 'upload_file' })
    const annotation = createSyncOperation({ entityType: 'annotation', entityId: 'note-1', operation: 'upsert', payload: { id: 'note-1' } })
    const highlight = createSyncOperation({ entityType: 'highlight', entityId: 'hl-1', operation: 'upsert', payload: { id: 'hl-1' } })

    await expect(remote.push([annotation, file, profile, highlight])).resolves.toEqual([
      { operationId: annotation.operationId, accepted: true },
      { operationId: file.operationId, accepted: false },
      { operationId: profile.operationId, accepted: true },
      { operationId: highlight.operationId, accepted: true },
    ])
    expect(api.apply).toHaveBeenCalledTimes(3)
    expect(vi.mocked(api.apply).mock.calls.map(([operation]) => operation.entityType))
      .toEqual(['profile', 'highlight', 'annotation'])
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

  it('maps chapters, reading state and traces back to local records', async () => {
    const api = gateway()
    vi.mocked(api.listChanges).mockResolvedValue([
      { change_id: 10, changed_at: '2026-09-05T10:00:00.000Z', entity_id: 'book-1:0', entity_type: 'chapter', operation: 'upsert', owner_id: 'user-1' },
      { change_id: 11, changed_at: '2026-09-05T10:01:00.000Z', entity_id: 'book-1', entity_type: 'readingProgress', operation: 'upsert', owner_id: 'user-1' },
      { change_id: 12, changed_at: '2026-09-05T10:02:00.000Z', entity_id: 'hl-1', entity_type: 'highlight', operation: 'upsert', owner_id: 'user-1' },
      { change_id: 13, changed_at: '2026-09-05T10:03:00.000Z', entity_id: 'note-1', entity_type: 'annotation', operation: 'upsert', owner_id: 'user-1' },
    ])
    const locator = { bookId: 'book-1', position: { chapterIndex: 0, elementPath: [0], textOffset: 0, selectedText: '雨', beforeContext: '', afterContext: '' } }
    vi.mocked(api.getChapters).mockResolvedValue([{
      id: 'book-1:0', owner_id: 'user-1', book_id: 'book-1', spine_index: 0,
      title: '第一章', href: 'one.xhtml', content_html: '<p>雨</p>', content_text: '雨',
      content_hash: null, updated_at: '2026-09-05T10:00:00.000Z', deleted_at: null,
    }])
    vi.mocked(api.getReadingPositions).mockResolvedValue([{
      book_id: 'book-1', owner_id: 'user-1', locator, chapter_progress: 20,
      total_progress: 5, read_at: '2026-09-05T10:01:00.000Z', updated_at: '2026-09-05T10:01:00.000Z',
    }])
    vi.mocked(api.getHighlights).mockResolvedValue([{
      id: 'hl-1', owner_id: 'user-1', book_id: 'book-1', locator, color: 'rose',
      created_at: '2026-09-05T10:02:00.000Z', updated_at: '2026-09-05T10:02:00.000Z', deleted_at: null,
    }])
    vi.mocked(api.getAnnotations).mockResolvedValue([{
      id: 'note-1', owner_id: 'user-1', book_id: 'book-1', highlight_id: 'hl-1', locator,
      text: '听见了', actor: 'user', created_at: '2026-09-05T10:03:00.000Z',
      updated_at: '2026-09-05T10:03:00.000Z', deleted_at: null,
    }])

    const result = await new CloudInkRemote(api).pull(9)
    expect(result.cursor).toBe(13)
    expect(result.changes.map((change) => change.entityType))
      .toEqual(['chapter', 'readingProgress', 'highlight', 'annotation'])
    expect(result.changes[0].payload).toMatchObject({ bookId: 'book-1', html: '<p>雨</p>' })
    expect(result.changes[1].payload).toMatchObject({ chapterProgress: 20, locator })
    expect(result.changes[3].payload).toMatchObject({ text: '听见了', highlightId: 'hl-1' })
  })
})
