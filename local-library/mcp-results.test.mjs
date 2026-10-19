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
import * as readerContext from '../supabase/functions/_shared/readerContext.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const directory = mkdtempSync(join(tmpdir(), 'marginalia-mcp-results-'))
process.env.MARGINALIA_LOCAL_DIR = directory
const { openLibrary, putRecord, readCollection } = await import('./db.mjs')
const state = { understanding: '灯与雨。', feeling: '安静。', questions: ['谁在等雨？'], attention: ['灯'] }
const paragraph = '雨敲了三下窗。' + '灯随后亮起来。'.repeat(60)
const humanLocator = { bookId:'fixture-book', position:{chapterIndex:0,elementPath:[0],textOffset:0,selectedText:'雨敲了三下窗。',beforeContext:'',afterContext:''} }
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
  assert.equal(window.progressSaved, true)
  assert.deepEqual(window.traces.map(x=>x.id).sort(), ['human-highlight','human-note'])
  assert.equal(window.traces.find(x=>x.id==='human-note').author.role,'user')
  const afterRead = await textCall(client,'get_book',{bookId,...identity})
  assert.equal((cloud?afterRead.reader.position:afterRead.reader.progress).cursor,window.endCursor)
  assert.equal(afterRead.reader.state,null)
  assert.equal(afterRead.reader.recovery.needed,true)
  const random = await textCall(client,'random_annotations',{bookId,...identity,limit:5})
  assert.deepEqual(random.annotations.map(x=>x.id),['human-note'])
  const peek = await textCall(client,'read',{bookId,...identity,cursor:random.annotations[0].cursor,sessionId:random.annotations[0].sessionId,mode:'browse',length:200})
  assert.equal(peek.progressSaved,false)
  await textCall(client,'close_book',{bookId,...identity,sessionId:peek.sessionId,cursor:peek.endCursor,state:{...state,understanding:'临时翻看'}})
  const afterPeek=await textCall(client,'get_book',{bookId,...identity})
  assert.equal((cloud?afterPeek.reader.position:afterPeek.reader.progress).cursor,window.endCursor)
  assert.equal(afterPeek.reader.state,null)
  assert.equal(window.atEnd, false)
  assert.ok(window.nextCursor)
  assert.match(window.blocks[0].text, /雨敲了三下窗。/)
  if (cloud) assert.ok(window.sessionId)
  const session = { sessionId: window.sessionId }
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
  assert.equal(reopened.reader.state.cursor,next.endCursor)
  assert.equal(reopened.reader.recovery.needed,false)
  const further = await textCall(client,'read',{bookId,...identity,length:200})
  const interrupted=await textCall(client,'get_book',{bookId,...identity})
  assert.equal(interrupted.reader.recovery.fromCursor,next.endCursor)
  assert.equal(interrupted.reader.recovery.toCursor,further.endCursor)
  assert.equal(interrupted.reader.recovery.needed,true)
  assert.equal(interrupted.reader.state.cursor,next.endCursor)
  const eof = await textCall(client,'read',{bookId,...identity,length:200})
  assert.equal(eof.atEnd,true)
  assert.equal(eof.progressSaved,false)
  assert.equal(eof.endCursor,further.endCursor)
  const invalid=await client.callTool({name:'read',arguments:{bookId,...identity,cursor:'p1:99:0:0'}})
  assert.equal(invalid.isError,true)
  assert.deepEqual(reopened.reader.state.questions, state.questions)
  return {sessionId:window.sessionId}
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
    putRecord(db,'highlights',{id:'human-highlight',bookId:book.id,locator:humanLocator})
    putRecord(db,'annotations',{id:'human-note',bookId:book.id,locator:humanLocator,text:'我的雨。',actor:'user'})
    putRecord(db,'annotations',{id:'other-book-note',bookId:'other',locator:humanLocator,text:'不该出现'})
    const read=await readingLoop(client, false)
    const visit=readCollection(db,'readerSessions').find(s=>s.id===read.sessionId)
    assert.equal(visit.characterCount,400)
    assert.equal(visit.traceCount,1)
    assert.ok(visit.closedAt)
    assert.equal(readCollection(db,'readerTraces')[0].sessionId,visit.id)
  } finally {
    await client.close()
    db.close()
  }
})

