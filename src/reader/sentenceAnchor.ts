import { createLocator, extractContext, type Locator, type TextPosition } from '../domain/locator'
import type { ChapterText } from './bookContent'

/**
 * 句子与稳定定位之间的换算层。
 *
 * 阅读器用「本章第几句」做选择和渲染，因为那是用户点得到的粒度。
 * 但句子索引是分段结果的副产品：改一次分段逻辑，所有索引就整体漂移。
 * 所以持久层只存 Locator（元素路径 + 偏移 + 原文 + 前后文），
 * 句子索引每次加载时重新算出来，属于运行时缓存。
 *
 * 详见 docs/EPUB_ANCHORING.md 第 2、4 节。
 */

export type SentenceRun = {
  /** 本章内连续编号，供阅读器交互使用；不进持久层。 */
  index: number
  text: string
  /** 所属段落在 chapter.paragraphs 中的下标。 */
  paragraphIndex: number
  /** 句子起点在所属段落内的字符偏移。 */
  charOffset: number
}

export type SegmentedChapter = {
  paragraphs: SentenceRun[][]
  sentences: SentenceRun[]
}

let cachedSegmenter: Intl.Segmenter | null = null

function sentenceSegmenter(): Intl.Segmenter {
  cachedSegmenter ??= new Intl.Segmenter('zh-CN', { granularity: 'sentence' })
  return cachedSegmenter
}

/**
 * 把章节正文切成句子。
 *
 * 阅读器渲染和 Locator 换算都必须走这个函数，否则两边的句子编号会对不上。
 */
export function segmentChapter(chapter: ChapterText): SegmentedChapter {
  const segmenter = sentenceSegmenter()
  let index = 0
  const paragraphs = chapter.paragraphs.map((paragraph, paragraphIndex) => {
    let charOffset = 0
    return Array.from(segmenter.segment(paragraph), ({ segment }) => {
      const run: SentenceRun = { index: index++, text: segment, paragraphIndex, charOffset }
      charOffset += segment.length
      return run
    })
  })
  return { paragraphs, sentences: paragraphs.flat() }
}

export function segmentChapters(chapters: ChapterText[]): SegmentedChapter[] {
  return chapters.map(segmentChapter)
}

/**
 * 段落下标即 elementPath。
 *
 * collectParagraphs 每个块级元素产出一个段落，所以段落序号就是「本章第几个
 * 可产生文本的块级元素」，正好是 EPUB_ANCHORING 定义的路径首段。行内元素目前
 * 不参与分段，路径只有一层；将来若要落到 inline 粒度，在这里追加层级即可。
 */
function elementPathFor(paragraphIndex: number): number[] {
  return [paragraphIndex]
}

/** 从一段句子选区构造持久化用的 Locator。 */
export function locatorFromSentenceRange(
  bookId: string,
  chapterIndex: number,
  chapter: SegmentedChapter,
  paragraphs: readonly string[],
  startSentence: number,
  endSentence: number,
): Locator | null {
  const first = chapter.sentences[startSentence]
  const last = chapter.sentences[endSentence]
  if (!first || !last) return null

  const paragraph = paragraphs[first.paragraphIndex] ?? ''
  const start = first.charOffset
  // 跨段落选区在当前交互下不会出现（句子选择限制在同一章内逐句扩展），
  // 但真出现时也不能算出一个错的长度，所以退化成只取首段剩余部分。
  const end = last.paragraphIndex === first.paragraphIndex
    ? last.charOffset + last.text.length
    : paragraph.length

  const context = extractContext(paragraph, start, end)

  return createLocator(bookId, {
    chapterIndex,
    elementPath: elementPathFor(first.paragraphIndex),
    textOffset: start,
    ...context,
  })
}

export type ResolvedRange = { chapterIndex: number; start: number; end: number }

/**
 * 把 Locator 还原成句子选区。
 *
 * 按 EPUB_ANCHORING 第 4 节逐级降级：原位精确命中 → 同段落内搜索 →
 * 全章上下文匹配 → 全章原文匹配。全都失败返回 null，由调用方决定
 * 是提示漂移还是暂存为「待匹配」。
 */
