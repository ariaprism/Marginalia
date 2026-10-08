import { getBook } from '../../data/local/bookStore'
import {
  getReaderProgress,
  getReaderState,
  saveReaderSession,
  saveReaderTrace,
} from '../../data/local/readerStore'
import type { Book } from '../../domain/book'
import { createLocator, extractContext } from '../../domain/locator'
import type { ReaderState, ReaderTrace } from '../../domain/reader'
import { loadBookChapters, type ChapterText } from '../../reader/bookContent'
import { newId } from '../../shared/id'

const DEFAULT_WINDOW_LENGTH = 1200
const MIN_WINDOW_LENGTH = 200
const MAX_WINDOW_LENGTH = 4000

type ReadingCursor = {
  chapterIndex: number
  paragraphIndex: number
  textOffset: number
}

export type ReaderIdentity = {
  readerId: string
  position: { cursor: string; updatedAt: string } | null
  state: ReaderState | null
}

export type BookTocEntry = {
  title: string
  cursor: string
}

export type BookOverview = {
  book: Pick<Book, 'id' | 'title' | 'englishTitle' | 'author' | 'language' | 'description'>
  toc: BookTocEntry[]
  reader: ReaderIdentity
}

export type ReadBlock = {
  chapterIndex: number
  chapterTitle: string
  text: string
  /** 留痕时回传的稳定、不透明引用；调用方不需要理解内部 Locator。 */
  rangeId: string
}

export type ReadWindow = {
  bookId: string
  blocks: ReadBlock[]
  characterCount: number
  nextCursor: string | null
  /** 本次视野结束的精确位置；合书时把它交给 close_book。 */
  endCursor: string
  atEnd: boolean
}

export type ReaderStateInput = Pick<ReaderState, 'understanding' | 'feeling' | 'questions' | 'attention'>

export class AiReaderNotFoundError extends Error {}
export class AiReaderCursorError extends Error {}

function encodeCursor(cursor: ReadingCursor): string {
  return `p1:${cursor.chapterIndex}:${cursor.paragraphIndex}:${cursor.textOffset}`
}

function decodeCursor(value: string): ReadingCursor {
  const match = /^p1:(\d+):(\d+):(\d+)$/.exec(value)
  if (!match) throw new AiReaderCursorError('无法识别阅读位置')
  return {
    chapterIndex: Number(match[1]),
    paragraphIndex: Number(match[2]),
    textOffset: Number(match[3]),
  }
}

function cursorFromLocator(locator: { position: { chapterIndex: number; elementPath: readonly number[]; textOffset: number } }): string {
  return encodeCursor({
    chapterIndex: locator.position.chapterIndex,
    paragraphIndex: locator.position.elementPath[0] ?? 0,
    textOffset: locator.position.textOffset,
  })
}

/** FNV-1a 只用于发现陈旧 range，不承担安全用途。 */
function textFingerprint(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

type ExactSentenceRange = { start: number; end: number; text: string }

/** 把刚读过的正文块中的原文引用收束成完整的一句或连续多句。 */
function exactSentenceRange(
  paragraph: string,
  sourceStart: number,
  sourceEnd: number,
  quoteInput: string,
): ExactSentenceRange {
  const quote = quoteInput.trim()
  if (!quote) throw new AiReaderCursorError('请引用刚才读到的一句或连续几句原文')
  const sourceText = paragraph.slice(sourceStart, sourceEnd)
  const first = sourceText.indexOf(quote)
  if (first < 0) throw new AiReaderCursorError('引用的文字不在刚才读到的范围里')
  if (sourceText.indexOf(quote, first + 1) >= 0) {
    throw new AiReaderCursorError('这段引文在刚才读到的范围里出现了多次，请多带一句以便准确定位')
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
    throw new AiReaderCursorError('目前只能划下完整的一句或连续几句，请不要从半句开始或结束')
  }
  return { start, end, text: quote }
}

function rangeId(cursor: ReadingCursor, endOffset: number, text: string): string {
  return `r1:${cursor.chapterIndex}:${cursor.paragraphIndex}:${cursor.textOffset}:${endOffset}:${textFingerprint(text)}`
}

function decodeRangeId(value: string): ReadingCursor & { endOffset: number; fingerprint: string } {
  const match = /^r1:(\d+):(\d+):(\d+):(\d+):([a-z0-9]+)$/.exec(value)
  if (!match) throw new AiReaderCursorError('无法识别这段文字')
  return {
    chapterIndex: Number(match[1]),
    paragraphIndex: Number(match[2]),
    textOffset: Number(match[3]),
    endOffset: Number(match[4]),
    fingerprint: match[5],
  }
}

function firstReadableCursor(chapters: ChapterText[]): ReadingCursor | null {
  const preferredIndex = chapters.findIndex((chapter) => chapter.inToc !== false && chapter.paragraphs.length > 0)
  const chapterIndex = preferredIndex >= 0
    ? preferredIndex
    : chapters.findIndex((chapter) => chapter.paragraphs.length > 0)
  if (chapterIndex < 0) return null
  const chapter = chapters[chapterIndex]
  const paragraphIndex = chapter.paragraphs.findIndex((_, index) => !chapter.hiddenParagraphIndexes?.includes(index))
  return paragraphIndex < 0 ? null : { chapterIndex, paragraphIndex, textOffset: 0 }
}

function normalizeCursor(chapters: ChapterText[], cursor: ReadingCursor): ReadingCursor | null {
  for (let chapterIndex = cursor.chapterIndex; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex]
    const startParagraph = chapterIndex === cursor.chapterIndex ? cursor.paragraphIndex : 0
    for (let paragraphIndex = startParagraph; paragraphIndex < chapter.paragraphs.length; paragraphIndex += 1) {
      if (chapter.hiddenParagraphIndexes?.includes(paragraphIndex)) continue
      const paragraph = chapter.paragraphs[paragraphIndex]
      const textOffset = chapterIndex === cursor.chapterIndex && paragraphIndex === cursor.paragraphIndex
        ? cursor.textOffset
        : 0
      if (textOffset < paragraph.length) return { chapterIndex, paragraphIndex, textOffset }
    }
  }
  return null
}

