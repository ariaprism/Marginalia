import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../domain'
import { createBook } from '../../domain/book'
import { createSyncOperation } from '../sync/operations'
import { saveAnnotation, deleteAnnotation, getAnnotations } from './bookStore'
import { withStoresTransaction, withTransaction } from './db'
import {
  getOutboxOperations,
  compactOutbox,
  getPendingSyncSummary,
  getSyncState,
  prepareInitialOutbox,
  saveSyncState,
} from './syncStore'

const note: Annotation = {
  id: 'note-1',
  bookId: 'book-1',
  locator: {
    bookId: 'book-1',
    position: {
      chapterIndex: 0,
      elementPath: [0],
      textOffset: 0,
      selectedText: '雨声',
      beforeContext: '',
      afterContext: '',
    },
  },
  text: '像一封信',
  actor: 'user',
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
}

describe('IndexedDB sync stores', () => {
  it('writes a business record and its outbox operation together', async () => {
    await saveAnnotation(note)

    expect(await getAnnotations('book-1')).toEqual([note])
    expect(await getOutboxOperations()).toEqual([
      expect.objectContaining({
        entityKey: 'annotation:note-1',
        operation: 'upsert',
        payload: note,
      }),
    ])
  })

  it('queues a tombstone operation when deleting a record', async () => {
    await saveAnnotation(note)
    await deleteAnnotation(note.id)

    expect(await getAnnotations('book-1')).toEqual([])
    expect((await getOutboxOperations()).find((operation) => operation.operation === 'delete')).toEqual(
      expect.objectContaining({ entityKey: 'annotation:note-1', operation: 'delete' }),
    )
  })

  it('keeps only the latest pending action for the same object', async () => {
    await saveAnnotation(note)
    await saveAnnotation({
      ...note,
      text: '改过的字',
      updatedAt: '2026-08-21T10:05:00.000Z',
    })

    expect(await getOutboxOperations()).toEqual([
      expect.objectContaining({
        entityKey: 'annotation:note-1',
        payload: expect.objectContaining({ text: '改过的字' }),
      }),
    ])
  })

  it('compacts old duplicate rows and reports a human-sized summary', async () => {
    const oldProgress = createSyncOperation({
      operationId: 'old-progress', entityType: 'readingProgress', entityId: 'book-1',
      operation: 'upsert', occurredAt: '2026-08-21T10:00:00.000Z', payload: { bookId: 'book-1' },
    })
    const newProgress = createSyncOperation({
      operationId: 'new-progress', entityType: 'readingProgress', entityId: 'book-1',
      operation: 'upsert', occurredAt: '2026-08-21T10:05:00.000Z', payload: { bookId: 'book-1' },
    })
    const chapter = createSyncOperation({
      operationId: 'chapter-1', entityType: 'chapter', entityId: 'book-1:0',
      operation: 'upsert', payload: { bookId: 'book-1' },
    })
    await withStoresTransaction(['outbox'], 'readwrite', (transaction) => {
      const store = transaction.objectStore('outbox')
      store.put(oldProgress)
      store.put(newProgress)
      store.put(chapter)
    })

    await expect(compactOutbox()).resolves.toBe(1)
    await expect(getPendingSyncSummary()).resolves.toEqual({
      operations: 2,
      books: 1,
      profile: 0,
      files: 0,
      chapters: 1,
      reading: 1,
      traces: 0,
    })
  })

  it('rolls the record back when its shared transaction aborts', async () => {
    await expect(withStoresTransaction(['annotations', 'outbox'], 'readwrite', (transaction) => {
      transaction.objectStore('annotations').put(note)
      throw new Error('stop before outbox')
    })).rejects.toThrow('stop before outbox')

    expect(await getAnnotations('book-1')).toEqual([])
    expect(await getOutboxOperations()).toEqual([])
  })

  it('persists the remote cursor and last successful sync time', async () => {
    const state = {
      remoteUserId: 'reader-1',
      lastPulledChangeId: 42,
      lastSuccessfulSyncAt: '2026-08-21T10:10:00.000Z',
    }
    await saveSyncState(state)
    expect(await getSyncState('reader-1')).toEqual(state)
  })

  it('queues records that existed before outbox and does not duplicate them', async () => {
    const book = createBook({
      id: 'old-book',
      title: '旧书',
      author: '小G',
      source: 'marginalia',
      status: 'reading',
    }, '2026-08-01T10:00:00.000Z')
    await withTransaction('books', 'readwrite', (store) => store.put(book))

    await expect(prepareInitialOutbox('reader-1')).resolves.toBe(1)
    await expect(prepareInitialOutbox('reader-1')).resolves.toBe(0)
    expect(await getOutboxOperations()).toEqual([
      expect.objectContaining({ entityKey: 'book:old-book', payload: book }),
    ])
  })

  it('skips the initial scan after that cloud account completed its first sync', async () => {
    await withTransaction('books', 'readwrite', (store) => store.put(createBook({
      id: 'already-synced',
      title: '已收好',
      author: '',
      source: 'marginalia',
      status: 'wish',
    })))
    await saveSyncState({
      remoteUserId: 'reader-1',
      lastPulledChangeId: 3,
      initialSyncCompletedAt: '2026-08-28T10:00:00.000Z',
    })

    await expect(prepareInitialOutbox('reader-1')).resolves.toBe(0)
    expect(await getOutboxOperations()).toEqual([])
  })

  it('does not put an already-synced channel back into the outbox', async () => {
    const book = createBook({
      id: 'book-1', title: '已经收过的书目', author: '', source: 'marginalia', status: 'wish',
    })
    await withStoresTransaction(['books', 'annotations'], 'readwrite', (transaction) => {
      transaction.objectStore('books').put(book)
      transaction.objectStore('annotations').put(note)
    })
    await saveSyncState({
      remoteUserId: 'reader-1', lastPulledChangeId: 3,
      profileBookInitialSyncCompletedAt: '2026-09-01T10:00:00.000Z',
    })

    await expect(prepareInitialOutbox('reader-1')).resolves.toBe(1)
    expect(await getOutboxOperations()).toEqual([
      expect.objectContaining({ entityKey: 'annotation:note-1' }),
    ])

    await withTransaction('outbox', 'readwrite', (store) => store.clear())
    await saveSyncState({
      remoteUserId: 'reader-1', lastPulledChangeId: 4,
      profileBookInitialSyncCompletedAt: '2026-09-01T10:00:00.000Z',
      structuredInitialSyncCompletedAt: '2026-09-05T10:00:00.000Z',
    })
    await expect(prepareInitialOutbox('reader-1')).resolves.toBe(0)
    expect(await getOutboxOperations()).toEqual([])
  })
})