export function resolveLocator(
  position: TextPosition,
  chapters: SegmentedChapter[],
  chapterParagraphs: readonly (readonly string[])[],
): ResolvedRange | null {
  const { chapterIndex, selectedText } = position
  const chapter = chapters[chapterIndex]
  const paragraphs = chapterParagraphs[chapterIndex]
  if (!chapter || !paragraphs || !selectedText) return null

  const hit = locateAnchor(paragraphs, position)
  if (!hit) return null

  const range = sentenceRangeAt(chapter, hit.paragraphIndex, hit.start, selectedText.length)
  return range ? { chapterIndex, ...range } : null
}

type ParagraphHit = { paragraphIndex: number; start: number }

function locateAnchor(paragraphs: readonly string[], position: TextPosition): ParagraphHit | null {
  const { selectedText, beforeContext, textOffset } = position
  const origin = position.elementPath[0] ?? 0
  const originParagraph = paragraphs[origin]

  /**
   * 原位命中要求原文和前文同时对得上。
   *
   * 只比原文是不够的：结构重复的书（对话、诗行、「他说。」这类短句）里，
   * 同一个偏移在别的段落上也能字字相符，于是划线会静默钉在错误的那一处。
   * 前文不符时先记下这个候选，等所有更可靠的手段都失败再退回来用。
   */
  let fallback: ParagraphHit | null = null
  if (originParagraph !== undefined
    && originParagraph.slice(textOffset, textOffset + selectedText.length) === selectedText) {
    const contextMatches = !beforeContext
      || originParagraph.slice(Math.max(0, textOffset - beforeContext.length), textOffset) === beforeContext
    if (contextMatches) return { paragraphIndex: origin, start: textOffset }
    fallback = { paragraphIndex: origin, start: textOffset }
  }

  // 带上下文匹配：先在原段落内找，再扫全章。上下文是区分重复句子的唯一依据。
  if (beforeContext) {
    const needle = beforeContext + selectedText
    if (originParagraph !== undefined) {
      const at = originParagraph.indexOf(needle)
      if (at >= 0) return { paragraphIndex: origin, start: at + beforeContext.length }
    }
    for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
      const at = paragraph.indexOf(needle)
      if (at >= 0) return { paragraphIndex, start: at + beforeContext.length }
    }
  }

  // 上下文也没命中，说明前文本身被改过。退回原位候选。
  if (fallback) return fallback

  // 裸原文匹配：先在原段落里取离原偏移最近的一处，再扫全章取离原段落最近的一段。
  if (originParagraph !== undefined) {
    const at = nearestOccurrence(originParagraph, selectedText, textOffset)
    if (at >= 0) return { paragraphIndex: origin, start: at }
  }
  let best: ParagraphHit | null = null
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const at = paragraph.indexOf(selectedText)
    if (at < 0) continue
    if (!best || Math.abs(paragraphIndex - origin) < Math.abs(best.paragraphIndex - origin)) {
      best = { paragraphIndex, start: at }
    }
  }
  return best
}

/** 同一段落里出现多次时，取离原偏移最近的一处。 */
function nearestOccurrence(haystack: string, needle: string, near: number): number {
  let best = -1
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at
    at = haystack.indexOf(needle, at + 1)
  }
  return best
}

/** 把「段落内的字符区间」翻回句子区间，取所有与区间相交的句子。 */
function sentenceRangeAt(
  chapter: SegmentedChapter,
  paragraphIndex: number,
  start: number,
  length: number,
): Omit<ResolvedRange, 'chapterIndex'> | null {
  const runs = chapter.paragraphs[paragraphIndex]
  if (!runs?.length) return null
  const end = start + length

  const touched = runs.filter((run) => run.charOffset < end && run.charOffset + run.text.length > start)
  if (!touched.length) return null

  return { start: touched[0].index, end: touched[touched.length - 1].index }
}