function cursorForChapter(chapters: ChapterText[], chapterIndex: number): string | null {
  const chapter = chapters[chapterIndex]
  if (!chapter) return null
  const paragraphIndex = chapter.paragraphs.findIndex((paragraph, index) => (
    paragraph.length > 0 && !chapter.hiddenParagraphIndexes?.includes(index)
  ))
  return paragraphIndex < 0 ? null : encodeCursor({ chapterIndex, paragraphIndex, textOffset: 0 })
}

export async function getBookOverview(bookId: string, readerId: string): Promise<BookOverview> {
  const [book, chapters, progress, state] = await Promise.all([
    getBook(bookId),
    loadBookChapters(bookId),
    getReaderProgress(readerId, bookId),
    getReaderState(readerId, bookId),
  ])
  if (!book) throw new AiReaderNotFoundError(`找不到书籍：${bookId}`)

  const toc = chapters.flatMap((chapter, chapterIndex) => {
    if (chapter.inToc === false) return []
    const cursor = cursorForChapter(chapters, chapterIndex)
    return cursor ? [{ title: chapter.title, cursor }] : []
  })

  return {
    book: {
      id: book.id,
      title: book.title,
      ...(book.englishTitle ? { englishTitle: book.englishTitle } : {}),
      author: book.author,
      ...(book.language ? { language: book.language } : {}),
      ...(book.description ? { description: book.description } : {}),
    },
    toc,
    reader: {
      readerId,
      position: progress
        ? { cursor: progress.cursor ?? cursorFromLocator(progress.locator), updatedAt: progress.updatedAt }
        : null,
      state: state ?? null,
    },
  }
}

export async function readBookWindow(
  bookId: string,
  options: { readerId?: string; cursor?: string; length?: number } = {},
): Promise<ReadWindow> {
  const [book, chapters, progress] = await Promise.all([
    getBook(bookId),
    loadBookChapters(bookId),
    options.readerId ? getReaderProgress(options.readerId, bookId) : Promise.resolve(undefined),
  ])
  if (!book) throw new AiReaderNotFoundError(`找不到书籍：${bookId}`)

  const requestedLength = Math.round(options.length ?? DEFAULT_WINDOW_LENGTH)
  const targetLength = Math.min(MAX_WINDOW_LENGTH, Math.max(MIN_WINDOW_LENGTH, requestedLength))
  const rawCursor = options.cursor
    ? decodeCursor(options.cursor)
    : progress
      ? decodeCursor(progress.cursor ?? cursorFromLocator(progress.locator))
      : firstReadableCursor(chapters)
  if (options.cursor && rawCursor) {
    const paragraph = chapters[rawCursor.chapterIndex]?.paragraphs[rawCursor.paragraphIndex]
    if (paragraph === undefined || rawCursor.textOffset > paragraph.length) {
      throw new AiReaderCursorError('阅读位置超出本书范围')
    }
  }
  const start = rawCursor ? normalizeCursor(chapters, rawCursor) : null
  if (!start) {
    const endCursor = rawCursor ? encodeCursor(rawCursor) : 'p1:0:0:0'
    return { bookId, blocks: [], characterCount: 0, nextCursor: null, endCursor, atEnd: true }
  }

  const blocks: ReadBlock[] = []
  let characterCount = 0
  let cursor: ReadingCursor | null = start
  let endCursor = encodeCursor(start)

  while (cursor && characterCount < targetLength) {
    const chapter = chapters[cursor.chapterIndex]
    const paragraph = chapter.paragraphs[cursor.paragraphIndex]
    const remaining = targetLength - characterCount
    const text = paragraph.slice(cursor.textOffset, cursor.textOffset + remaining)
    const endOffset = cursor.textOffset + text.length
    if (text) {
      blocks.push({
        chapterIndex: cursor.chapterIndex,
        chapterTitle: chapter.title,
        text,
        rangeId: rangeId(cursor, endOffset, text),
      })
      characterCount += text.length
      endCursor = encodeCursor({ ...cursor, textOffset: endOffset })
    }
    cursor = normalizeCursor(chapters, {
      chapterIndex: cursor.chapterIndex,
      paragraphIndex: cursor.paragraphIndex,
      textOffset: endOffset,
    })
  }

  return {
    bookId,
    blocks,
    characterCount,
    nextCursor: cursor ? encodeCursor(cursor) : null,
    endCursor,
    atEnd: cursor === null,
  }
}

