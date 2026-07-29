import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { Chapter } from '../../domain/chapter'
import type { Highlight } from '../../domain/highlight'
import type { Marginalia } from '../../domain/marginalia'
import type { ReadingProgress } from '../../domain/readingProgress'
import { getAllByIndex, openMarginaliaDB, withTransaction } from './db'

export type StoredEpubFile = {
  bookId: string
  file: Blob
  addedAt: string
}

export type StoredChapter = Chapter & {
  bookId: string
  id: string
}

function chapterId(bookId: string, index: number): string {
  return `${bookId}:${index}`
}

export async function saveBook(book: Book): Promise<void> {
  await withTransaction('books', 'readwrite', (store) => store.put(book))
}

export async function getBook(id: string): Promise<Book | undefined> {
  return withTransaction('books', 'readonly', (store) => store.get(id))
}

export async function getAllBooks(): Promise<Book[]> {
  return withTransaction('books', 'readonly', (store) => store.getAll())
}

export async function touchBook(bookId: string, now = new Date().toISOString()): Promise<Book | undefined> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('books', 'readwrite')
    const store = transaction.objectStore('books')
    const request = store.get(bookId)
    let touched: Book | undefined
    request.onsuccess = () => {
      const book = request.result as Book | undefined
      if (!book) return
      touched = { ...book, lastOpenedAt: now, updatedAt: now }
      store.put(touched)
    }
    transaction.oncomplete = () => resolve(touched)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('记录最近打开时间的事务已中止'))
  })
}

export async function saveEpubFile(bookId: string, file: Blob): Promise<void> {
  const record: StoredEpubFile = { bookId, file, addedAt: new Date().toISOString() }
  await withTransaction('epubFiles', 'readwrite', (store) => store.put(record))
}

export async function getEpubFile(bookId: string): Promise<Blob | undefined> {
  const record = await withTransaction('epubFiles', 'readonly', (store) => store.get(bookId))
  return (record as StoredEpubFile | undefined)?.file
}

export async function saveChapters(bookId: string, chapters: Chapter[]): Promise<void> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chapters', 'readwrite')
    const store = transaction.objectStore('chapters')
    for (const chapter of chapters) {
      const record: StoredChapter = { ...chapter, bookId, id: chapterId(bookId, chapter.index) }
      store.put(record)
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
  await withTransaction('readingProgress', 'readwrite', (store) => store.put(progress))
}

export async function getReadingProgress(bookId: string): Promise<ReadingProgress | undefined> {
  return withTransaction('readingProgress', 'readonly', (store) => store.get(bookId))
}

export async function getAllReadingProgress(): Promise<ReadingProgress[]> {
  return withTransaction('readingProgress', 'readonly', (store) => store.getAll())
}

export async function saveHighlight(highlight: Highlight): Promise<void> {
  await withTransaction('highlights', 'readwrite', (store) => store.put(highlight))
}

export async function getHighlights(bookId: string): Promise<Highlight[]> {
  return getAllByIndex('highlights', 'bookId', bookId)
}

export async function deleteHighlight(id: string): Promise<void> {
  await withTransaction('highlights', 'readwrite', (store) => store.delete(id))
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  await withTransaction('annotations', 'readwrite', (store) => store.put(annotation))
}

export async function getAnnotations(bookId: string): Promise<Annotation[]> {
  return getAllByIndex('annotations', 'bookId', bookId)
}

export async function deleteAnnotation(id: string): Promise<void> {
  await withTransaction('annotations', 'readwrite', (store) => store.delete(id))
}

export async function saveMarginalia(marginalia: Marginalia): Promise<void> {
  await withTransaction('marginalia', 'readwrite', (store) => store.put(marginalia))
}

export async function getMarginalia(bookId: string): Promise<Marginalia[]> {
  return getAllByIndex('marginalia', 'bookId', bookId)
}

export async function deleteMarginalia(id: string): Promise<void> {
  await withTransaction('marginalia', 'readwrite', (store) => store.delete(id))
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
    'highlights',
    'annotations',
    'marginalia',
  ]
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite')
    transaction.objectStore('books').delete(bookId)
    transaction.objectStore('epubFiles').delete(bookId)
    transaction.objectStore('readingProgress').delete(bookId)
    deleteByBookIndex(transaction.objectStore('chapters'), bookId)
    deleteByBookIndex(transaction.objectStore('highlights'), bookId)
    deleteByBookIndex(transaction.objectStore('annotations'), bookId)
    deleteByBookIndex(transaction.objectStore('marginalia'), bookId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('删除书籍事务已中止'))
  })
}
