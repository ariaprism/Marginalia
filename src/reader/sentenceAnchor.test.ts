import { describe, expect, it } from 'vitest'
import type { ChapterText } from './bookContent'
import { locatorFromSentenceRange, resolveLocator, segmentChapter, segmentChapters } from './sentenceAnchor'

function chapterOf(paragraphs: string[]): ChapterText {
  return { chapter: '第一章', title: '测试', kicker: '', paragraphs }
}

const PARAGRAPHS = [
  '灯亮起来以前，书房先听见了雨。她把伞收在门边。',
  '句子需要重量。空白并不比文字轻。',
]

function setup(paragraphs: string[] = PARAGRAPHS) {
  const chapter = chapterOf(paragraphs)
  return {
    chapters: segmentChapters([chapter]),
    paragraphs: [chapter.paragraphs],
    chapter: segmentChapter(chapter),
  }
}

describe('segmentChapter', () => {
  it('numbers sentences continuously across paragraphs', () => {
    const { chapter } = setup()

    expect(chapter.sentences.map((run) => run.index)).toEqual([0, 1, 2, 3])
    expect(chapter.paragraphs[1][0].paragraphIndex).toBe(1)
  })

  it('records each sentence offset within its own paragraph', () => {
    const { chapter } = setup()

    expect(chapter.paragraphs[0][0].charOffset).toBe(0)
    expect(chapter.paragraphs[0][1].charOffset).toBe(chapter.paragraphs[0][0].text.length)
    // 每段重新从 0 开始，不是全章累加。
    expect(chapter.paragraphs[1][0].charOffset).toBe(0)
  })
})

describe('locatorFromSentenceRange', () => {
  it('captures the selected text and its context', () => {
    const { chapter, paragraphs } = setup()

    const locator = locatorFromSentenceRange('book-1', 0, chapter, paragraphs[0], 2, 2)

    expect(locator?.position.selectedText).toBe('句子需要重量。')
    expect(locator?.position.elementPath).toEqual([1])
    expect(locator?.position.textOffset).toBe(0)
    expect(locator?.position.afterContext).toBe('空白并不比文字轻。')
  })

  it('spans a multi-sentence selection', () => {
    const { chapter, paragraphs } = setup()

    const locator = locatorFromSentenceRange('book-1', 0, chapter, paragraphs[0], 0, 1)

    expect(locator?.position.selectedText).toBe('灯亮起来以前，书房先听见了雨。她把伞收在门边。')
  })

  it('returns null for a range outside the chapter', () => {
    const { chapter, paragraphs } = setup()

    expect(locatorFromSentenceRange('book-1', 0, chapter, paragraphs[0], 99, 99)).toBeNull()
  })
})

describe('resolveLocator', () => {
  it('round-trips a selection back to the same sentence range', () => {
    const { chapter, chapters, paragraphs } = setup()
    const locator = locatorFromSentenceRange('book-1', 0, chapter, paragraphs[0], 2, 2)!

    expect(resolveLocator(locator.position, chapters, paragraphs)).toEqual({
      chapterIndex: 0,
      start: 2,
      end: 2,
    })
  })

  it('round-trips a multi-sentence selection', () => {
    const { chapter, chapters, paragraphs } = setup()
    const locator = locatorFromSentenceRange('book-1', 0, chapter, paragraphs[0], 0, 1)!

    expect(resolveLocator(locator.position, chapters, paragraphs)).toEqual({
      chapterIndex: 0,
      start: 0,
      end: 1,
    })
  })

  /**
   * 这是整个换算层存在的理由：分段逻辑变了、句子整体漂移，
   * 旧划线仍然要落在同一句话上，而不是静默偏到邻句。
   */
  it('survives a paragraph split that shifts every sentence index', () => {
    const before = setup()
    const locator = locatorFromSentenceRange('book-1', 0, before.chapter, before.paragraphs[0], 2, 2)!

    // 重新分段：首段被拆开且多出一句，锚点段落从 [1] 挪到 [2]，
    // 「句子需要重量。」的句子索引从 2 变成 3。
    const after = setup([
      '灯亮起来以前，书房先听见了雨。',
      '她把伞收在门边。他关上窗。',
      '句子需要重量。空白并不比文字轻。',
    ])

    expect(resolveLocator(locator.position, after.chapters, after.paragraphs)).toEqual({
      chapterIndex: 0,
      start: 3,
      end: 3,
    })
  })

  it('survives text being inserted ahead of the anchor in the same paragraph', () => {
    const before = setup()
    const locator = locatorFromSentenceRange('book-1', 0, before.chapter, before.paragraphs[0], 3, 3)!

    const after = setup([
      PARAGRAPHS[0],
      `他停了一下。${PARAGRAPHS[1]}`,
    ])

    const resolved = resolveLocator(locator.position, after.chapters, after.paragraphs)
    const sentence = after.chapters[0].sentences[resolved!.start]
    expect(sentence.text).toBe('空白并不比文字轻。')
  })

  it('uses context to pick the right one of two identical sentences', () => {
    const paragraphs = [
      '他说。雨停了。',
      '她说。雨停了。',
    ]
    const source = setup(paragraphs)
    // 第二段的「雨停了。」
    const locator = locatorFromSentenceRange('book-1', 0, source.chapter, paragraphs, 3, 3)!
    expect(locator.position.beforeContext).toBe('她说。')

    // 段落顺序颠倒后，仅靠原文会命中错的那一处，靠上下文才能分辨。
    const after = setup([paragraphs[1], paragraphs[0]])
    const resolved = resolveLocator(locator.position, after.chapters, after.paragraphs)

    expect(after.chapters[0].sentences[resolved!.start].paragraphIndex).toBe(0)
  })

  it('returns null when the anchored text is gone', () => {
    const before = setup()
    const locator = locatorFromSentenceRange('book-1', 0, before.chapter, before.paragraphs[0], 2, 2)!

    const after = setup(['完全不同的一章内容。'])

    expect(resolveLocator(locator.position, after.chapters, after.paragraphs)).toBeNull()
  })

  it('returns null when the chapter no longer exists', () => {
    const before = setup()
    const locator = locatorFromSentenceRange('book-1', 5, before.chapter, before.paragraphs[0], 2, 2)!

    expect(resolveLocator(locator.position, before.chapters, before.paragraphs)).toBeNull()
  })
})
