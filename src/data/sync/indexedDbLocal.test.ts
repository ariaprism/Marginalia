import { describe, expect, it } from 'vitest'
import {
  getAllBooks,
  getAnnotations,
  getBook,
  getChapters,
  getHighlights,
  getMarginalia,
  getReadingProgress,
  saveBook,
} from '../local/bookStore'
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

  it('applies and removes structured book contents without creating outbox rows', async () => {
    const book = { id: 'book-1', title: '夜航', author: '', source: 'marginalia' as const, status: 'reading' as const, progress: 0, addedAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }
    await saveBook(book)
    const local = new IndexedDbSyncLocal('user-1')
    await local.acknowledge((await local.pending()).map((item) => item.operationId))
    const locator = { bookId: 'book-1', position: { chapterIndex: 0, elementPath: [0], textOffset: 0, selectedText: '雨', beforeContext: '', afterContext: '' } }
    const at = '2026-09-05T10:00:00.000Z'

    await local.apply([
      { changeId: 5, entityType: 'chapter', entityId: 'book-1:0', operation: 'upsert', occurredAt: at, payload: { id: 'book-1:0', bookId: 'book-1', index: 0, title: '第一章', href: 'one.xhtml', html: '<p>雨</p>' } },
      { changeId: 6, entityType: 'readingProgress', entityId: 'book-1', operation: 'upsert', occurredAt: at, payload: { bookId: 'book-1', locator, chapterProgress: 20, totalProgress: 5, updatedAt: at } },
      { changeId: 7, entityType: 'bookmark', entityId: 'book-1', operation: 'upsert', occurredAt: at, payload: { bookId: 'book-1', locator, updatedAt: at } },
      { changeId: 8, entityType: 'highlight', entityId: 'hl-1', operation: 'upsert', occurredAt: at, payload: { id: 'hl-1', bookId: 'book-1', locator, color: 'rose', createdAt: at, updatedAt: at } },
      { changeId: 9, entityType: 'annotation', entityId: 'note-1', operation: 'upsert', occurredAt: at, payload: { id: 'note-1', bookId: 'book-1', highlightId: 'hl-1', locator, text: '听见了', actor: 'user', createdAt: at, updatedAt: at } },
      { changeId: 10, entityType: 'marginalia', entityId: 'mg-1', operation: 'upsert', occurredAt: at, payload: { id: 'mg-1', bookId: 'book-1', annotationId: 'note-1', locator, text: '我也听见了', actor: 'companion', visibility: 'immediate', createdAt: at, updatedAt: at } },
    ], 10)

    expect(await getChapters('book-1')).toHaveLength(1)
    expect((await getReadingProgress('book-1'))?.bookmark?.locator).toEqual(locator)
    expect(await getHighlights('book-1')).toHaveLength(1)
    expect(await getAnnotations('book-1')).toHaveLength(1)
    expect(await getMarginalia('book-1')).toHaveLength(1)
    expect(await local.pending()).toEqual([])

    await local.apply([
      { changeId: 11, entityType: 'bookmark', entityId: 'book-1', operation: 'delete', occurredAt: at },
      { changeId: 12, entityType: 'highlight', entityId: 'hl-1', operation: 'delete', occurredAt: at },
      { changeId: 13, entityType: 'annotation', entityId: 'note-1', operation: 'delete', occurredAt: at },
      { changeId: 14, entityType: 'marginalia', entityId: 'mg-1', operation: 'delete', occurredAt: at },
    ], 14)
    expect((await getReadingProgress('book-1'))?.bookmark).toBeUndefined()
    expect(await getHighlights('book-1')).toEqual([])
    expect(await getAnnotations('book-1')).toEqual([])
    expect(await getMarginalia('book-1')).toEqual([])
  })
})
