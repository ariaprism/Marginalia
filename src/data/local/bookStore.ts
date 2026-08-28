import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { Chapter } from '../../domain/chapter'
import type { Highlight } from '../../domain/highlight'
import type { Marginalia } from '../../domain/marginalia'
import type { ReadingProgress } from '../../domain/readingProgress'
import { createSyncOperation, type SyncEntityType } from '../sync/operations'
import { getAllByIndex, openMarginaliaDB, withStoresTransaction, withTransaction } from './db'
import { putOutboxOperation } from './syncStore'

export type StoredEpubFile = {
  bookId: string
  file: Blob
  addedAt: string
}

export type StoredChapter = Chapter & {
  bookId: string
  id: string
}

type StoredBookmark = NonNullable<ReadingProgress['bookmark']> & { bookId: string }

function chapterId(bookId: string, index: number): string {
  return `${bookId}:${index}`
}

export async function saveBook(book: Book): Promise<void> {
  await putRecordWithOutbox('books', 'book', book.id, book, book.updatedAt)
}

async function putRecordWithOutbox<T>(
  storeName: string,
  entityType: SyncEntityType,
  entityId: string,
  record: T,
  occurredAt?: string,
): Promise<void> {
  await withStoresTransaction([storeName, 'outbox'], 'readwrite', (transaction) => {
    transaction.objectStore(storeName).put(record)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType, entityId, operation: 'upsert', payload: record, occurredAt,
    }))
  })
}

async function deleteRecordWithOutbox(
  storeName: string,
  entityType: SyncEntityType,
  entityId: string,
  occurredAt = new Date().toISOString(),
): Promise<void> {
  await withStoresTransaction([storeName, 'outbox'], 'readwrite', (transaction) => {
    transaction.objectStore(storeName).delete(entityId)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType, entityId, operation: 'delete', occurredAt,
    }))
  })
}

export async function getBook(id: string): Promise<Book | undefined> {
  return withTransaction('books', 'readonly', (store) => store.get(id))
}

export async function getAllBooks(): Promise<Book[]> {
  return withTransaction('books', 'readonly', (store) => store.getAll())
}

export async function touchBook(
  bookId: string,
  now = new Date().toISOString(),
  status?: Book['status'],
): Promise<Book | undefined> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books', 'outbox'], 'readwrite')
    const store = transaction.objectStore('books')
    const request = store.get(bookId)
    let touched: Book | undefined
    request.onsuccess = () => {
      const book = request.result as Book | undefined
      if (!book) return
      touched = { ...book, lastOpenedAt: now, status: status ?? book.status, updatedAt: now }
      store.put(touched)
      putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
        entityType: 'book', entityId: bookId, operation: 'upsert', payload: touched, occurredAt: now,
      }))
    }
    transaction.oncomplete = () => resolve(touched)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('记录最近打开时间的事务已中止'))
  })
}

export async function setBookPinned(
  bookId: string,
  pinned: boolean,
  now = new Date().toISOString(),
): Promise<Book | undefined> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books', 'outbox'], 'readwrite')
    const store = transaction.objectStore('books')
    const request = store.get(bookId)
    let updated: Book | undefined
    request.onsuccess = () => {
      const book = request.result as Book | undefined
      if (!book) return
      updated = { ...book, pinnedAt: pinned ? now : undefined, updatedAt: now }
      store.put(updated)
      putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
        entityType: 'book', entityId: bookId, operation: 'upsert', payload: updated, occurredAt: now,
      }))
    }
    transaction.oncomplete = () => resolve(updated)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('更新书籍置顶状态的事务已中止'))
  })
}

export async function setBookStatus(
  bookId: string,
  status: Book['status'],
  now = new Date().toISOString(),
): Promise<Book | undefined> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['books', 'outbox'], 'readwrite')
    const store = transaction.objectStore('books')
    const request = store.get(bookId)
    let updated: Book | undefined
    request.onsuccess = () => {
      const book = request.result as Book | undefined
      if (!book) return
      updated = { ...book, status, updatedAt: now }
      store.put(updated)
      putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
        entityType: 'book', entityId: bookId, operation: 'upsert', payload: updated, occurredAt: now,
      }))
    }
    transaction.oncomplete = () => resolve(updated)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('更新书籍阅读状态的事务已中止'))
  })
}

export async function saveEpubFile(bookId: string, file: Blob): Promise<void> {
  const record: StoredEpubFile = { bookId, file, addedAt: new Date().toISOString() }
  await withStoresTransaction(['epubFiles', 'outbox'], 'readwrite', (transaction) => {
    transaction.objectStore('epubFiles').put(record)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType: 'epubFile', entityId: bookId, operation: 'upload_file', payload: { bookId }, occurredAt: record.addedAt,
    }))
  })
}

export async function getEpubFile(bookId: string): Promise<Blob | undefined> {
  const record = await withTransaction('epubFiles', 'readonly', (store) => store.get(bookId))
  return (record as StoredEpubFile | undefined)?.file
}

export async function saveChapters(bookId: string, chapters: Chapter[]): Promise<void> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chapters', 'outbox'], 'readwrite')
    const store = transaction.objectStore('chapters')
    for (const chapter of chapters) {
      const record: StoredChapter = { ...chapter, bookId, id: chapterId(bookId, chapter.index) }
      store.put(record)
      putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
        entityType: 'chapter', entityId: record.id, operation: 'upsert', payload: record,
      }))
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function getChapters(bookId: string): Promise<Chapter[]> {
  const records = await getAllByIndex<StoredChapter>('chapters', 'bookId', bookId)
  return records
    .sort((a, b) => a.index - b.index)
    .map(({ bookId: _, ...chapter }) => chapter)
}

