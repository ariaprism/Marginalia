import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../domain'
import { createBook } from '../../domain/book'
import { saveAnnotation, deleteAnnotation, getAnnotations } from './bookStore'
import { withStoresTransaction, withTransaction } from './db'
import {
  getOutboxOperations,
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
})
