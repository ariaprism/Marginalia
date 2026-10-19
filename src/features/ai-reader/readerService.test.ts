import { withTransaction } from '../../data/local/db'
import { describe, expect, it } from 'vitest'
import { saveBook, saveChapters } from '../../data/local/bookStore'
import { getReaderTraces, saveReaderSession } from '../../data/local/readerStore'
import { createBook } from '../../domain/book'
import { createLocator } from '../../domain/locator'
import {
  AiReaderCursorError,
  closeBook,
  getBookOverview,
  leaveReaderTrace,
  readBookWindow,
  randomReaderAnnotations,
} from './readerService'

async function seedBook() {
  const book = createBook({
    id: 'reader-probe', title: '散步测试', author: '小G', language: 'zh-CN',
    description: '测试一个读者怎样走进一本书。', source: 'marginalia', status: 'wish',
  }, '2026-09-21T00:00:00.000Z')
  await saveBook(book)
  await saveChapters(book.id, [
    {
      id: 'title', index: 0, title: '书名页', inToc: false, href: 'title.xhtml',
      html: '<html><body><h1>散步测试</h1></body></html>',
    },
    {
      id: 'one', index: 1, title: '雨从窗外来', inToc: true, href: 'one.xhtml',
      html: `<html><body><h1>雨从窗外来</h1><p>第一段正文。第二句也落在窗边。</p><p>${'第二段比第一段稍微长一点。'.repeat(30)}</p></body></html>`,
    },
    {
      id: 'two', index: 2, title: '灯亮起来', inToc: true, href: 'two.xhtml',
      html: '<html><body><h1>灯亮起来</h1><p>第三段正文。</p></body></html>',
    },
  ])
  return book
}

