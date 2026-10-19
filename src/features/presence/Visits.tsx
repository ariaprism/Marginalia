import { useEffect, useState } from 'react'
import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { Locator } from '../../domain/locator'
import type { ReaderSession } from '../../domain/reader'
import { withTransaction } from '../../data/local/db'
import { loadBookChapters, type ChapterText } from '../../reader/bookContent'
import { usePresence } from './usePresence'
import { chapterName, cursorChapter, locatorAtVisitCursor, dayLabel, readerName, stateHasWords, visitTime } from './model'
import { StateSlip } from './Presence'

export function Visits({companionLabel,revision=0,onOpen}:{companionLabel:string;revision?:number;onOpen?:(bookId:string,locator?:Locator)=>void}) {
  const data=usePresence(revision)
  const [books,setBooks]=useState<Book[]>([])
  const [chapters,setChapters]=useState<Record<string,ChapterText[]>>({})
  const [notes,setNotes]=useState<Annotation[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(false)
  const [slip,setSlip]=useState<ReaderSession>()
  useEffect(()=>{
    let active=true
    void Promise.all([withTransaction<Book[]>('books','readonly',s=>s.getAll()),withTransaction<Annotation[]>('annotations','readonly',s=>s.getAll())]).then(async ([bs,annotations])=>{
      const cs=await Promise.all(bs.map(async b=>[b.id,await loadBookChapters(b.id)] as const))
      if(active){setBooks(bs);setChapters(Object.fromEntries(cs));setNotes(annotations);setLoading(false);setError(false)}
    }).catch(()=>{if(active){setError(true);setLoading(false)}})
    return ()=>{active=false}
  },[revision,data.sessions])
  const sessions=data.sessions.filter(s=>books.some(b=>b.id===s.bookId)&&(s.characterCount>0||s.traceCount>0||s.viewedAnnotationIds.length>0||stateHasWords(s.state))).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id))
  const groups=new Map<string,ReaderSession[]>()
  sessions.forEach(s=>{const day=dayLabel(s.startedAt);groups.set(day,[...(groups.get(day)??[]),s])})
  return <section className="drawer-page visits-page" aria-label="来访簿">
    <p className="visits-intro">翻过的书页，停留过的地方。</p>
    {(data.error||error)&&<p role="status">来访簿暂时没有打开，稍后再看一眼。</p>}
    {(data.loading||loading)&&<p role="status">正在翻开来访簿…</p>}
    {!data.loading&&!loading&&!data.error&&!error&&!sessions.length&&<div className="visits-empty"><span aria-hidden="true">—</span><p>来访簿还留着空白。</p><small>共读者翻过书页后，足迹会收在这里。</small></div>}
    {[...groups].map(([day,items])=><section className="visit-day" key={day}><h2>{day}</h2><div>{items.map(s=>{
      const name=readerName(s.readerId,companionLabel),book=books.find(b=>b.id===s.bookId)!,cs=chapters[s.bookId]??[]
      const start=chapterName(cs,s.startLocator?.position.chapterIndex??cursorChapter(s.startCursor)),end=chapterName(cs,s.endLocator?.position.chapterIndex??cursorChapter(s.endCursor))
      const traces=data.traces.filter(t=>t.sessionId===s.id)
      const stop=s.endLocator??s.startLocator??locatorAtVisitCursor(s.bookId,cs,s.endCursor??s.startCursor)
      const encountered=notes.filter(n=>n.bookId===s.bookId&&s.viewedAnnotationIds.includes(n.id))
      return <article className="visit-entry" key={s.id}>
        <time dateTime={s.startedAt}>{visitTime(s.startedAt)}</time>
        <h3>{name}{s.mode==='reading'?'翻开了':s.mode==='annotations'?'翻了翻你的页边文字 ·':s.mode==='unknown'?'翻过':'翻看了'}《{book.title}》</h3>
        <p>{s.mode==='reading'?(start===end?`在「${end}」停留`:`从「${start}」读到「${end}」`):s.mode==='annotations'?`遇见 ${s.viewedAnnotationIds.length} 条批注`:`翻到「${end}」附近`}{s.traceCount>0?`，留下 ${s.traceCount} 处痕迹。`:'。'}</p>
        {!s.closedAt&&s.mode==='reading'&&<small className="visit-unclosed">这次尚未留下合书余记</small>}
        <div className="visit-links">{onOpen&&stop&&<button type="button" onClick={()=>onOpen(s.bookId,stop)}>看看停留处</button>}{s.state&&stateHasWords(s.state)&&<button type="button" onClick={()=>setSlip(s)}>合书时的余记</button>}</div>
        {encountered.length>0&&<details><summary>这次遇见的批注 · {encountered.length}</summary>{encountered.map(n=><button type="button" className="visit-trace" key={n.id} onClick={()=>onOpen?.(s.bookId,n.locator)}><q>{n.locator.position.selectedText}</q><p>{n.text}</p></button>)}</details>}
        {traces.length>0&&<details><summary>查看页边文字 · {traces.length}</summary>{traces.map(t=><button type="button" className="visit-trace" key={t.id} onClick={()=>onOpen?.(s.bookId,t.locator)}><q>{t.locator.position.selectedText}</q>{t.text&&<p>{t.text}</p>}</button>)}</details>}
      </article>
    })}</div></section>)}
    {slip?.state&&<StateSlip name={readerName(slip.readerId,companionLabel)} state={slip.state} onClose={()=>setSlip(undefined)} />}
  </section>
}
