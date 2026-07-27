import { createAnnotation, type Annotation } from '../../domain/annotation'
import { createHighlight, type Highlight } from '../../domain/highlight'
import type { Locator, TextPosition } from '../../domain/locator'
import { createMarginalia, type Marginalia } from '../../domain/marginalia'
import type { ChapterText } from '../../reader/bookContent'
import { resolveLocator, type SegmentedChapter } from '../../reader/sentenceAnchor'
import { formatStoredTime, type NoteEntry, type Trace } from '../../reader/trace'
import { newId } from '../../shared/id'
import {
  deleteAnnotation,
  deleteHighlight,
  deleteMarginalia,
  getAnnotations,
  getHighlights,
  getMarginalia,
  saveAnnotation,
  saveHighlight,
  saveMarginalia,
} from './bookStore'

/**
 * Trace 与领域记录之间的读写层。
 *
 * 一处痕迹在库里是若干行：可能有一条 Highlight、若干条 Annotation、
 * 以及依附其上的 Marginalia。把它们归到同一处痕迹的依据是 Locator 本身
 * ——同时创建的记录持有完全相同的定位信息，所以定位串就是天然的分组键。
 * 不用自增 id 或额外的 traceId 字段，是为了让「重新导入同一本书」之后
 * 旧痕迹仍然能归到一起。
 */

/** 定位串：同一处原文的所有记录共享它。 */
export function passageKey(position: TextPosition): string {
  return [
    position.chapterIndex,
    position.elementPath.join('.'),
    position.textOffset,
    position.selectedText,
  ].join('|')
}

function highlightIdFor(bookId: string, position: TextPosition): string {
  return `hl:${bookId}:${passageKey(position)}`
}

function chapterLabel(chapters: ChapterText[], chapterIndex: number): string {
  const chapter = chapters[chapterIndex]
  return chapter ? `${chapter.chapter} · ${chapter.title}` : `第 ${chapterIndex + 1} 章`
}

type Bundle = {
  locator: Locator
  highlight?: Highlight
  annotations: Annotation[]
  marginalia: Marginalia[]
}

/**
 * 读出一本书的全部痕迹。
 *
 * 每处痕迹的句子区间在这里重新算：库里存的是 Locator，句子索引会随分段变化，
 * 不能持久化。算不出来的标成 drifted，仍然列在痕迹面板里，但不给跳转。
 */
export async function loadTraces(
  bookId: string,
  chapters: ChapterText[],
  segmented: SegmentedChapter[],
): Promise<Trace[]> {
  const [highlights, annotations, marginalia] = await Promise.all([
    getHighlights(bookId),
    getAnnotations(bookId),
    getMarginalia(bookId),
  ])

  const bundles = new Map<string, Bundle>()
  const bundleFor = (locator: Locator): Bundle => {
    const key = passageKey(locator.position)
    let bundle = bundles.get(key)
    if (!bundle) {
      bundle = { locator, annotations: [], marginalia: [] }
      bundles.set(key, bundle)
    }
    return bundle
  }

  for (const highlight of highlights) bundleFor(highlight.locator).highlight = highlight
  for (const annotation of annotations) bundleFor(annotation.locator).annotations.push(annotation)
  for (const item of marginalia) bundleFor(item.locator).marginalia.push(item)

  const paragraphs = chapters.map((chapter) => chapter.paragraphs)
  const traces: Trace[] = []

  for (const [key, bundle] of bundles) {
    const { position } = bundle.locator
    const resolved = resolveLocator(position, segmented, paragraphs)
    // 时间相同时再按 id 分先后：跨会话写入的记录仍可能撞上同一毫秒，
    // 没有次级依据的话排序结果就不稳定，同一处痕迹每次打开顺序都不一样。
    const notes = [...bundle.annotations]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map<NoteEntry>((annotation) => ({
        id: annotation.id,
        text: annotation.text,
        createdAt: formatStoredTime(annotation.createdAt),
      }))
    const reply = [...bundle.marginalia]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]

    traces.push({
      id: key,
      bookId,
      chapterIndex: position.chapterIndex,
      sentenceStart: resolved?.start,
      sentenceEnd: resolved?.end,
      highlighted: Boolean(bundle.highlight),
      chapter: chapterLabel(chapters, position.chapterIndex),
      quote: position.selectedText,
      foxNotes: notes.length ? notes : undefined,
      fish: reply?.text,
      fishAt: reply ? formatStoredTime(reply.createdAt) : undefined,
      locator: bundle.locator,
      drifted: !resolved,
    })
  }

  return traces.sort((a, b) => {
    if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex - b.chapterIndex
    return (a.sentenceStart ?? 0) - (b.sentenceStart ?? 0)
  })
}

