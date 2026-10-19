import { createHash, randomUUID } from 'node:crypto'
import { humanTraces, recoveryPlan, tracesInBlocks, sampleAnnotations } from '../supabase/functions/_shared/readerContext.mjs'
import { findRecord, putRecord, readCollection } from './db.mjs'

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
}

function paragraphsOf(chapter) {
  const html = String(chapter.html || '')
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|blockquote|h[1-6]|li|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  const paragraphs = decodeEntities(html).split(/\n+/)
    .map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (paragraphs[0] === chapter.title) paragraphs.shift()
  return paragraphs
}

function chaptersFor(db, bookId) {
  return readCollection(db, 'chapters')
    .filter((chapter) => chapter.bookId === bookId)
    .sort((a, b) => a.index - b.index)
    .map((chapter) => ({ ...chapter, paragraphs: paragraphsOf(chapter) }))
}

function cursor(value) {
  const match = /^p1:(\d+):(\d+):(\d+)$/.exec(value || '')
  if (!match) throw new Error('无法识别阅读位置')
  return { chapterIndex: Number(match[1]), paragraphIndex: Number(match[2]), textOffset: Number(match[3]) }
}

function encode(value) {
  return 'p1:' + value.chapterIndex + ':' + value.paragraphIndex + ':' + value.textOffset
}

function nextCursor(chapters, current) {
  for (let chapterIndex = current.chapterIndex; chapterIndex < chapters.length; chapterIndex += 1) {
    const start = chapterIndex === current.chapterIndex ? current.paragraphIndex : 0
    for (let paragraphIndex = start; paragraphIndex < chapters[chapterIndex].paragraphs.length; paragraphIndex += 1) {
      const textOffset = chapterIndex === current.chapterIndex && paragraphIndex === current.paragraphIndex
        ? current.textOffset : 0
      if (textOffset < chapters[chapterIndex].paragraphs[paragraphIndex].length) {
        return { chapterIndex, paragraphIndex, textOffset }
      }
    }
  }
  return null
}

function fingerprint(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function exactSentenceRange(paragraph, sourceStart, sourceEnd, quoteInput) {
  const quote = String(quoteInput || '').trim()
  if (!quote) throw new Error('请引用刚才读到的一句或连续几句原文')
  const sourceText = paragraph.slice(sourceStart, sourceEnd)
  const first = sourceText.indexOf(quote)
  if (first < 0) throw new Error('引用的文字不在刚才读到的范围里')
  if (sourceText.indexOf(quote, first + 1) >= 0) {
    throw new Error('这段引文在刚才读到的范围里出现了多次，请多带一句以便准确定位')
  }
  const start = sourceStart + first
  const end = start + quote.length
  const sentences = Array.from(
    new Intl.Segmenter('zh-CN', { granularity: 'sentence' }).segment(paragraph),
    ({ segment, index }) => {
      const leading = segment.length - segment.trimStart().length
      const trailing = segment.length - segment.trimEnd().length
      return { start: index + leading, end: index + segment.length - trailing }
    },
  ).filter((range) => range.start < range.end)
  if (!sentences.some((range) => range.start === start)
    || !sentences.some((range) => range.end === end)) {
    throw new Error('目前只能划下完整的一句或连续几句，请不要从半句开始或结束')
  }
  return { start, end, text: quote }
}

export function getBook(db, bookId, readerId) {
  const book = findRecord(db, 'books', bookId)
  if (!book) throw new Error('找不到这本书')
  const chapters = chaptersFor(db, bookId)
  const progress = findRecord(db, 'readerProgress', readerId + ':' + bookId) ?? null
  const state = findRecord(db, 'readerStates', readerId + ':' + bookId) ?? null
  const first = chapters.find(c => c.inToc !== false && c.paragraphs.length)
  return {
    book,
    chapters: chapters.filter((chapter) => chapter.inToc !== false).map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      cursor: encode({ chapterIndex: chapter.index, paragraphIndex: 0, textOffset: 0 }),
    })),
    reader: {
      readerId,
      progress, state,
      recovery: recoveryPlan(progress, state?.cursor ? state : state && state.updatedAt === progress?.updatedAt ? { cursor: progress.cursor } : state, first ? `p1:${first.index}:0:0` : null),
    },
  }
}

