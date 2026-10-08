import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const directory = mkdtempSync(join(tmpdir(), 'marginalia-local-'))
process.env.MARGINALIA_LOCAL_DIR = directory

const {
  deleteReaderRecordsForBook, getEpubFile, listEpubFiles, mergeSnapshot, openLibrary,
  putEpubFile, readCollection, replaceSnapshot,
} = await import('./db.mjs')
const { closeBook, getBook, leaveTrace, readBook } = await import('./reader.mjs')

test.after(() => rmSync(directory, { recursive: true, force: true }))

test('固定文件可供网页快照与 MCP 阅读闭环共同使用', () => {
  const db = openLibrary()
  replaceSnapshot(db, {
    books: [{ id: 'book-1', title: '雨夜', author: '小G' }],
    chapters: [{
      id: 'book-1:0', bookId: 'book-1', index: 0, title: '雨落下来',
      inToc: true, html: '<h1>雨落下来</h1><p>雨先敲了三下窗。</p><p>灯随后亮起来。</p>',
    }],
  })

  assert.equal(getBook(db, 'book-1', 'xiaoyu').chapters[0].title, '雨落下来')
  const window = readBook(db, 'book-1', 'xiaoyu', undefined, 200)
  assert.match(window.blocks.map((block) => block.text).join(''), /雨先敲了三下窗/)

  leaveTrace(db, {
    bookId: 'book-1', readerId: 'xiaoyu',
    rangeId: window.blocks[0].rangeId, quote: '雨先敲了三下窗。',
    kind: 'annotation', text: '我想记住这个开头。',
  })
  closeBook(db, {
    bookId: 'book-1', readerId: 'xiaoyu', cursor: window.endCursor,
    state: { understanding: '雨让房间醒来。', feeling: '安静。', questions: [], attention: ['灯'] },
  })

  assert.equal(readCollection(db, 'readerTraces').length, 1)
  assert.equal(readCollection(db, 'readerTraces')[0].locator.position.selectedText, '雨先敲了三下窗。')
  assert.throws(() => leaveTrace(db, {
    bookId: 'book-1', readerId: 'xiaoyu',
    rangeId: window.blocks[0].rangeId, quote: '雨先敲了', kind: 'highlight',
  }), /完整的一句或连续几句/)
  assert.equal(getBook(db, 'book-1', 'xiaoyu').reader.state.attention[0], '灯')

  deleteReaderRecordsForBook(db, 'book-1', false)
  assert.equal(readCollection(db, 'readerProgress').length, 0)
  assert.equal(readCollection(db, 'readerStates').length, 0)
  assert.equal(readCollection(db, 'readerTraces').length, 1)

  deleteReaderRecordsForBook(db, 'book-1', true)
  assert.equal(readCollection(db, 'readerTraces').length, 0)

  mergeSnapshot(db, { books: [{ id: 'book-2', title: '第二本书' }] })
  assert.equal(readCollection(db, 'books').length, 2)
  putEpubFile(db, 'book-1', Buffer.from('epub-bytes'))
  assert.equal(listEpubFiles(db)[0].size, 10)
  assert.deepEqual(Buffer.from(getEpubFile(db, 'book-1').data), Buffer.from('epub-bytes'))
  db.close()
})