/** 划线：写入一行 Highlight。同一处原文重复划线是幂等的。 */
export async function persistHighlight(locator: Locator, color: Highlight['color'] = 'rose'): Promise<void> {
  await saveHighlight(createHighlight({
    id: highlightIdFor(locator.bookId, locator.position),
    bookId: locator.bookId,
    locator,
    color,
  }))
}

/** 取消划线：只删 Highlight，批注和她的回信留着。 */
export async function removeHighlight(locator: Locator): Promise<void> {
  await deleteHighlight(highlightIdFor(locator.bookId, locator.position))
}

/**
 * 写入一条批注。
 *
 * noteId 由调用方决定：新写传 undefined 拿一个新 id，编辑旧批注传原 id 覆盖。
 * 返回值就是这条批注在库里的 id，界面上的 NoteEntry.id 与它一致。
 */
/**
 * 保证同一次会话里发出的时间戳严格递增。
 *
 * 界面按 createdAt 排序，而 toISOString() 只到毫秒：连着写两条批注拿到同一个时间，
 * 排序就没有确定的先后，刷新一次两条的位置可能对调。撞上就顺延一毫秒，
 * 让写入顺序变成时间戳里真实存在的信息。
 */
let lastIssuedAt = 0

function nextTimestamp(): string {
  const now = Math.max(Date.now(), lastIssuedAt + 1)
  lastIssuedAt = now
  return new Date(now).toISOString()
}

export async function persistNote(
  locator: Locator,
  text: string,
  noteId?: string,
  highlighted = false,
  createdAt?: string,
): Promise<string> {
  const id = noteId ?? `note-${newId()}`
  const existing = noteId
    ? (await getAnnotations(locator.bookId)).find((annotation) => annotation.id === noteId)
    : undefined

  await saveAnnotation(createAnnotation(
    {
      id,
      bookId: locator.bookId,
      highlightId: highlighted ? highlightIdFor(locator.bookId, locator.position) : undefined,
      locator,
      text,
    },
    // 编辑保留原始创建时间：界面按创建时间排序，改字不该让批注跳位。
    existing?.createdAt ?? createdAt ?? nextTimestamp(),
  ))
  return id
}

export async function removeNote(noteId: string): Promise<void> {
  await deleteAnnotation(noteId)
}

/** 她的回信。依附于该处痕迹的第一条批注。 */
export async function persistReply(
  locator: Locator,
  annotationId: string,
  text: string,
  createdAt?: string,
): Promise<string> {
  const id = `mg-${newId()}`
  await saveMarginalia(createMarginalia(
    {
      id,
      bookId: locator.bookId,
      annotationId,
      locator,
      text,
      visibility: 'immediate',
    },
    createdAt,
  ))
  return id
}

export async function removeReply(marginaliaId: string): Promise<void> {
  await deleteMarginalia(marginaliaId)
}

/** 整处痕迹删除：划线、批注、回信一起清掉。 */
export async function removeTrace(bookId: string, position: TextPosition): Promise<void> {
  const key = passageKey(position)
  const [annotations, marginalia] = await Promise.all([
    getAnnotations(bookId),
    getMarginalia(bookId),
  ])

  await Promise.all([
    deleteHighlight(highlightIdFor(bookId, position)),
    ...annotations
      .filter((annotation) => passageKey(annotation.locator.position) === key)
      .map((annotation) => deleteAnnotation(annotation.id)),
    ...marginalia
      .filter((item) => passageKey(item.locator.position) === key)
      .map((item) => deleteMarginalia(item.id)),
  ])
}
