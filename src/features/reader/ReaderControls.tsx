import { BarChart3, Highlighter, ListTree, SunMoon, Type, X } from 'lucide-react'
import type { ChapterText } from '../../reader/bookContent'
import type { Trace } from '../../reader/trace'
import type { ReaderTheme, ReaderTypeface } from './useReaderAppearance'

export type ReaderPanel = 'toc' | 'traces' | 'stats' | 'type' | null

function traceLineClass(trace: Trace) {
  if (trace.highlighted) return 'trace-line-highlight'
  if (trace.foxNotes?.length) return 'trace-line-annotation'
  return ''
}

function PanelHeading({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) {
  return <div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={close} aria-label={`关闭${title}`}><X /></button></div>
}

type Props = {
  panel: ReaderPanel
  chromeVisible: boolean
  chapters: ChapterText[]
  chapterStarts: number[]
  currentChapterIndex: number
  traces: Trace[]
  userLabel: string
  companionLabel: string
  pageIndex: number
  totalPages: number
  theme: ReaderTheme
  fontSize: number
  lineHeight: number
  pageMargin: number
  readerTypeface: ReaderTypeface
  onPanelChange: (panel: ReaderPanel) => void
  onThemeChange: (theme: ReaderTheme) => void
  onFontSizeChange: (value: number) => void
  onLineHeightChange: (value: number) => void
  onPageMarginChange: (value: number) => void
  onTypefaceChange: (value: ReaderTypeface) => void
  onJumpToChapter: (index: number) => void
  onJumpToTrace: (trace: Trace) => void
}

export function ReaderControls(props: Props) {
  const close = () => props.onPanelChange(null)
  return (
    <>
      {props.panel && (
        <section className="reader-panel">
          <div className="panel-handle" />
          {props.panel === 'toc' && <><PanelHeading eyebrow="CONTENTS" title="目录" close={close} /><div className="toc-list">{props.chapters.map((chapter, index) => <button className={index === props.currentChapterIndex ? 'is-current' : ''} type="button" key={chapter.title} onClick={() => props.onJumpToChapter(index)}><span>{chapter.chapter}</span><strong>{chapter.title}</strong><small>{String((props.chapterStarts[index] ?? 0) + 1).padStart(2, '0')}</small></button>)}</div></>}
          {props.panel === 'traces' && <><PanelHeading eyebrow="MARGINALIA" title="页边痕迹" close={close} /><div className="trace-list">{props.traces.length === 0 ? <p className="panel-empty">这本书还没有留下痕迹。</p> : [...props.traces].reverse().map((trace) => <button type="button" key={trace.id} onClick={() => props.onJumpToTrace(trace)}><small>{trace.chapter}</small><blockquote>“<span className={traceLineClass(trace)}>{trace.quote}</span>”</blockquote>{trace.foxNotes?.map((note) => <p key={note.id}><b>{props.userLabel}</b>：{note.text}</p>)}{trace.fish && <p className="fish-note"><b>{props.companionLabel}</b>：{trace.fish}</p>}</button>)}</div></>}
          {props.panel === 'stats' && <><PanelHeading eyebrow="READING LIFE" title="阅读统计" close={close} /><div className="stats-grid stats-grid-v2"><div><strong>{Math.round(((props.pageIndex + 1) / props.totalPages) * 100)}<sup>%</sup></strong><small>当前所在位置</small></div><div><strong>{props.currentChapterIndex + 1} / {props.chapters.length} 章</strong><small>当前章节</small></div><div><strong>{props.traces.length} 条</strong><small>笔记与划线</small></div></div></>}
          {props.panel === 'type' && <><PanelHeading eyebrow="TYPESETTING" title="排版" close={close} /><div className="type-settings">
            <label><span>字号 <small>{props.fontSize}px</small></span><input type="range" min="16" max="25" value={props.fontSize} onChange={(event) => props.onFontSizeChange(Number(event.target.value))} /></label>
            <label><span>行距 <small>{props.lineHeight.toFixed(1)}</small></span><input type="range" min="1.5" max="2.3" step="0.1" value={props.lineHeight} onChange={(event) => props.onLineHeightChange(Number(event.target.value))} /></label>
            <label><span>页边距 <small>{props.pageMargin}%</small></span><input type="range" min="7" max="18" value={props.pageMargin} onChange={(event) => props.onPageMarginChange(Number(event.target.value))} /></label>
            <label><span>字体</span><select value={props.readerTypeface} onChange={(event) => props.onTypefaceChange(event.target.value as ReaderTypeface)}><option value="serif">书页宋体</option><option value="sans">清晰黑体</option></select></label>
          </div></>}
        </section>
      )}
      <nav className={`reader-toolbar ${props.chromeVisible ? 'is-visible' : ''}`} aria-label="阅读工具">
        <button aria-label="目录" title="目录" className={props.panel === 'toc' ? 'is-active' : ''} type="button" onClick={() => props.onPanelChange(props.panel === 'toc' ? null : 'toc')}><ListTree /></button>
        <button aria-label="页边痕迹" title="页边痕迹" className={props.panel === 'traces' ? 'is-active' : ''} type="button" onClick={() => props.onPanelChange(props.panel === 'traces' ? null : 'traces')}><Highlighter /></button>
        <button aria-label="阅读统计" title="阅读统计" className={props.panel === 'stats' ? 'is-active' : ''} type="button" onClick={() => props.onPanelChange(props.panel === 'stats' ? null : 'stats')}><BarChart3 /></button>
        <button aria-label={props.theme === 'day' ? '切换至夜间模式' : '切换至日间模式'} title={props.theme === 'day' ? '夜间模式' : '日间模式'} type="button" onClick={() => props.onThemeChange(props.theme === 'day' ? 'night' : 'day')}><SunMoon /></button>
        <button aria-label="排版设置" title="排版设置" className={props.panel === 'type' ? 'is-active' : ''} type="button" onClick={() => props.onPanelChange(props.panel === 'type' ? null : 'type')}><Type /></button>
      </nav>
    </>
  )
}