export async function saveReadingProgress(progress: ReadingProgress): Promise<void> {
  const { bookmark, ...resumeProgress } = progress
  const db = await openMarginaliaDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['readingProgress', 'bookmarks', 'outbox'], 'readwrite')
    transaction.objectStore('readingProgress').put(resumeProgress)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType: 'readingProgress',
      entityId: progress.bookId,
      operation: 'upsert',
      payload: resumeProgress,
      occurredAt: progress.updatedAt,
    }))

    const bookmarkStore = transaction.objectStore('bookmarks')
    if (bookmark) {
      const record: StoredBookmark = { bookId: progress.bookId, ...bookmark }
      const request = bookmarkStore.get(progress.bookId)
      request.onsuccess = () => {
        const existing = request.result as StoredBookmark | undefined
        // 正常翻页会反复保存 ReadingProgress，但没有移动的折页不应反复产生纸条。
        if (existing?.updatedAt === bookmark.updatedAt) return
        bookmarkStore.put(record)
        putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
          entityType: 'bookmark',
          entityId: progress.bookId,
          operation: 'upsert',
          payload: record,
          occurredAt: bookmark.updatedAt,
        }))
      }
    } else {
      const request = bookmarkStore.get(progress.bookId)
      request.onsuccess = () => {
        if (!request.result) return
        bookmarkStore.delete(progress.bookId)
        putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
          entityType: 'bookmark',
          entityId: progress.bookId,
          operation: 'delete',
          occurredAt: progress.updatedAt,
        }))
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('保存阅读位置的事务已中止'))
  })
}

export async function getReadingProgress(bookId: string): Promise<ReadingProgress | undefined> {
  const [progress, bookmark] = await Promise.all([
    withTransaction<ReadingProgress | undefined>('readingProgress', 'readonly', (store) => store.get(bookId)),
    withTransaction<StoredBookmark | undefined>('bookmarks', 'readonly', (store) => store.get(bookId)),
  ])
  if (!progress) return undefined
  return bookmark
    ? { ...progress, bookmark: { locator: bookmark.locator, updatedAt: bookmark.updatedAt } }
    : progress
}

export async function getAllReadingProgress(): Promise<ReadingProgress[]> {
  const [progress, bookmarks] = await Promise.all([
    withTransaction<ReadingProgress[]>('readingProgress', 'readonly', (store) => store.getAll()),
    withTransaction<StoredBookmark[]>('bookmarks', 'readonly', (store) => store.getAll()),
  ])
  const byBook = new Map(bookmarks.map((bookmark) => [bookmark.bookId, bookmark]))
  return progress.map((item) => {
    const bookmark = byBook.get(item.bookId)
    return bookmark
      ? { ...item, bookmark: { locator: bookmark.locator, updatedAt: bookmark.updatedAt } }
      : item
  })
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  await putRecordWithOutbox('highlights', 'highlight', highlight.id, highlight, highlight.updatedAt)
}

export async function getHighlights(bookId: string): Promise<Highlight[]> {
  return getAllByIndex('highlights', 'bookId', bookId)
}

export async function deleteHighlight(id: string): Promise<void> {
  await deleteRecordWithOutbox('highlights', 'highlight', id)
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  await putRecordWithOutbox('annotations', 'annotation', annotation.id, annotation, annotation.updatedAt)
}

export async function getAnnotations(bookId: string): Promise<Annotation[]> {
  return getAllByIndex('annotations', 'bookId', bookId)
}

export async function deleteAnnotation(id: string): Promise<void> {
  await deleteRecordWithOutbox('annotations', 'annotation', id)
}

export async function saveMarginalia(marginalia: Marginalia): Promise<void> {
  await putRecordWithOutbox('marginalia', 'marginalia', marginalia.id, marginalia, marginalia.updatedAt)
}

export async function getMarginalia(bookId: string): Promise<Marginalia[]> {
  return getAllByIndex('marginalia', 'bookId', bookId)
}

export async function deleteMarginalia(id: string): Promise<void> {
  await deleteRecordWithOutbox('marginalia', 'marginalia', id)
}

function deleteByBookIndex(store: IDBObjectStore, bookId: string) {
  const request = store.index('bookId').openCursor(IDBKeyRange.only(bookId))
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }
}

/**
 * 完整移出一本书。
 *
 * 所有删除放在同一个事务中：任何一步失败，书籍、EPUB、章节和痕迹会一起回滚，
 * 不会留下只有批注没有正文的孤儿记录。
 */
export async function deleteBookCompletely(bookId: string): Promise<void> {
  const db = await openMarginaliaDB()
  const storeNames = [
    'books',
    'epubFiles',
    'chapters',
    'readingProgress',
    'bookmarks',
    'highlights',
    'annotations',
    'marginalia',
    'outbox',
  ]
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite')
    transaction.objectStore('books').delete(bookId)
    transaction.objectStore('epubFiles').delete(bookId)
    transaction.objectStore('readingProgress').delete(bookId)
    transaction.objectStore('bookmarks').delete(bookId)
    deleteByBookIndex(transaction.objectStore('chapters'), bookId)
    deleteByBookIndex(transaction.objectStore('highlights'), bookId)
    deleteByBookIndex(transaction.objectStore('annotations'), bookId)
    deleteByBookIndex(transaction.objectStore('marginalia'), bookId)
    putOutboxOperation(transaction.objectStore('outbox'), createSyncOperation({
      entityType: 'book', entityId: bookId, operation: 'delete',
    }))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('删除书籍事务已中止'))
  })
}
