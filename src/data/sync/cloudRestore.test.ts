import { describe, expect, it } from 'vitest'
import { createBook } from '../../domain/book'
import { getAllBooks, getChapters, getEpubFile, saveBook } from '../local/bookStore'
import { withTransaction } from '../local/db'
import { getOutboxOperations, getSyncState } from '../local/syncStore'
import {
  restoreCloudLibraryWithGateway,
  type CloudRestoreGateway,
  type CloudRestoreSnapshot,
} from './cloudRestore'

const oldBook = createBook({
  id: 'old', title: '本机旧书', author: '小狐狸', source: 'marginalia', status: 'reading',
}, '2026-09-01T00:00:00.000Z')
const cloudBook = createBook({
  id: 'cloud', title: '云端完整书', author: '小G', source: 'marginalia', status: 'reading',
}, '2026-09-02T00:00:00.000Z')

function snapshot(): CloudRestoreSnapshot {
  return {
    books: [cloudBook],
    chapters: [{
      id: 'cloud:0', bookId: 'cloud', index: 0, title: '第一章', href: 'one.xhtml', html: '<p>正文</p>',
    }],
    readingProgress: [], bookmarks: [], highlights: [], annotations: [], marginalia: [],
    epubFiles: [{
      bookId: 'cloud', file: new Blob(['epub'], { type: 'application/epub+zip' }),
      addedAt: '2026-09-02T00:00:00.000Z',
    }],
    cursor: 42,
  }
}

class PreparedGateway implements CloudRestoreGateway {
  private readonly value: CloudRestoreSnapshot
  constructor(value: CloudRestoreSnapshot = snapshot()) { this.value = value }
  async prepareSnapshot() { return this.value }
}

describe('complete cloud recovery', () => {
  it('atomically replaces the local library and records the restored cursor', async () => {
    await withTransaction('books', 'readwrite', (store) => store.put(oldBook))

    await expect(restoreCloudLibraryWithGateway(new PreparedGateway(), 'reader-1')).resolves.toEqual({
      books: 1, chapters: 1, traces: 0, files: 1,
    })
    expect((await getAllBooks()).map((book) => book.id)).toEqual(['cloud'])
    expect(await getChapters('cloud')).toHaveLength(1)
    expect(await getEpubFile('cloud')).toBeDefined()
    expect(await getSyncState('reader-1')).toMatchObject({ lastPulledChangeId: 42 })
    expect(await getOutboxOperations()).toEqual([])
  })

  it('refuses to overwrite local changes that have not reached the cloud', async () => {
    await saveBook(oldBook)
    let prepared = false
    const gateway: CloudRestoreGateway = {
      async prepareSnapshot() { prepared = true; return snapshot() },
    }

    await expect(restoreCloudLibraryWithGateway(gateway, 'reader-1')).rejects.toThrow('尚未寄出')
    expect(prepared).toBe(false)
    expect((await getAllBooks()).map((book) => book.id)).toEqual(['old'])
  })

  it('leaves the local library untouched when preparing cloud files fails', async () => {
    await withTransaction('books', 'readwrite', (store) => store.put(oldBook))
    const gateway: CloudRestoreGateway = {
      async prepareSnapshot() { throw new Error('EPUB 下载失败') },
    }

    await expect(restoreCloudLibraryWithGateway(gateway, 'reader-1')).rejects.toThrow('EPUB 下载失败')
    expect((await getAllBooks()).map((book) => book.id)).toEqual(['old'])
  })
  it('整库恢复带回来访与合书锚点，清除旧读者孤儿数据且不产生待寄',async()=>{
    const snap=snapshot()
    const loc={bookId:'cloud',position:{chapterIndex:0,elementPath:[0],textOffset:0,selectedText:'正文',beforeContext:'',afterContext:''}}
    snap.readerStates=[{readerId:'xiaog',bookId:'cloud',cursor:'p1:0:0:0',locator:loc,understanding:'书',feeling:'',questions:[],attention:[],updatedAt:'2026-10-19T00:00:00Z'}]
    snap.readerSessions=[{id:'visit',readerId:'xiaog',bookId:'cloud',mode:'reading',startedAt:'2026-10-19T00:00:00Z',updatedAt:'2026-10-19T00:00:00Z',characterCount:2,traceCount:0,viewedAnnotationIds:[]}]
    await withTransaction('readerSessions','readwrite',store=>store.put({...snap.readerSessions![0],id:'old',bookId:'missing'}))
    await restoreCloudLibraryWithGateway(new PreparedGateway(snap),'reader')
    expect(await withTransaction('readerSessions','readonly',s=>s.getAll())).toEqual(snap.readerSessions)
    expect(await withTransaction('readerStates','readonly',s=>s.get('xiaog:cloud'))).toMatchObject({cursor:'p1:0:0:0',locator:loc})
    expect(await getOutboxOperations()).toEqual([])
  })

})
