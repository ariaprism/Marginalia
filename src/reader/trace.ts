import type { Locator } from '../domain/locator'

export type NoteEntry = { id: string; text: string; createdAt: string }

/**
 * Trace 是阅读器里「一处痕迹」的视图模型：一句原文，加上划线状态、我写的批注、
 * 以及她的回信。持久层不存这个形状，而是拆成 Highlight / Annotation / Marginalia
 * 三种领域记录，见 data/local/traceStore.ts。
 */
export type Trace = {
  id: string
  bookId: string
  chapterIndex: number
  /** 运行时的句子区间，由 locator 重新算出，不进持久层。 */
  sentenceStart?: number
  sentenceEnd?: number
  highlighted?: boolean
  chapter: string
  quote: string
  foxNotes?: NoteEntry[]
  fish?: string
  fishAt?: string
  /** 稳定定位。只有还没落库的临时痕迹才会缺。 */
  locator?: Locator
  /** 重锚定失败：正文里再也找不到这句话，只能列出来但没法跳转。 */
  drifted?: boolean
}

export function formatTraceTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${pad(date.getHours())}：${pad(date.getMinutes())}`
}

/** 把库里的 ISO 时间转成界面上那种 07/14/18：47。 */
export function formatStoredTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : formatTraceTime(date)
}
