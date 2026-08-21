import { Download, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getAnnotations } from '../../data/local/bookStore'
import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { ChapterText } from '../../reader/bookContent'
import { newId } from '../../shared/id'
import {
  buildReadingExchangePackage,
  parseCompanionExchangeResponse,
  readingExchangeToMarkdown,
  type CompanionExchangeResponse,
} from './contract'
import { importCompanionExchangeResponse, type ExchangeImportReport } from './localExchange'

type Props = {
  mode: 'export' | 'import'
  book: Pick<Book, 'id' | 'title' | 'author'>
  chapters: ChapterText[]
  userName: string
  companionName: string
  onClose: () => void
  onImported: () => Promise<void> | void
  onNotice: (message: string, details?: string) => void
}

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function safeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'marginalia'
}

function reportSummary(report: ExchangeImportReport): string {
  const parts = [`夹回 ${report.written} 条文字`, `读过未回 ${report.seen} 条`]
  if (report.duplicate) parts.push(`略过重复 ${report.duplicate} 条`)
  if (report.rejected.length) parts.push(`未能辨认 ${report.rejected.length} 条`)
  return parts.join('，')
}

export function ReadingExchangeDialog(props: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [loading, setLoading] = useState(true)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [parsedResponse, setParsedResponse] = useState<CompanionExchangeResponse | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAnnotations(props.book.id)
      .then((items) => {
        if (cancelled) return
        setAnnotations(items)
        const firstChapter = props.chapters.findIndex((_, index) => items.some((item) => item.locator.position.chapterIndex === index))
        const initialChapter = Math.max(0, firstChapter)
        setChapterIndex(initialChapter)
        setSelectedIds(new Set(items
          .filter((item) => item.locator.position.chapterIndex === initialChapter)
          .map((item) => item.id)))
      })
      .catch((error) => setParseError(error instanceof Error ? error.message : String(error)))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.book.id, props.chapters])

  const chapterAnnotations = useMemo(() => annotations.filter(
    (annotation) => annotation.locator.position.chapterIndex === chapterIndex,
  ), [annotations, chapterIndex])

  const chooseChapter = (next: number) => {
    setChapterIndex(next)
    setSelectedIds(new Set(annotations
      .filter((item) => item.locator.position.chapterIndex === next)
      .map((item) => item.id)))
  }

  const exchange = () => {
    const chapter = props.chapters[chapterIndex]
    if (!chapter) throw new Error('找不到所选章节。')
    return buildReadingExchangePackage({
      book: props.book,
      chapter,
      chapterIndex,
      annotations: chapterAnnotations.filter((annotation) => selectedIds.has(annotation.id)),
      userName: props.userName,
      companionName: props.companionName,
      exchangeId: `exchange-${newId()}`,
    })
  }

  const copyMarkdown = async () => {
    const text = readingExchangeToMarkdown(exchange())
    try {
      await navigator.clipboard.writeText(text)
      props.onNotice('给她阅读的文字已经复制。')
    } catch {
      props.onNotice('暂时无法复制', '浏览器没有允许读取剪贴板，请改用“保存交换包”。')
    }
  }

  const downloadExchange = () => {
    const value = exchange()
    downloadText(
      `${safeFilename(props.book.title)}-${safeFilename(value.chapter.title)}-共读交换包.json`,
      JSON.stringify(value, null, 2),
      'application/json;charset=utf-8',
    )
    props.onNotice('共读交换包已经保存。')
  }

  const readResponse = async (file?: File) => {
    setParsedResponse(null)
    setParseError(null)
    if (!file) return
    try {
      const response = parseCompanionExchangeResponse(await file.text())
      if (response.bookId !== props.book.id) throw new Error('这份回复属于另一本书。')
      setParsedResponse(response)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error))
    }
  }

  const confirmImport = async () => {
    if (!parsedResponse || importing) return
    setImporting(true)
    try {
      const report = await importCompanionExchangeResponse(parsedResponse, props.book.id)
      await props.onImported()
      props.onNotice('她的页边文字已经收回。', reportSummary(report))
      props.onClose()
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error))
    } finally {
      setImporting(false)
    }
  }

  const selectedCount = selectedIds.size
  return (
    <div className="exchange-backdrop" onClick={props.onClose}>
      <section className="exchange-dialog" role="dialog" aria-modal="true" aria-labelledby="exchange-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><small>{props.mode === 'export' ? 'PASS A PAGE TO HER' : 'RETURN TO THE MARGINS'}</small><h2 id="exchange-title">{props.mode === 'export' ? '递一页给她' : '收回她的页边文字'}</h2></div>
          <button type="button" onClick={props.onClose} aria-label="关闭共读交换"><X /></button>
        </header>

        {props.mode === 'export' ? (
          <>
            <p className="exchange-intro">从一个章节选出想请{props.companionName}阅读的批注。每条会带上批注所在段及前后各两段正文。</p>
            {loading ? <p className="exchange-empty">正在翻找批注…</p> : annotations.length === 0 ? (
              <p className="exchange-empty">这本书还没有可以递出的批注。先在书页上留下一点文字吧。</p>
            ) : (
              <>
                <label className="exchange-chapter-select"><span>选择章节</span><select value={chapterIndex} onChange={(event) => chooseChapter(Number(event.target.value))}>
                  {props.chapters.map((chapter, index) => {
                    const count = annotations.filter((item) => item.locator.position.chapterIndex === index).length
                    return <option key={`${index}-${chapter.title}`} value={index} disabled={!count}>{chapter.chapter} · {chapter.title}{count ? `（${count} 条）` : ''}</option>
                  })}
                </select></label>
                <div className="exchange-invitations" role="group" aria-label="选择要递出的批注">
                  {chapterAnnotations.map((annotation) => (
                    <label key={annotation.id}>
                      <input type="checkbox" checked={selectedIds.has(annotation.id)} onChange={() => setSelectedIds((current) => {
                        const next = new Set(current)
                        if (next.has(annotation.id)) next.delete(annotation.id); else next.add(annotation.id)
                        return next
                      })} />
                      <span><q>{annotation.locator.position.selectedText}</q><small>{props.userName}：{annotation.text}</small></span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <footer>
              <button type="button" onClick={() => void copyMarkdown()} disabled={!selectedCount}>复制给{props.companionName}</button>
              <button className="exchange-primary" type="button" onClick={downloadExchange} disabled={!selectedCount}><Download />保存交换包</button>
            </footer>
          </>
        ) : (
          <>
            <p className="exchange-intro">选择{props.companionName}按交换契约返回的 JSON。确认后，回复会按原批注的 Locator 夹回书页。</p>
            <label className="exchange-file"><span>{parsedResponse ? '已经辨认出回复文件' : '选择回复 JSON'}</span><input type="file" accept="application/json,.json" onChange={(event) => void readResponse(event.target.files?.[0])} /></label>
            {parseError && <p className="exchange-error">{parseError}</p>}
            {parsedResponse && <section className="exchange-response-preview" aria-label="回复预览"><b>{parsedResponse.companion.name}</b><span>读过 {parsedResponse.responses.length} 条邀请</span><span>留下 {parsedResponse.responses.filter((item) => item.action === 'reply').length} 条文字</span><span>安静略过 {parsedResponse.responses.filter((item) => item.action === 'seen').length} 条</span></section>}
            <footer><button type="button" onClick={props.onClose}>暂不收回</button><button className="exchange-primary" type="button" disabled={!parsedResponse || importing} onClick={() => void confirmImport()}>{importing ? '正在夹回…' : '确认夹回书页'}</button></footer>
          </>
        )}
      </section>
    </div>
  )
}
