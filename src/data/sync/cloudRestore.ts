import type { SupabaseClient } from '@supabase/supabase-js'
import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { Highlight } from '../../domain/highlight'
import type { Marginalia } from '../../domain/marginalia'
import type { ReadingProgress } from '../../domain/readingProgress'
import { withStoresTransaction } from '../local/db'
import type { StoredChapter, StoredEpubFile } from '../local/bookStore'
import type { StoredProfile } from '../local/profileStore'
import { getOutboxOperations } from '../local/syncStore'
import {
  annotationPayload,
  bookmarkPayload,
  bookPayload,
  chapterPayload,
  highlightPayload,
  marginaliaPayload,
  profilePayload,
  readingPayload,
} from '../remote/cloudInkRemote'
import type { Database, Tables } from '../remote/database.types'
import type { SyncState } from './operations'

type CloudBook = Tables<'books'>

export type CloudRestoreSnapshot = {
  profile?: StoredProfile
  books: Book[]
  chapters: StoredChapter[]
  readingProgress: ReadingProgress[]
  bookmarks: Array<{ bookId: string; locator: unknown; updatedAt: string }>
  highlights: Highlight[]
  annotations: Annotation[]
  marginalia: Marginalia[]
  epubFiles: StoredEpubFile[]
  cursor: number
}

export type CloudRestoreResult = {
  books: number
  chapters: number
  traces: number
  files: number
}

export interface CloudRestoreGateway {
  prepareSnapshot(remoteUserId: string): Promise<CloudRestoreSnapshot>
}

function expectData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('云端没有返回预期数据')
  return data
}

const RESTORE_PAGE_SIZE = 500

async function collectPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += RESTORE_PAGE_SIZE) {
    const page = await load(from, from + RESTORE_PAGE_SIZE - 1)
    const data = expectData(page.data, page.error)
    rows.push(...data)
    if (data.length < RESTORE_PAGE_SIZE) return rows
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('云端封面暂时无法打开'))
    reader.readAsDataURL(blob)
  })
}

/** 先把数据库行与私有文件完整取到内存；任何下载失败都不会碰本机书房。 */
export function createSupabaseCloudRestoreGateway(
  client: SupabaseClient<Database>,
): CloudRestoreGateway {
  return {
    async prepareSnapshot(remoteUserId) {
      const [profileResult, cloudBooks, chapterRows, positionRows, bookmarkRows,
        highlightRows, annotationRows, marginaliaRows, cursorResult] = await Promise.all([
        client.from('profiles').select('*').maybeSingle(),
        collectPages<Tables<'books'>>((from, to) => client.from('books').select('*').is('deleted_at', null).order('id').range(from, to)),
        collectPages<Tables<'book_sections'>>((from, to) => client.from('book_sections').select('*').is('deleted_at', null).order('id').range(from, to)),
        collectPages<Tables<'reading_positions'>>((from, to) => client.from('reading_positions').select('*').is('deleted_at', null).order('book_id').range(from, to)),
        collectPages<Tables<'bookmarks'>>((from, to) => client.from('bookmarks').select('*').is('deleted_at', null).order('book_id').range(from, to)),
        collectPages<Tables<'highlights'>>((from, to) => client.from('highlights').select('*').is('deleted_at', null).order('id').range(from, to)),
        collectPages<Tables<'annotations'>>((from, to) => client.from('annotations').select('*').is('deleted_at', null).order('id').range(from, to)),
        collectPages<Tables<'marginalia'>>((from, to) => client.from('marginalia').select('*').is('deleted_at', null).order('id').range(from, to)),
        client.from('sync_changes').select('change_id').order('change_id', { ascending: false }).limit(1).maybeSingle(),
      ])
      const profile = profileResult.error ? (() => { throw new Error(profileResult.error.message) })() : profileResult.data
      if (cursorResult.error) throw new Error(cursorResult.error.message)
      if (!cloudBooks.length) throw new Error('云端书房里还没有可恢复的书')

      const chaptersByBook = new Set(chapterRows.map((row) => row.book_id))
      for (const book of cloudBooks) {
        if (!chaptersByBook.has(book.id)) throw new Error(`《${book.title}》的云端正文还不完整，已停止恢复`)
        if (!book.epub_path) throw new Error(`《${book.title}》的 EPUB 原书还未收好，已停止恢复`)
        const expectedRoot = `${remoteUserId}/books/${book.id}/`
        if (!book.epub_path.startsWith(expectedRoot)
          || (book.cover_path && !book.cover_path.startsWith(expectedRoot))) {
          throw new Error(`《${book.title}》的私有文件位置不正确，已停止恢复`)
        }
      }

      const downloaded = await Promise.all(cloudBooks.map(async (book) => {
        const epubResult = await client.storage.from('library').download(book.epub_path as string)
        const epub = expectData(epubResult.data, epubResult.error)
        let coverUrl: string | undefined
        if (book.cover_path) {
          const coverResult = await client.storage.from('library').download(book.cover_path)
          coverUrl = await blobToDataUrl(expectData(coverResult.data, coverResult.error))
        }
        return { book, epub, coverUrl }
      }))
      const coverByBook = new Map(downloaded.map(({ book, coverUrl }) => [book.id, coverUrl]))
      const now = new Date().toISOString()
      return {
        ...(profile ? { profile: profilePayload(profile) } : {}),
        books: cloudBooks.map((row: CloudBook) => ({
          ...bookPayload(row),
          ...(coverByBook.get(row.id) ? { coverUrl: coverByBook.get(row.id) } : {}),
        })),
        chapters: chapterRows.map(chapterPayload),
        readingProgress: positionRows.map(readingPayload),
        bookmarks: bookmarkRows.map(bookmarkPayload),
        highlights: highlightRows.map(highlightPayload),
        annotations: annotationRows.map(annotationPayload),
        marginalia: marginaliaRows.map(marginaliaPayload),
        epubFiles: downloaded.map(({ book, epub }) => ({ bookId: book.id, file: epub, addedAt: now })),
        cursor: cursorResult.data?.change_id ?? 0,
      }
    },
  }
}