export function readBook(db, bookId, readerId, requestedCursor, length = 1200, mode = 'continue', sessionId) {
  getBook(db, bookId, readerId)
  const chapters = chaptersFor(db, bookId)
  const saved = findRecord(db, 'readerProgress', readerId + ':' + bookId)
  const firstChapter = chapters.find((chapter) => chapter.inToc !== false && chapter.paragraphs.length)
  let current = requestedCursor
    ? cursor(requestedCursor)
    : saved?.cursor
      ? cursor(saved.cursor)
      : { chapterIndex: firstChapter?.index ?? 0, paragraphIndex: 0, textOffset: 0 }
  const paragraph = chapters[current.chapterIndex]?.paragraphs[current.paragraphIndex]
  if (paragraph === undefined || current.textOffset > paragraph.length) throw new Error('阅读位置超出本书范围')
  const raw = current
  const visit = openLocalVisit(db,bookId,readerId,encode(raw),sessionId,mode === 'browse' ? 'browsing' : 'reading')
  current = nextCursor(chapters, current)
  const target = Math.min(4000, Math.max(200, Math.round(length)))
  const blocks = []
  let count = 0
  let endCursor = encode(current ?? raw)
  while (current && count < target) {
    const paragraph = chapters[current.chapterIndex]?.paragraphs[current.paragraphIndex]
    if (paragraph === undefined) throw new Error('阅读位置超出本书范围')
    const text = paragraph.slice(current.textOffset, current.textOffset + target - count)
    const endOffset = current.textOffset + text.length
    blocks.push({
      chapterIndex: current.chapterIndex,
      chapterTitle: chapters[current.chapterIndex].title,
      text,
      rangeId: 'r1:' + current.chapterIndex + ':' + current.paragraphIndex + ':' + current.textOffset + ':' + endOffset + ':' + fingerprint(text),
    })
    count += text.length
    endCursor = encode({ ...current, textOffset: endOffset })
    current = nextCursor(chapters, { ...current, textOffset: endOffset })
  }
  const traces = tracesInBlocks(localHumanTraces(db, bookId), chapters, blocks)
  {
    db.exec('begin immediate')
    try {
      if(count && mode !== 'browse')saveProgress(db, bookId, readerId, endCursor)
      putRecord(db,'readerSessions',{...visit,endCursor,endLocator:localLocator(db,bookId,endCursor),characterCount:visit.characterCount+count,updatedAt:new Date().toISOString()})
      db.exec('commit')
    }
    catch (error) { db.exec('rollback'); throw error }
  }
  return { bookId, sessionId:visit.id, blocks, traces, mode, progressSaved: count > 0 && mode !== 'browse', characterCount: count, endCursor, nextCursor: current ? encode(current) : null, atEnd: !current }
}

export function leaveTrace(db, input) {
  const match = /^r1:(\d+):(\d+):(\d+):(\d+):([a-f0-9]+)$/.exec(input.rangeId)
  if (!match) throw new Error('无法识别这段文字')
  const chapters = chaptersFor(db, input.bookId)
  const chapterIndex = Number(match[1])
  const paragraphIndex = Number(match[2])
  const start = Number(match[3])
  const end = Number(match[4])
  const paragraph = chapters[chapterIndex]?.paragraphs[paragraphIndex]
  const sourceText = paragraph?.slice(start, end)
  if (!sourceText || fingerprint(sourceText) !== match[5]) throw new Error('这段文字已经无法准确找到')
  const selection = exactSentenceRange(paragraph, start, end, input.quote)
  const text = input.kind === 'annotation' ? input.text?.trim() : undefined
  if (input.kind === 'annotation' && !text) throw new Error('批注需要留下文字')
  const createdAt = new Date().toISOString()
  const trace = {
    id: 'reader-trace-' + randomUUID(),
    readerId: input.readerId,
    bookId: input.bookId,
    kind: input.kind,
    locator: {
      bookId: input.bookId,
      position: {
        chapterIndex, elementPath: [paragraphIndex], textOffset: selection.start,
        selectedText: selection.text,
        beforeContext: paragraph.slice(Math.max(0, selection.start - 60), selection.start),
        afterContext: paragraph.slice(selection.end, selection.end + 60),
      },
    },
    ...(text ? { text } : {}),
    ...(input.sessionId ? {sessionId:input.sessionId} : {}),
    createdAt,
  }
  const visit=input.sessionId?openLocalVisit(db,input.bookId,input.readerId,'',input.sessionId):null
  db.exec('begin immediate')
  try {
    putRecord(db, 'readerTraces', trace)
    if(visit)putRecord(db,'readerSessions',{...visit,traceCount:visit.traceCount+1,updatedAt:createdAt})
    db.exec('commit')
  } catch(error){db.exec('rollback');throw error}
  return trace
}

