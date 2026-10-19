import { createLocator, extractContext, type Locator } from '../../domain/locator'
import type { ReaderState } from '../../domain/reader'
import type { ChapterText } from '../../reader/bookContent'
import { segmentChapters, sentenceTextAtLocator } from '../../reader/sentenceAnchor'

export function readerName(id: string, companion: string): string {
  return id === 'xiaog' ? '小G' : id === 'xiaoyu' ? companion : id
}
export function chapterName(chapters: ChapterText[], index?: number): string {
  const chapter = index === undefined ? undefined : chapters[index]
  return chapter ? [chapter.chapter,chapter.title].filter(Boolean).join(' · ') : '书页之间'
}
export function cursorChapter(cursor?: string): number | undefined {
  const match = /^p1:(\d+):\d+:\d+$/.exec(cursor ?? '')
  return match ? +match[1] : undefined
}
export function quoteAt(locator: Locator, chapters: ChapterText[]): string {
  return sentenceTextAtLocator(locator.position,segmentChapters(chapters),chapters.map(c=>c.paragraphs)) ?? locator.position.selectedText
}
export function stateHasWords(state?: Pick<ReaderState,'understanding'|'feeling'|'questions'|'attention'>): boolean {
  return !!state && !!(state.understanding.trim() || state.feeling.trim() || state.questions.length || state.attention.length)
}
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const key = (d:Date) => new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)
  if (key(date) === key(now)) return '今天'
  if (key(date) === key(new Date(now.getTime()-86400000))) return '昨天'
  return key(date)
}
export function visitTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso))
}

/** Legacy sessions have precise text cursors but no Locator columns. */
export function locatorAtVisitCursor(bookId:string, chapters:ChapterText[], cursor?:string):Locator|undefined {
  const match=/^p1:(\d+):(\d+):(\d+)$/.exec(cursor??'')
  if(!match)return undefined
  const chapterIndex=+match[1],paragraphIndex=+match[2],offset=+match[3]
  const paragraph=chapters[chapterIndex]?.paragraphs[paragraphIndex]
  if(!paragraph||offset>paragraph.length)return undefined
  const start=Math.min(offset,Math.max(0,paragraph.length-1))
  return createLocator(bookId,{chapterIndex,elementPath:[paragraphIndex],textOffset:start,...extractContext(paragraph,start,Math.min(paragraph.length,start+48))})
}