// Exercise the deployed entrypoint's real tool handlers and SDK transport,
// replacing only Supabase storage and Deno startup; no cloud user data is used.
function cloudFixture() {
  const rows = {
    highlights: [], annotations: [], profiles: [], books: [], book_sections: [], reader_progress: [], reader_states: [], reader_traces: [], reader_sessions: [],
  }
  const admin = {
    from(table) {
      let filters = [], single = false, insert, update, slice
      const q = {
        select() { return q },
        eq(key, value) { filters.push((row) => row[key] === value); return q },
        is(key, value) { filters.push((row) => (row[key] ?? null) === value); return q },
        order() { return q },
        range(from, to) { slice = [from, to + 1]; return q },
        maybeSingle() { single = true; return q },
        single() { single = true; return q },
        insert(value) { insert = value; return q },
        update(value) { update = value; return q },
        then(resolve, reject) {
          if (insert) rows[table].push({ id: randomUUID(), ...(table==='reader_sessions'?{mode:'reading',character_count:0,trace_count:0,started_at:new Date().toISOString()}:{}), ...insert })
          let found = insert ? [rows[table].at(-1)] : rows[table].filter((row) => filters.every((filter) => filter(row)))
          if (slice) found = found.slice(...slice)
          if (update) found.forEach((row) => Object.assign(row, update))
          return Promise.resolve({ data: single ? found[0] ?? null : found, error: null }).then(resolve, reject)
        },
      }
      return q
    },
    async rpc(name, input) {
      if (name === 'record_ai_reader_window') {
        const visit=rows.reader_sessions.find(x=>x.id===input.p_session_id&&x.owner_id===input.p_owner_id&&x.reader_id===input.p_reader_id&&x.book_id===input.p_book_id&&!x.closed_at)
        if(!visit)return {data:null,error:{message:'reader session not found'}}
        Object.assign(visit,{end_cursor:input.p_cursor,end_locator:input.p_locator,character_count:visit.character_count+input.p_character_count})
        const existing = rows.reader_progress.find(x=>x.owner_id===input.p_owner_id && x.reader_id===input.p_reader_id && x.book_id===input.p_book_id)
        if (visit.mode!=='reading' || !input.p_save_progress || (existing?.cursor??null)!==input.p_expected_cursor) return {data:false,error:null}
        const value={owner_id:input.p_owner_id,reader_id:input.p_reader_id,book_id:input.p_book_id,cursor:input.p_cursor,locator:input.p_locator,updated_at:new Date().toISOString()}
        if(existing)Object.assign(existing,value);else rows.reader_progress.push(value)
        return {data:true,error:null}
      }
      if(name==='increment_ai_reader_session_trace'){const s=rows.reader_sessions.find(x=>x.id===input.p_session_id);if(s)s.trace_count++}
      if (name === 'close_ai_reader_session') {
        const visit=input.p_session_id?rows.reader_sessions.find(x=>x.id===input.p_session_id&&!x.closed_at):undefined
        if(input.p_session_id&&!visit)return {data:null,error:{message:'reader session not found'}}
        if(visit){Object.assign(visit,{closed_at:input.p_now,state_snapshot:input.p_state,end_cursor:input.p_cursor,end_locator:input.p_locator});if(visit.mode!=='reading')return {data:null,error:null}}
        const base = { owner_id: input.p_owner_id, reader_id: input.p_reader_id, book_id: input.p_book_id }
        rows.reader_progress.splice(0, rows.reader_progress.length, { ...base, cursor: input.p_cursor, updated_at: input.p_now })
        rows.reader_states.splice(0, rows.reader_states.length, { ...base, ...input.p_state, cursor:input.p_cursor, locator:input.p_locator, updated_at: input.p_now })
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
      if (specifier === '../_shared/readerContext.mjs') return readerContext
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
    rows.highlights.push({id:'human-highlight',owner_id:'fixture-owner',book_id:book.id,locator:humanLocator})
    rows.annotations.push({id:'human-note',owner_id:'fixture-owner',book_id:book.id,locator:humanLocator,text:'我的雨。',actor:'user'})
    rows.annotations.push({id:'other-room-note',owner_id:'other-owner',book_id:book.id,locator:humanLocator,text:'不可见'})
    rows.annotations.push({id:'deleted-note',owner_id:'fixture-owner',book_id:book.id,locator:humanLocator,text:'已删',deleted_at:'2026-01-01'})
    rows.annotations.push({id:'drifted-note',owner_id:'fixture-owner',book_id:book.id,locator:{...humanLocator,position:{...humanLocator.position,selectedText:'不存在的句子'}},text:'漂移'})
    const read=await readingLoop(client, true)
    const visit=rows.reader_sessions.find(s=>s.id===read.sessionId)
    assert.equal(visit.character_count,400)
    assert.equal(visit.trace_count,1)
    assert.ok(visit.closed_at)
    assert.equal(rows.reader_traces[0].session_id,visit.id)
  } finally {
    await client.close()
    await server.close()
  }
})

test('human traces: exact overlap, unique re-anchoring, ambiguous/deleted notes and empty sampling', () => {
  const chapters=[{index:0,paragraphs:['标题','雨敲了三下窗。灯随后亮起来。']},{index:1,paragraphs:['另一章。']}]
  const base={id:'note',bookId:book.id,text:'想法',actor:'user',locator:{...humanLocator,position:{...humanLocator.position,elementPath:[0]}}}
  const traces=readerContext.humanTraces([], [base,{...base,id:'deleted',deleted_at:'2026-01-01'},{...base,id:'future',locator:{...humanLocator,position:{...humanLocator.position,elementPath:[1],textOffset:8,selectedText:'灯随后亮起来。'}}}])
  const seen=readerContext.tracesInBlocks(traces,chapters,[{rangeId:'r1:0:1:0:7:dummy'}])
  assert.deepEqual(seen.map(x=>x.id),['note'])
  assert.equal(seen[0].cursor,'p1:0:1:0')
  const repeated=[{index:0,paragraphs:['雨敲了三下窗。','雨敲了三下窗。']}]
  const stale={...traces[0],locator:{...humanLocator,position:{...humanLocator.position,elementPath:[99]}}}
  assert.equal(readerContext.resolveHumanTrace(stale,repeated),null)
  assert.deepEqual(readerContext.sampleAnnotations([],new Map()),[])
  assert.equal(readerContext.recoveryPlan({cursor:'p1:0:0:10'},null,'p1:0:0:0').fromCursor,'p1:0:0:0')
})