function saveProgress(db, bookId, readerId, value) {
  const input = { bookId, readerId, cursor: value }
  const position = cursor(input.cursor)
  const chapters = chaptersFor(db, input.bookId)
  const paragraph = chapters[position.chapterIndex]?.paragraphs[position.paragraphIndex]
  if (paragraph === undefined || position.textOffset > paragraph.length) throw new Error('合书位置超出本书范围')
  const anchorStart = Math.min(position.textOffset, Math.max(0, paragraph.length - 1))
  const selectedText = paragraph.slice(anchorStart, anchorStart + 80)
  const updatedAt = new Date().toISOString()
  const previous = findRecord(db, 'readerProgress', readerId + ':' + bookId)
  const oldState = findRecord(db, 'readerStates', readerId + ':' + bookId)
  if (oldState && !oldState.cursor && previous?.updatedAt === oldState.updatedAt) putRecord(db, 'readerStates', { ...oldState, cursor: previous.cursor, locator: previous.locator })
  putRecord(db, 'readerProgress', {
    readerId: input.readerId,
    bookId: input.bookId,
    cursor: input.cursor,
    locator: {
      bookId: input.bookId,
      position: {
        chapterIndex: position.chapterIndex,
        elementPath: [position.paragraphIndex],
        textOffset: anchorStart,
        selectedText,
        beforeContext: paragraph.slice(Math.max(0, anchorStart - 60), anchorStart),
        afterContext: paragraph.slice(anchorStart + selectedText.length, anchorStart + selectedText.length + 60),
      },
    },
    updatedAt,
  })
  return { updatedAt, locator: findRecord(db, 'readerProgress', readerId + ':' + bookId).locator }
}

export function closeBook(db, input) {
  const visit=openLocalVisit(db,input.bookId,input.readerId,input.cursor,input.sessionId)
  const endLocator=localLocator(db,input.bookId,input.cursor)
  db.exec('begin immediate')
  try {
    const now=new Date().toISOString()
    putRecord(db,'readerSessions',{...visit,endCursor:input.cursor,endLocator,state:input.state,closedAt:now,updatedAt:now})
    if(visit.mode!=='reading'){db.exec('commit');return {saved:true,updatedAt:now}}
    const { updatedAt, locator } = saveProgress(db, input.bookId, input.readerId, input.cursor)
    putRecord(db, 'readerStates', { ...input.state, readerId: input.readerId, bookId: input.bookId, cursor: input.cursor, locator, updatedAt })
    db.exec('commit')
    return { saved: true, updatedAt }
  } catch (error) { db.exec('rollback'); throw error }
}

function localHumanTraces(db, bookId) {
  const filter = c => readCollection(db, c).filter(x => !bookId || x.bookId === bookId)
  return humanTraces(filter('highlights'), filter('annotations'), readCollection(db, 'profiles')[0]?.userName)
}

export function randomAnnotations(db, bookId, limit = 1, readerId = 'companion') {
  const books = readCollection(db, 'books').filter(b => !bookId || b.id === bookId)
  if (bookId && !books.length) throw new Error('找不到这本书')
  const map = new Map(books.map(b => [b.id, chaptersFor(db, b.id)]))
  const annotations=sampleAnnotations(localHumanTraces(db, bookId), map, limit)
  const visits=new Map()
  for(const id of new Set(annotations.map(t=>t.bookId))){
    const notes=annotations.filter(t=>t.bookId===id)
    const visit=openLocalVisit(db,id,readerId,notes[0].cursor)
    visit.mode='annotations';visit.viewedAnnotationIds=notes.map(t=>t.id);visit.endCursor=notes.at(-1).cursor;visit.endLocator=localLocator(db,id,visit.endCursor)
    putRecord(db,'readerSessions',visit);visits.set(id,visit.id)
  }
  return { annotations: annotations.map(t=>({...t,sessionId:visits.get(t.bookId)})), mode: 'browse', progressSaved: false, instruction: '携带 sessionId、bookId 和 cursor 调用 read，mode=browse，翻阅结束可合书。' }
}

function localLocator(db,bookId,value){
  const c=cursor(value),p=chaptersFor(db,bookId)[c.chapterIndex]?.paragraphs[c.paragraphIndex]
  if(p===undefined||c.textOffset>p.length)throw new Error('阅读位置超出本书范围')
  const start=Math.min(c.textOffset,Math.max(0,p.length-1))
  return {bookId,position:{chapterIndex:c.chapterIndex,elementPath:[c.paragraphIndex],textOffset:start,selectedText:p.slice(start,start+80),beforeContext:p.slice(Math.max(0,start-60),start),afterContext:p.slice(start+80,start+140)}}
}
function openLocalVisit(db,bookId,readerId,value,sessionId,mode){
  if(sessionId){
    const s=findRecord(db,'readerSessions',sessionId)
    if(!s||s.bookId!==bookId||s.readerId!==readerId||s.closedAt)throw new Error('阅读 session 不存在或已经合书')
    if(mode&&s.mode!==mode&&!(mode==='browsing'&&s.mode==='annotations'))throw new Error('顺读和临时翻看请使用各自的 session')
    return s
  }
  const now=new Date().toISOString()
  return {id:randomUUID(),bookId,readerId,mode:mode??'reading',startCursor:value,startLocator:localLocator(db,bookId,value),startedAt:now,updatedAt:now,characterCount:0,traceCount:0,viewedAnnotationIds:[]}
}
