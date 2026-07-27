import { beforeEach, describe, expect, it } from 'vitest'
import { sampleChapters } from '../../reader/bookContent'
import { locatorFromSentenceRange, segmentChapters } from '../../reader/sentenceAnchor'
import { getAnnotations } from './bookStore'
import { openMarginaliaDB } from './db'
import {
  loadTraces,
  passageKey,
  persistHighlight,
  persistNote,
  persistReply,
  removeHighlight,
  removeNote,
  removeTrace,
} from './traceStore'

const BOOK_ID = 'test-book'

function anchor(chapterIndex: number, sentence: number) {
  const segmented = segmentChapters(sampleChapters)
  const locator = locatorFromSentenceRange(
    BOOK_ID,
    chapterIndex,
    segmented[chapterIndex],
    sampleChapters[chapterIndex].paragraphs,
    sentence,
    sentence,
  )
  if (!locator) throw new Error('fixture sentence not found')
  return { locator, segmented }
}

function read() {
  return loadTraces(BOOK_ID, sampleChapters, segmentChapters(sampleChapters))
}

async function clearStores() {
  const db = await openMarginaliaDB()
  const names = ['highlights', 'annotations', 'marginalia']
  await Promise.all(names.map((name) => new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(name, 'readwrite')
    transaction.objectStore(name).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })))
}

describe('traceStore', () => {
  beforeEach(clearStores)

  it('round-trips a highlight through the database', async () => {
    const { locator } = anchor(0, 1)

    await persistHighlight(locator)
    const traces = await read()

    expect(traces).toHaveLength(1)
    expect(traces[0].highlighted).toBe(true)
    expect(traces[0].quote).toBe(locator.position.selectedText)
    expect(traces[0].drifted).toBe(false)
    // 句子区间是算出来的，不是存的。
    expect(traces[0].sentenceStart).toBe(1)
  })

  it('groups a highlight, its notes and her reply into one trace', async () => {
    const { locator } = anchor(0, 1)

    await persistHighlight(locator)
    const noteId = await persistNote(locator, '第一条批注', undefined, true)
    await persistNote(locator, '第二条批注', undefined, true)
    await persistReply(locator, noteId, '她的回信')

    const traces = await read()

    expect(traces).toHaveLength(1)
    expect(traces[0].foxNotes?.map((note) => note.text)).toEqual(['第一条批注', '第二条批注'])
    expect(traces[0].fish).toBe('她的回信')
    expect(traces[0].fishAt).toMatch(/\d\d\/\d\d\/\d\d：\d\d/)
  })

  it('keeps rapidly written notes in the order they were written', async () => {
    const { locator } = anchor(0, 1)
    const texts = ['第一条', '第二条', '第三条', '第四条', '第五条']
    for (const text of texts) await persistNote(locator, text)

    // 连着写完全可能落在同一毫秒里。时间戳必须严格递增，否则排序没有确定结果，
    // 界面上几条批注的先后每次打开都可能不一样。
    const annotations = await getAnnotations(BOOK_ID)
    const stamps = annotations.map((annotation) => annotation.createdAt).sort()
    expect(new Set(stamps).size).toBe(texts.length)

    expect((await read())[0].foxNotes?.map((note) => note.text)).toEqual(texts)
  })

  it('keeps two different passages apart', async () => {
    await persistHighlight(anchor(0, 0).locator)
    await persistHighlight(anchor(1, 0).locator)

    const traces = await read()

    expect(traces).toHaveLength(2)
    expect(traces.map((trace) => trace.chapterIndex)).toEqual([0, 1])
  })

  it('keeps notes when the highlight is cancelled', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)
    await persistNote(locator, '划线取消了但批注要留着', undefined, true)

    await removeHighlight(locator)
    const traces = await read()

    expect(traces).toHaveLength(1)
    expect(traces[0].highlighted).toBe(false)
    expect(traces[0].foxNotes).toHaveLength(1)
  })

  it('edits a note in place without moving it or changing its timestamp', async () => {
    const { locator } = anchor(0, 1)
    const first = await persistNote(locator, '原文', undefined, false, '2025-01-01T10:00:00.000Z')
    await persistNote(locator, '第二条', undefined, false, '2025-01-02T10:00:00.000Z')

    await persistNote(locator, '改过的第一条', first)
    const traces = await read()

    expect(traces[0].foxNotes?.map((note) => note.text)).toEqual(['改过的第一条', '第二条'])
    expect(traces[0].foxNotes?.[0].createdAt).toBe('01/01/18：00')
  })

  it('removes a single note without touching the rest of the trace', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)
    const noteId = await persistNote(locator, '待删除', undefined, true)
    await persistNote(locator, '保留', undefined, true)

    await removeNote(noteId)
    const traces = await read()

    expect(traces[0].highlighted).toBe(true)
    expect(traces[0].foxNotes?.map((note) => note.text)).toEqual(['保留'])
  })

  it('removes a whole trace including its notes and reply', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)
    const noteId = await persistNote(locator, '批注', undefined, true)
    await persistReply(locator, noteId, '回信')

    await removeTrace(BOOK_ID, locator.position)

    expect(await read()).toHaveLength(0)
  })

  it('is idempotent when the same passage is highlighted twice', async () => {
    const { locator } = anchor(0, 1)

    await persistHighlight(locator)
    await persistHighlight(locator)

    expect(await read()).toHaveLength(1)
  })

  /**
   * 存的是 Locator 而不是句子序号，所以分段变化后痕迹应当自己找回原句，
   * 而不是静默偏到邻句上。
   */
  it('reanchors a stored trace after the chapter is re-segmented', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)

    const shifted = sampleChapters.map((chapter, index) => index === 0
      ? { ...chapter, paragraphs: ['插在最前面的一个新段落。', ...chapter.paragraphs] }
      : chapter)

    const traces = await loadTraces(BOOK_ID, shifted, segmentChapters(shifted))

    expect(traces[0].drifted).toBe(false)
    expect(traces[0].quote).toBe(locator.position.selectedText)
    const segmented = segmentChapters(shifted)[0]
    expect(segmented.sentences[traces[0].sentenceStart!].text).toContain(locator.position.selectedText)
  })

  it('flags a trace as drifted when its text is gone', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)

    const replaced = sampleChapters.map((chapter, index) => index === 0
      ? { ...chapter, paragraphs: ['整章换成了完全不同的内容。'] }
      : chapter)

    const traces = await loadTraces(BOOK_ID, replaced, segmentChapters(replaced))

    expect(traces[0].drifted).toBe(true)
    expect(traces[0].sentenceStart).toBeUndefined()
    // 仍然要能列出来，原文从库里读，不依赖正文。
    expect(traces[0].quote).toBe(locator.position.selectedText)
  })

  it('derives a stable trace id from the passage, not from insertion order', async () => {
    const { locator } = anchor(0, 1)
    await persistHighlight(locator)

    const before = (await read())[0].id
    await persistNote(locator, '再加一条批注', undefined, true)
    const after = (await read())[0].id

    expect(after).toBe(before)
    expect(before).toBe(passageKey(locator.position))
  })
})