describe('AI Reader 只读应用服务', () => {
  it('get_book 只返回原书目录，不把 spine 前置页冒充章节', async () => {
    const book = await seedBook()
    const overview = await getBookOverview(book.id, 'xiaoyu')

    expect(overview.book.title).toBe('散步测试')
    expect(overview.toc.map((item) => item.title)).toEqual(['雨从窗外来', '灯亮起来'])
    expect(overview.toc[0].cursor).toMatch(/^p1:1:/)
    expect(overview.reader).toMatchObject({ readerId: 'xiaoyu', position: null, state: null })
  })

  it('read 默认从第一个目录正文开始，返回可续读 cursor 与稳定 rangeId', async () => {
    const book = await seedBook()
    const first = await readBookWindow(book.id, { length: 200 })

    expect(first.blocks[0].chapterIndex).toBe(1)
    expect(first.blocks.map((block) => block.text).join('')).not.toContain('散步测试')
    expect(first.blocks[0].rangeId).toMatch(/^r1:1:/)
    expect(first.characterCount).toBe(200)
    expect(first.nextCursor).not.toBeNull()

    const repeated = await readBookWindow(book.id, { length: 200 })
    expect(repeated.blocks.map((block) => block.rangeId)).toEqual(first.blocks.map((block) => block.rangeId))

    const second = await readBookWindow(book.id, { cursor: first.nextCursor!, length: 200 })
    expect(second.blocks.map((block) => block.rangeId)).not.toEqual(first.blocks.map((block) => block.rangeId))
  })

  it('可以从 get_book 给出的目录 cursor 进入指定章节', async () => {
    const book = await seedBook()
    const overview = await getBookOverview(book.id, 'xiaoyu')
    const window = await readBookWindow(book.id, { cursor: overview.toc[1].cursor, length: 200 })

    expect(window.blocks[0]).toMatchObject({ chapterIndex: 2, chapterTitle: '灯亮起来' })
    expect(window.blocks.map((block) => block.text).join('')).toContain('第三段正文')
  })

  it('get_book 与 read 只恢复指定 readerId 自己的位置和 Reader State', async () => {
    const book = await seedBook()
    const updatedAt = '2026-09-22T09:00:00.000Z'
    await saveReaderSession({
      readerId: 'xiaoyu', bookId: book.id, updatedAt,
      locator: createLocator(book.id, {
        chapterIndex: 2, elementPath: [1], textOffset: 0,
        selectedText: '第三段正文。', beforeContext: '', afterContext: '',
      }),
    }, {
      readerId: 'xiaoyu', bookId: book.id, updatedAt,
      understanding: '灯像一次迟到的回应。', feeling: '想再坐一会儿。',
      questions: ['是谁开的灯？'], attention: ['灯'],
    })

    const fishOverview = await getBookOverview(book.id, 'xiaoyu')
    const foxOverview = await getBookOverview(book.id, 'aria')
    expect(fishOverview.reader.position?.cursor).toBe('p1:2:1:0')
    expect(fishOverview.reader.state?.attention).toEqual(['灯'])
    expect(foxOverview.reader).toMatchObject({ readerId: 'aria', position: null, state: null })

    const resumed = await readBookWindow(book.id, { readerId: 'xiaoyu', length: 200 })
    expect(resumed.blocks[0]).toMatchObject({ chapterIndex: 2, text: '第三段正文。' })
  })

  it('拒绝调用方伪造的 cursor', async () => {
    const book = await seedBook()
    await expect(readBookWindow(book.id, { cursor: 'chapter-two' }))
      .rejects.toBeInstanceOf(AiReaderCursorError)
    await expect(readBookWindow(book.id, { cursor: 'p1:99:0:0' }))
      .rejects.toBeInstanceOf(AiReaderCursorError)
  })

  it('可以留下真实书页痕迹，合书后由新调用从精确位置继续', async () => {
    const book = await seedBook()
    const first = await readBookWindow(book.id, { readerId: 'xiaoyu', length: 200 })
    const note = await leaveReaderTrace({
      bookId: book.id,
      readerId: 'xiaoyu',
      rangeId: first.blocks[0].rangeId,
      quote: '第一段正文。',
      kind: 'annotation',
      text: '  我想记住这场雨。  ',
      now: '2026-09-23T08:00:00.000Z',
    })
    expect(note.text).toBe('我想记住这场雨。')
    expect((await getReaderTraces('xiaoyu', book.id))[0].locator.position.selectedText)
      .toBe('第一段正文。')

    await closeBook({
      bookId: book.id,
      readerId: 'xiaoyu',
      cursor: first.endCursor,
      state: {
        understanding: '  这场雨正在改变房间。 ',
        feeling: ' 安静。 ',
        questions: ['灯什么时候亮？', '灯什么时候亮？'],
        attention: ['雨', '窗'],
      },
      now: '2026-09-23T08:05:00.000Z',
    })

    const returned = await getBookOverview(book.id, 'xiaoyu')
    expect(returned.reader.position?.cursor).toBe(first.endCursor)
    expect(returned.reader.state).toMatchObject({
      understanding: '这场雨正在改变房间。',
      questions: ['灯什么时候亮？'],
    })

    const continued = await readBookWindow(book.id, { readerId: 'xiaoyu', length: 200 })
    expect(continued.blocks.map((block) => block.rangeId)).not.toEqual(first.blocks.map((block) => block.rangeId))
  })

  it('拒绝伪造 rangeId 与没有文字的批注', async () => {
    const book = await seedBook()
    const window = await readBookWindow(book.id, { length: 200 })
    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: 'r1:1:1:0:2:wrong',
      quote: '第一段正文。',
      kind: 'highlight',
    })).rejects.toBeInstanceOf(AiReaderCursorError)
    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: window.blocks[0].rangeId,
      quote: '第一段正文。',
      kind: 'annotation', text: '   ',
    })).rejects.toThrow('批注需要留下文字')
  })

  it('可从较大的阅读块中选完整句子，但拒绝半句与块外引文', async () => {
    const book = await seedBook()
    const window = await readBookWindow(book.id, { length: 200 })
    const source = window.blocks[0]

    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: source.rangeId,
      quote: '第一段正文。', kind: 'highlight',
    })).resolves.toMatchObject({
      locator: { position: { selectedText: '第一段正文。', textOffset: 0 } },
    })
    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: source.rangeId,
      quote: '第一段正文。第二句也落在窗边。', kind: 'highlight',
    })).resolves.toMatchObject({
      locator: { position: { selectedText: '第一段正文。第二句也落在窗边。' } },
    })
    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: source.rangeId,
      quote: '第一段', kind: 'highlight',
    })).rejects.toThrow('完整的一句或连续几句')
    await expect(leaveReaderTrace({
      bookId: book.id, readerId: 'xiaoyu', rangeId: source.rangeId,
      quote: '第三段正文。', kind: 'highlight',
    })).rejects.toThrow('不在刚才读到的范围里')
  })
  it('中断后保留主位置、旧状态锚点和补读范围；翻批注不改变主位置', async () => {
    const book = await seedBook()
    const locator = createLocator(book.id, { chapterIndex:1,elementPath:[1],textOffset:0,selectedText:'第一段正文。',beforeContext:'',afterContext:'' })
    await withTransaction('annotations','readwrite',store=>store.put({id:'human',bookId:book.id,locator,text:'我的批注',actor:'user',createdAt:'2026-01-01',updatedAt:'2026-01-01'}))
    const first=await readBookWindow(book.id,{readerId:'g',length:200})
    expect(first.traces?.map(x=>x.id)).toEqual(['human'])
    expect((await getBookOverview(book.id,'g')).reader.position?.cursor).toBe(first.endCursor)
    await closeBook({bookId:book.id,readerId:'g',cursor:first.endCursor,state:{understanding:'雨',feeling:'',questions:[],attention:[]}})
    const next=await readBookWindow(book.id,{readerId:'g',length:200})
    const interrupted=await getBookOverview(book.id,'g')
    expect(interrupted.reader.state?.cursor).toBe(first.endCursor)
    expect(interrupted.reader.recovery).toMatchObject({needed:true,fromCursor:first.endCursor,toCursor:next.endCursor})
    const random=await randomReaderAnnotations(book.id,5)
    expect(random.annotations.map(x=>x.id)).toEqual(['human'])
    await readBookWindow(book.id,{readerId:'g',cursor:random.annotations[0].cursor,mode:'browse',length:200})
    expect((await getBookOverview(book.id,'g')).reader.position?.cursor).toBe(next.endCursor)
  })

  it('连续窗口归在同次来访，翻看合书不覆盖顺读位置和理解',async()=>{
    const book=await seedBook()
    const first=await readBookWindow(book.id,{readerId:'g',length:200})
    const second=await readBookWindow(book.id,{readerId:'g',length:200,sessionId:first.sessionId})
    const visits=await withTransaction<import('../../domain/reader').ReaderSession[]>('readerSessions','readonly',s=>s.getAll())
    expect(visits).toHaveLength(1)
    expect(visits[0].characterCount).toBe(400)
    await closeBook({bookId:book.id,readerId:'g',cursor:second.endCursor,sessionId:second.sessionId,state:{understanding:'顺读理解',feeling:'',questions:[],attention:[]}})
    const browse=await readBookWindow(book.id,{readerId:'g',cursor:'p1:1:1:0',mode:'browse',length:200})
    await closeBook({bookId:book.id,readerId:'g',cursor:browse.endCursor,sessionId:browse.sessionId,state:{understanding:'翻阅的余记',feeling:'',questions:[],attention:[]}})
    const overview=await getBookOverview(book.id,'g')
    expect(overview.reader.position?.cursor).toBe(second.endCursor)
    expect(overview.reader.state?.understanding).toBe('顺读理解')
    const after=await withTransaction<import('../../domain/reader').ReaderSession[]>('readerSessions','readonly',s=>s.getAll())
    expect(after.find(s=>s.id===browse.sessionId)).toMatchObject({mode:'browsing',state:{understanding:'翻阅的余记'}})
  })

})
