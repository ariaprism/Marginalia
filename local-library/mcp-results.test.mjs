import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const directory = mkdtempSync(join(tmpdir(), 'marginalia-mcp-results-'))
process.env.MARGINALIA_LOCAL_DIR = directory
const { openLibrary, putRecord } = await import('./db.mjs')
const state = { understanding: '灯与雨。', feeling: '安静。', questions: ['谁在等雨？'], attention: ['灯'] }
const paragraph = '雨敲了三下窗。' + '灯随后亮起来。'.repeat(60)
const book = { id: 'fixture-book', title: '雨夜书房', author: '测试作者', description: '合成测试文本。' }

// Deliberately discard structuredContent when deciding what to call next.
// This reproduces clients that forward only TextContent to the model.
async function textCall(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  assert.ok(!result.isError, JSON.stringify(result.content))
  const text = result.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n')
  const payload = JSON.parse(text)
  assert.deepEqual(payload, JSON.parse(JSON.stringify(result.structuredContent)))
  return payload
}

async function readingLoop(client, cloud) {
  const shelf = await textCall(client, 'list_books')
  assert.equal(shelf.books[0].title, book.title)
  const bookId = shelf.books[0].id
  const identity = cloud ? {} : { readerId: 'test-reader' }
  const overview = await textCall(client, 'get_book', { bookId, ...identity })
  const toc = cloud ? overview.toc : overview.chapters
  const window = await textCall(client, 'read', { bookId, ...identity, cursor: toc[0].cursor, length: 200 })
  assert.equal(window.atEnd, false)
  assert.ok(window.nextCursor)
  assert.match(window.blocks[0].text, /雨敲了三下窗。/)
  if (cloud) assert.ok(window.sessionId)
  const session = cloud ? { sessionId: window.sessionId } : {}
  const { trace } = await textCall(client, 'leave_trace', {
    bookId, ...identity, ...session, rangeId: window.blocks[0].rangeId,
    quote: '雨敲了三下窗。', kind: 'annotation', text: '我想记住这场雨。',
  })
  assert.ok(trace.id)
  assert.equal(trace.text, '我想记住这场雨。')
  const next = await textCall(client, 'read', { bookId, ...identity, ...session, cursor: window.nextCursor, length: 200 })
  assert.notEqual(next.endCursor, window.endCursor)
  const closed = await textCall(client, 'close_book', { bookId, ...identity, ...session, cursor: next.endCursor, state })
  assert.equal(closed.saved, true)
  assert.ok(closed.updatedAt)
  const reopened = await textCall(client, 'get_book', { bookId, ...identity })
  const progress = cloud ? reopened.reader.position : reopened.reader.progress
  assert.equal(progress.cursor, next.endCursor)
  assert.deepEqual(reopened.reader.state.questions, state.questions)
}

test.after(() => rmSync(directory, { recursive: true, force: true }))

test('local STDIO: text-only client discovers books, reads, leaves a trace, closes and resumes', { timeout: 15000 }, async () => {
  const db = openLibrary()
  const client = new Client({ name: 'text-only-regression', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath, args: [join(root, 'local-library/mcp.mjs')],
    env: { ...process.env, MARGINALIA_LOCAL_DIR: directory }, stderr: 'pipe',
  })
  try {
    await client.connect(transport)
    assert.deepEqual(await textCall(client, 'list_books'), { books: [] })
    putRecord(db, 'books', book)
    putRecord(db, 'chapters', { bookId: book.id, index: 0, title: '雨', inToc: true, html: '<p>' + paragraph + '</p>' })
    await readingLoop(client, false)
  } finally {
    await client.close()
    db.close()
  }
})

// Exercise the deployed entrypoint's real tool handlers and SDK transport,
// replacing only Supabase storage and Deno startup; no cloud user data is used.
function cloudFixture() {
  const rows = {
    books: [], book_sections: [], reader_progress: [], reader_states: [], reader_traces: [], reader_sessions: [],
  }
  const admin = {
    from(table) {
      let filters = [], single = false, insert, update
      const q = {
        select() { return q },
        eq(key, value) { filters.push((row) => row[key] === value); return q },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return q },
        order() { return q },
        maybeSingle() { single = true; return q },
        single() { single = true; return q },
        insert(value) { insert = value; return q },
        update(value) { update = value; return q },
        then(resolve, reject) {
          if (insert) rows[table].push({ id: randomUUID(), ...insert })
          const found = rows[table].filter((row) => filters.every((filter) => filter(row)))
          if (update) found.forEach((row) => Object.assign(row, update))
          return Promise.resolve({ data: single ? found[0] ?? null : found, error: null }).then(resolve, reject)
        },
      }
      return q
    },
    async rpc(name, input) {
      if (name === 'close_ai_reader_session') {
        const base = { owner_id: input.p_owner_id, reader_id: input.p_reader_id, book_id: input.p_book_id }
        rows.reader_progress.splice(0, rows.reader_progress.length, { ...base, cursor: input.p_cursor, updated_at: input.p_now })
        rows.reader_states.splice(0, rows.reader_states.length, { ...base, ...input.p_state, updated_at: input.p_now })
      }
      return { data: null, error: null }
    },
  }
  const require = createRequire(import.meta.url)
  const source = readFileSync(join(root, 'supabase/functions/marginalia-reader-mcp/index.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const module = { exports: {} }
  vm.runInNewContext(outputText + '\nmodule.exports.makeServer = makeServer;', {
    module, exports: module.exports, console, crypto: globalThis.crypto, Intl,
    Deno: { env: { get: () => 'fixture' }, serve() {} },
    require(specifier) {
      if (specifier.startsWith('jsr:')) return {}
      if (specifier.startsWith('npm:@supabase/')) return { createClient: () => admin }
      return require(specifier.replace(/^npm:/, '').replace(/@\d+\.\d+\.\d+/, ''))
    },
  })
  return { rows, server: module.exports.makeServer({ id: 'fixture-key', owner_id: 'fixture-owner', reader_id: 'test-reader' }) }
}

test('cloud handlers: text-only client completes the same loop, including session and range references', { timeout: 15000 }, async () => {
  const { rows, server } = cloudFixture()
  const client = new Client({ name: 'cloud-text-only-regression', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    assert.deepEqual((await textCall(client, 'list_books')).books, [])
    rows.books.push({ ...book, owner_id: 'fixture-owner' })
    rows.books.push({ id: 'other-room-book', title: '不可见', owner_id: 'other-owner' })
    rows.book_sections.push({ id: 'fixture-section', owner_id: 'fixture-owner', book_id: book.id, spine_index: 0, title: '雨', content_text: paragraph, content_html: '<p>' + paragraph + '</p>' })
    const shelf = await textCall(client, 'list_books')
    assert.equal(shelf.books.length, 1)
    assert.equal(shelf.readerId, 'test-reader')
    await readingLoop(client, true)
  } finally {
    await client.close()
    await server.close()
  }
})
