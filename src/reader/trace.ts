import type { Locator } from '../domain/locator'

export type NoteEntry = { id: string; text: string; createdAt: string; timestamp?: string }

export type OrderedTraceNote = NoteEntry & { actor: 'user' | 'companion'; editable: boolean }

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
  /** 本地 MCP 共读者直接在书页上留下的文字。署名来自名帖，不在记录里重复保存。 */
  companionNotes?: NoteEntry[]
  /** 共读者只划线、没有写文字时仍保留这处痕迹。 */
  companionHighlighted?: boolean
  fish?: string
  fishAt?: string
  fishTimestamp?: string
  /** 稳定定位。只有还没落库的临时痕迹才会缺。 */
  locator?: Locator
  /** 重锚定失败：正文里再也找不到这句话，只能列出来但没法跳转。 */
  drifted?: boolean
}

/** 命中一句时，优先取覆盖它的最短痕迹，供重叠痕迹的阅读页交互使用。 */
export function traceAtSentence(
  traces: readonly Trace[],
  chapterIndex: number,
  sentenceIndex: number,
): Trace | undefined {
  return traces
    .filter((trace) => trace.chapterIndex === chapterIndex
      && trace.sentenceStart !== undefined
      && trace.sentenceEnd !== undefined
      && sentenceIndex >= trace.sentenceStart
      && sentenceIndex <= trace.sentenceEnd)
    .sort((left, right) => {
      const leftLength = (left.sentenceEnd ?? 0) - (left.sentenceStart ?? 0)
      const rightLength = (right.sentenceEnd ?? 0) - (right.sentenceStart ?? 0)
      return leftLength - rightLength
    })[0]
}

/** 双方文字共用一条时间线；身份只影响署名颜色与是否可编辑。 */
export function orderedTraceNotes(trace?: Trace | null): OrderedTraceNote[] {
  if (!trace) return []
  const notes: OrderedTraceNote[] = [
    ...(trace.foxNotes ?? []).map((note) => ({ ...note, actor: 'user' as const, editable: true })),
    ...(trace.companionNotes ?? []).map((note) => ({ ...note, actor: 'companion' as const, editable: false })),
    ...(trace.fish
      ? [{
          id: `legacy-companion-${trace.id}`,
          text: trace.fish,
          createdAt: trace.fishAt ?? '',
          timestamp: trace.fishTimestamp,
          actor: 'companion' as const,
          editable: false,
        }]
      : []),
  ]
  return notes.sort((left, right) => {
    const leftTime = left.timestamp ?? left.createdAt
    const rightTime = right.timestamp ?? right.createdAt
    return leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id)
  })
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