/** 云端快照确认完整后，用一个 IndexedDB 事务替换全部可同步内容。 */
export async function restoreCloudLibraryWithGateway(
  gateway: CloudRestoreGateway,
  remoteUserId: string,
): Promise<CloudRestoreResult> {
  if ((await getOutboxOperations()).length) {
    throw new Error('这台设备还有尚未寄出的内容，请先立即收好再恢复')
  }
  const snapshot = await gateway.prepareSnapshot(remoteUserId)
  const storeNames = [
    'profiles', 'books', 'epubFiles', 'chapters', 'readingProgress', 'bookmarks',
    'highlights', 'annotations', 'marginalia', 'outbox', 'syncState',
  ]
  const now = new Date().toISOString()
  await withStoresTransaction(storeNames, 'readwrite', (transaction) => {
    for (const name of storeNames) transaction.objectStore(name).clear()
    if (snapshot.profile) transaction.objectStore('profiles').put(snapshot.profile)
    for (const item of snapshot.books) transaction.objectStore('books').put(item)
    for (const item of snapshot.epubFiles) transaction.objectStore('epubFiles').put(item)
    for (const item of snapshot.chapters) transaction.objectStore('chapters').put(item)
    for (const item of snapshot.readingProgress) transaction.objectStore('readingProgress').put(item)
    for (const item of snapshot.bookmarks) transaction.objectStore('bookmarks').put(item)
    for (const item of snapshot.highlights) transaction.objectStore('highlights').put(item)
    for (const item of snapshot.annotations) transaction.objectStore('annotations').put(item)
    for (const item of snapshot.marginalia) transaction.objectStore('marginalia').put(item)
    transaction.objectStore('syncState').put({
      remoteUserId,
      lastPulledChangeId: snapshot.cursor,
      lastSuccessfulSyncAt: now,
      profileBookInitialSyncCompletedAt: now,
      structuredInitialSyncCompletedAt: now,
      initialSyncCompletedAt: now,
    } satisfies SyncState)
  })
  return {
    books: snapshot.books.length,
    chapters: snapshot.chapters.length,
    traces: snapshot.highlights.length + snapshot.annotations.length + snapshot.marginalia.length,
    files: snapshot.epubFiles.length,
  }
}

export function restoreCloudLibrary(
  client: SupabaseClient<Database>,
  remoteUserId: string,
): Promise<CloudRestoreResult> {
  return restoreCloudLibraryWithGateway(createSupabaseCloudRestoreGateway(client), remoteUserId)
}
