import { describe, expect, it } from 'vitest'
import { orderedTraceNotes, traceAtSentence, type Trace } from './trace'

describe('traceAtSentence', () => {
  it('returns the whole multi-sentence trace when any covered sentence is clicked', () => {
    const paragraphTrace = {
      id: 'paragraph',
      bookId: 'book',
      chapterIndex: 2,
      chapter: '第三章',
      sentenceStart: 4,
      sentenceEnd: 9,
      quote: '一整段原文',
    } satisfies Trace

    expect(traceAtSentence([paragraphTrace], 2, 7)).toBe(paragraphTrace)
  })

  it('prefers the shortest trace when ranges overlap', () => {
    const paragraph = {
      id: 'paragraph', bookId: 'book', chapterIndex: 0, chapter: '第一章',
      sentenceStart: 0, sentenceEnd: 5, quote: '整段',
    } satisfies Trace
    const sentence = {
      id: 'sentence', bookId: 'book', chapterIndex: 0, chapter: '第一章',
      sentenceStart: 2, sentenceEnd: 2, quote: '一句',
    } satisfies Trace

    expect(traceAtSentence([paragraph, sentence], 0, 2)).toBe(sentence)
  })

  it('interleaves both readers by their real timestamp', () => {
    const trace = {
      id: 'notes', bookId: 'book', chapterIndex: 0, chapter: '第一章', quote: '一句',
      foxNotes: [{ id: 'later', text: '后来写下', createdAt: '10/03/15：11', timestamp: '2026-10-03T07:11:00.000Z' }],
      companionNotes: [{ id: 'earlier', text: '先写下', createdAt: '10/03/15：00', timestamp: '2026-10-03T07:00:00.000Z' }],
    } satisfies Trace

    expect(orderedTraceNotes(trace).map((note) => [note.actor, note.text]))
      .toEqual([['companion', '先写下'], ['user', '后来写下']])
  })
})
