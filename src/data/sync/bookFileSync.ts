import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAllBooks,
  getBook,
  getEpubFile,
  restoreBookCoverFromCloud,
  restoreEpubFileFromCloud,
} from '../local/bookStore'
import {
  acknowledgeOutboxOperations,
  getOutboxOperations,
  getSyncState,
  markOutboxAttempt,
  saveSyncState,
} from '../local/syncStore'
import type { Database } from '../remote/database.types'

const LIBRARY_BUCKET = 'library'

export type CloudBookFiles = { id: string; epubPath?: string; coverPath?: string }

export interface BookFileGateway {
  upload(path: string, file: Blob, contentType: string): Promise<void>
  setBookPaths(bookId: string, epubPath: string, coverPath?: string): Promise<void>
  listBookFiles(): Promise<CloudBookFiles[]>
  download(path: string): Promise<Blob>
}

export type BookFileSyncResult = {
  uploadedBooks: number
  downloadedEpubs: number
  downloadedCovers: number
}

function expectData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('云端没有返回预期数据')
  return data
}

/** Storage 路径只使用登录账号与稳定 bookId，不把书名等用户文字带进对象名。 */
export function createSupabaseBookFileGateway(
  client: SupabaseClient<Database>,
): BookFileGateway {
  return {
    async upload(path, file, contentType) {
      const { error } = await client.storage.from(LIBRARY_BUCKET).upload(path, file, {
        contentType,
        upsert: true,
      })
      if (error) throw new Error(error.message)
    },
    async setBookPaths(bookId, epubPath, coverPath) {
      const { data, error } = await client.from('books').update({
        epub_path: epubPath,
        ...(coverPath ? { cover_path: coverPath } : {}),
      }).eq('id', bookId).is('deleted_at', null).select('id').maybeSingle()
      const updated = expectData(data, error)
      if (!updated) throw new Error('云端没有找到这本书，原书暂未确认收好')
    },
    async listBookFiles() {
      const { data, error } = await client.from('books')
        .select('id, epub_path, cover_path').is('deleted_at', null)
      return expectData(data, error).map((book) => ({
        id: book.id,
        ...(book.epub_path ? { epubPath: book.epub_path } : {}),
        ...(book.cover_path ? { coverPath: book.cover_path } : {}),
      }))
    },
    async download(path) {
      const { data, error } = await client.storage.from(LIBRARY_BUCKET).download(path)
      return expectData(data, error)
    },
  }
}

function coverExtension(contentType: string): string | null {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return null
}

async function coverUrlToBlob(coverUrl: string): Promise<Blob> {
  const response = await fetch(coverUrl)
  if (!response.ok) throw new Error('本机封面暂时无法读取')
  return response.blob()
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('云端封面暂时无法打开'))
    reader.readAsDataURL(blob)
  })
}

export async function syncPrivateBookFilesWithGateway(
  gateway: BookFileGateway,
  remoteUserId: string,
): Promise<BookFileSyncResult> {
  const pending = (await getOutboxOperations()).filter((operation) => (
    operation.entityType === 'epubFile' && operation.operation === 'upload_file'
  ))
  let uploadedBooks = 0

  for (const operation of pending) {
    try {
      const [epub, book] = await Promise.all([
        getEpubFile(operation.entityId),
        getBook(operation.entityId),
      ])
      if (!epub || !book) throw new Error('本机找不到这本书的 EPUB 原文件')
      const root = `${remoteUserId}/books/${book.id}`
      const epubPath = `${root}/book.epub`
      await gateway.upload(epubPath, epub, 'application/epub+zip')

      let coverPath: string | undefined
      if (book.coverUrl) {
        const cover = await coverUrlToBlob(book.coverUrl)
        const extension = coverExtension(cover.type)
        if (extension) {
          coverPath = `${root}/cover.${extension}`
          await gateway.upload(coverPath, cover, cover.type)
        }
      }
      await gateway.setBookPaths(book.id, epubPath, coverPath)
      await acknowledgeOutboxOperations([operation.operationId])
      uploadedBooks += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await markOutboxAttempt(operation.operationId, message)
      throw error
    }
  }

  const localBooks = new Map((await getAllBooks()).map((book) => [book.id, book]))
  const cloudBooks = await gateway.listBookFiles()
  let downloadedEpubs = 0
  let downloadedCovers = 0
  for (const cloud of cloudBooks) {
    const local = localBooks.get(cloud.id)
    if (!local) continue
    if (cloud.epubPath && !(await getEpubFile(cloud.id))) {
      await restoreEpubFileFromCloud(cloud.id, await gateway.download(cloud.epubPath))
      downloadedEpubs += 1
    }
    if (cloud.coverPath && !local.coverUrl) {
      const cover = await gateway.download(cloud.coverPath)
      if (await restoreBookCoverFromCloud(cloud.id, await blobToDataUrl(cover))) downloadedCovers += 1
    }
  }

  const now = new Date().toISOString()
  const state = await getSyncState(remoteUserId)
  await saveSyncState({
    remoteUserId,
    lastPulledChangeId: state?.lastPulledChangeId ?? 0,
    ...(state?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: state.lastSuccessfulSyncAt } : {}),
    ...(state?.profileBookInitialSyncCompletedAt
      ? { profileBookInitialSyncCompletedAt: state.profileBookInitialSyncCompletedAt }
      : {}),
    ...(state?.structuredInitialSyncCompletedAt
      ? { structuredInitialSyncCompletedAt: state.structuredInitialSyncCompletedAt }
      : {}),
    initialSyncCompletedAt: state?.initialSyncCompletedAt ?? now,
  })
  return { uploadedBooks, downloadedEpubs, downloadedCovers }
}

export async function syncPrivateBookFiles(
  client: SupabaseClient<Database>,
  remoteUserId: string,
): Promise<BookFileSyncResult> {
  return syncPrivateBookFilesWithGateway(createSupabaseBookFileGateway(client), remoteUserId)
}
