import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { openLibrary, readCollection } from './db.mjs'
import { closeBook, getBook, leaveTrace, readBook } from './reader.mjs'

const db = openLibrary()
const server = new McpServer(
  { name: 'marginalia-local', version: '0.1.0' },
  {
    instructions: '这是小狐狸的本地共读书房。先看书籍与目录，再按自己的节奏阅读。不要为了覆盖工具而强行批注；什么都不写、主动合书都是合法选择。不要读取尚未到达位置之后的他人痕迹。',
  },
)

server.registerTool('list_books', {
  title: '看看本地书架',
  description: '列出电脑固定本地书房里的书籍。',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async () => {
  const books = readCollection(db, 'books').map(({ id, title, author, description }) => ({
    id, title, author, description,
  }))
  return {
    structuredContent: { books },
    content: [{
      type: 'text',
      text: books.length ? '书架上有 ' + books.length + ' 本书。' : '本地书房还是空的。',
    }],
  }
})

server.registerTool('get_book', {
  title: '打开一本书',
  description: '查看一本书的信息、目录，以及指定读者上次合书的位置和状态。',
  inputSchema: { bookId: z.string(), readerId: z.string() },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ bookId, readerId }) => {
  const result = getBook(db, bookId, readerId)
  return {
    structuredContent: result,
    content: [{ type: 'text', text: '《' + result.book.title + '》共有 ' + result.chapters.length + ' 个目录项。' }],
  }
})

server.registerTool('read', {
  title: '读一段书',
  description: '从自己的上次位置、目录位置或指定 cursor 读取一小段正文。没有想法时可以直接继续。',
  inputSchema: {
    bookId: z.string(),
    readerId: z.string(),
    cursor: z.string().optional(),
    length: z.number().int().min(200).max(4000).optional(),
  },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ bookId, readerId, cursor, length }) => {
  const result = readBook(db, bookId, readerId, cursor, length)
  return {
    structuredContent: result,
    content: [{ type: 'text', text: result.blocks.map((block) => block.text).join('\n\n') }],
  }
})

server.registerTool('leave_trace', {
  title: '在书页上留痕',
  description: '从刚刚 read 返回的正文块中，引用完整的一句或连续几句留下划线或批注；不能只取半句。不想留痕时不要调用。',
  inputSchema: {
    bookId: z.string(),
    readerId: z.string(),
    rangeId: z.string(),
    quote: z.string().min(1).describe('刚才读到的完整一句或连续几句原文，必须逐字引用'),
    kind: z.enum(['highlight', 'annotation']),
    text: z.string().max(1200).optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => {
  const trace = leaveTrace(db, input)
  return {
    structuredContent: { trace },
    content: [{ type: 'text', text: trace.kind === 'annotation' ? '批注已经留在书页上。' : '这句话已经划下来了。' }],
  }
})

server.registerTool('close_book', {
  title: '合上书',
  description: '保存这个读者自己的阅读位置和离开时的短状态。',
  inputSchema: {
    bookId: z.string(),
    readerId: z.string(),
    cursor: z.string(),
    state: z.object({
      understanding: z.string().max(800),
      feeling: z.string().max(400),
      questions: z.array(z.string().max(240)).max(8),
      attention: z.array(z.string().max(80)).max(12),
    }),
  },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async (input) => {
  const result = closeBook(db, input)
  return {
    structuredContent: result,
    content: [{ type: 'text', text: '已经合上书，下次会从这里继续。' }],
  }
})

await server.connect(new StdioServerTransport())
