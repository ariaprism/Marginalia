import { describe, expect, it } from 'vitest'
import { createBook } from '../../domain/book'
import {
  getBook,
  getEpubFile,
  saveBook,
  saveEpubFile,
} from '../local/bookStore'
import { getOutboxOperations } from '../local/syncStore'
import {
  syncPrivateBookFilesWithGateway,
  type BookFileGateway,
  type CloudBookFiles,
} from './bookFileSync'

class FakeBookFiles implements BookFileGateway {
  readonly objects = new Map<string, Blob>()
  readonly books = new Map<string, CloudBookFiles>()

  async upload(path: string, file: Blob): Promise<void> {
    this.objects.set(path, file)
  }

  async setBookPaths(bookId: string, epubPath: string, coverPath?: string): Promise<void> {
    this.books.set(bookId, { id: bookId, epubPath, ...(coverPath ? { coverPath } : {}) })
  }

  async listBookFiles(): Promise<CloudBookFiles[]> {
    return [...this.books.values()]
  }

  async download(path: string): Promise<Blob> {
    const file = this.objects.get(path)
    if (!file) throw new Error(`missing ${path}`)
    return file
  }
}

class RejectingBookFiles extends FakeBookFiles {
  override async setBookPaths(): Promise<void> {
    throw new Error('network down')
  }
}

describe('private EPUB and cover sync', () => {
  it('uploads to an account-owned stable path and only then clears the file outbox item', async () => {
    const book = createBook({
      id: 'book-1', title: '云端原书', author: '小G', source: 'marginalia',
      status: 'wish',
      coverUrl: 'data:image/png;base64,iVBORw0KGgo=',
    })
    await saveBook(book)
    await saveEpubFile(book.id, new Blob(['epub'], { type: 'application/epub+zip' }))
    const gateway = new FakeBookFiles()

    await expect(syncPrivateBookFilesWithGateway(gateway, 'reader-1')).resolves.toEqual({
      uploadedBooks: 1, downloadedEpubs: 0, downloadedCovers: 0,
    })
    expect(gateway.objects.has('reader-1/books/book-1/book.epub')).toBe(true)
    expect(gateway.objects.has('reader-1/books/book-1/cover.png')).toBe(true)
    expect((await getOutboxOperations()).some((item) => item.entityType === 'epubFile')).toBe(false)
  })

  it('fills a restored book with its private EPUB and cover without making new outbox items', async () => {
    const book = createBook({
      id: 'book-2', title: '取回原书', author: '小G', source: 'marginalia', status: 'wish',
    })
    await saveBook(book)
    const gateway = new FakeBookFiles()
    const epubPath = 'reader-1/books/book-2/book.epub'
    const coverPath = 'reader-1/books/book-2/cover.png'
    gateway.books.set(book.id, { id: book.id, epubPath, coverPath })
    gateway.objects.set(epubPath, new Blob(['restored epub'], { type: 'application/epub+zip' }))
    gateway.objects.set(coverPath, new Blob(['cover'], { type: 'image/png' }))
    const before = await getOutboxOperations()

    await expect(syncPrivateBookFilesWithGateway(gateway, 'reader-1')).resolves.toEqual({
      uploadedBooks: 0, downloadedEpubs: 1, downloadedCovers: 1,
    })
    expect(await getEpubFile(book.id)).toBeDefined()
    expect((await getBook(book.id))?.coverUrl).toMatch(/^data:image\/png;base64,/)
    expect(await getOutboxOperations()).toEqual(before)
  })

  it('keeps the original book pending when cloud confirmation fails', async () => {
    const book = createBook({
      id: 'book-3', title: '稍后再寄', author: '小G', source: 'marginalia', status: 'wish',
    })
    await saveBook(book)
    await saveEpubFile(book.id, new Blob(['epub'], { type: 'application/epub+zip' }))

    await expect(syncPrivateBookFilesWithGateway(new RejectingBookFiles(), 'reader-1'))
      .rejects.toThrow('network down')
    const fileOperation = (await getOutboxOperations()).find((item) => item.entityType === 'epubFile')
    expect(fileOperation).toMatchObject({ attempts: 1, lastError: 'network down' })
  })
})
