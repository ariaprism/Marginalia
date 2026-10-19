import { useEffect, useId, useRef } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { Locator } from '../../domain/locator'
import type { ReaderProgress, ReaderState } from '../../domain/reader'
import type { ChapterText } from '../../reader/bookContent'
import { chapterName, quoteAt, readerName, stateHasWords, visitTime } from './model'
import './presence.css'

export function StateSlip({name,state,onClose}:{name:string;state:Pick<ReaderState,'understanding'|'feeling'|'questions'|'attention'>;onClose:()=>void}) {
  const titleId=useId()
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;if(dialog?.showModal)dialog.showModal();else dialog?.setAttribute('open','')},[])
  return <dialog ref={ref} aria-labelledby={titleId} className="reader-state-slip" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <header><div><small>AFTER READING</small><h2 id={titleId}>{name} · 合书时的余记</h2></div><button type="button" onClick={onClose} aria-label="收起合书余记" autoFocus><X /></button></header>
    {state.understanding&&<section><h3>读到这里</h3><p>{state.understanding}</p></section>}
    {state.feeling&&<section><h3>余感</h3><p>{state.feeling}</p></section>}
    {state.questions.length>0&&<section><h3>还没解开的</h3>{state.questions.map((q,i)=><p key={i}>{q}</p>)}</section>}
    {state.attention.length>0&&<section><h3>仍在留意</h3><p>{state.attention.join(' · ')}</p></section>}
  </dialog>
}

export function RoomPresence({progress,states,chapters,companionLabel,onJump,onState}:{progress:ReaderProgress[];states:ReaderState[];chapters:ChapterText[];companionLabel:string;onJump:(locator:Locator)=>void;onState:(state:ReaderState)=>void}) {
  return <div className="room-presence">{progress.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>{
    const name=readerName(p.readerId,companionLabel), state=states.find(s=>s.readerId===p.readerId)
    return <section key={p.readerId} className="companion-stop">
      <button type="button" onClick={()=>onJump(p.locator)} aria-label={`看看${name}的最近停留`}><i aria-hidden="true" /><span><strong>{name} 停在 · {chapterName(chapters,p.locator.position.chapterIndex)}</strong><small>{visitTime(p.updatedAt)}</small><q>{quoteAt(p.locator,chapters)}</q></span><ChevronRight /></button>
      {state&&stateHasWords(state)&&<button type="button" className="room-state-link" onClick={()=>onState(state)}>合书时的余记<span>{visitTime(state.updatedAt)}</span></button>}
    </section>
  })}</div>
}