function normalizedState(input: ReaderStateInput): ReaderStateInput {
  const understanding = input.understanding.trim()
  const feeling = input.feeling.trim()
  const questions = [...new Set(input.questions.map((item) => item.trim()).filter(Boolean))]
  const attention = [...new Set(input.attention.map((item) => item.trim()).filter(Boolean))]
  if (understanding.length > 800 || feeling.length > 400
    || questions.length > 8 || questions.some((item) => item.length > 240)
    || attention.length > 12 || attention.some((item) => item.length > 80)) {
    throw new Error('这次留下的读者状态太长，请只保留最重要的感受、疑问和线索')
  }
  return { understanding, feeling, questions, attention }
}

function locatorAtCursor(bookId: string, chapters: ChapterText[], cursorValue: string) {
  const cursor = decodeCursor(cursorValue)
  const paragraph = chapters[cursor.chapterIndex]?.paragraphs[cursor.paragraphIndex]
  if (paragraph === undefined || cursor.textOffset > paragraph.length) {
    throw new AiReaderCursorError('合书位置超出本书范围')
  }
  const anchorStart = cursor.textOffset < paragraph.length
    ? cursor.textOffset
    : Math.max(0, paragraph.length - 80)
  const anchorEnd = Math.min(paragraph.length, Math.max(anchorStart + 1, anchorStart + 80))
  return createLocator(bookId, {
    chapterIndex: cursor.chapterIndex,
    elementPath: [cursor.paragraphIndex],
    textOffset: anchorStart,
    ...extractContext(paragraph, anchorStart, anchorEnd),
  })
}

export async function closeBook(input: {
  bookId: string
  readerId: string
  cursor: string
  state: ReaderStateInput
  now?: string
}): Promise<{ saved: true; updatedAt: string }> {
  const [book, chapters] = await Promise.all([getBook(input.bookId), loadBookChapters(input.bookId)])
  if (!book) throw new AiReaderNotFoundError('找不到书籍：' + input.bookId)
  const stateInput = normalizedState(input.state)
  const updatedAt = input.now ?? new Date().toISOString()
  await saveReaderSession({
    readerId: input.readerId,
    bookId: input.bookId,
    cursor: input.cursor,
    locator: locatorAtCursor(input.bookId, chapters, input.cursor),
    updatedAt,
  }, {
    readerId: input.readerId,
    bookId: input.bookId,
    ...stateInput,
    updatedAt,
  })
  return { saved: true, updatedAt }
}

export async function leaveReaderTrace(input: {
  bookId: string
  readerId: string
  rangeId: string
  /** 刚才 read 返回的正文块中，想实际划下的完整一句或连续几句。 */
  quote: string
  kind: ReaderTrace['kind']
  text?: string
  now?: string
}): Promise<ReaderTrace> {
  const [book, chapters] = await Promise.all([getBook(input.bookId), loadBookChapters(input.bookId)])
  if (!book) throw new AiReaderNotFoundError('找不到书籍：' + input.bookId)
  const range = decodeRangeId(input.rangeId)
  const paragraph = chapters[range.chapterIndex]?.paragraphs[range.paragraphIndex]
  const sourceText = paragraph?.slice(range.textOffset, range.endOffset)
  if (!paragraph || !sourceText || range.endOffset > paragraph.length
    || textFingerprint(sourceText) !== range.fingerprint) {
    throw new AiReaderCursorError('这段文字已经无法在书中准确找到')
  }
  const selection = exactSentenceRange(paragraph, range.textOffset, range.endOffset, input.quote)
  const text = input.kind === 'annotation' ? input.text?.trim() : undefined
  if (input.kind === 'annotation' && !text) throw new Error('批注需要留下文字')
  if (text && text.length > 1200) throw new Error('这条批注太长，请只留下此刻最想保存的念头')
  const trace: ReaderTrace = {
    id: 'reader-trace-' + newId(),
    readerId: input.readerId,
    bookId: input.bookId,
    kind: input.kind,
    locator: createLocator(input.bookId, {
      chapterIndex: range.chapterIndex,
      elementPath: [range.paragraphIndex],
      textOffset: selection.start,
      ...extractContext(paragraph, selection.start, selection.end),
    }),
    ...(text ? { text } : {}),
    createdAt: input.now ?? new Date().toISOString(),
  }
  await saveReaderTrace(trace)
  return trace
}
