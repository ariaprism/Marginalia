import { useEffect, useState } from 'react'
import { withTransaction } from '../../data/local/db'
import { SHARED_LIBRARY_CHANGED_EVENT } from '../../data/local/sharedLibrary'
import { CLOUD_SYNC_FINISHED_EVENT } from '../../data/sync/syncSignals'
import type { ReaderProgress, ReaderSession, ReaderState, ReaderTrace } from '../../domain/reader'

export type Presence = {progress:ReaderProgress[];states:ReaderState[];sessions:ReaderSession[];traces:ReaderTrace[]}
const empty:Presence={progress:[],states:[],sessions:[],traces:[]}
export function usePresence(revision=0) {
  const [data,setData]=useState<Presence>(empty)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState(false)
  useEffect(()=>{
    let active=true, generation=0
    const load=async()=>{
      const current=++generation
      try {
        const [progress,states,sessions,traces]=await Promise.all([
          withTransaction<ReaderProgress[]>('readerProgress','readonly',s=>s.getAll()),
          withTransaction<ReaderState[]>('readerStates','readonly',s=>s.getAll()),
          withTransaction<ReaderSession[]>('readerSessions','readonly',s=>s.getAll()),
          withTransaction<ReaderTrace[]>('readerTraces','readonly',s=>s.getAll()),
        ])
        if(active&&current===generation){setData({progress,states,sessions,traces});setError(false);setLoading(false)}
      } catch {if(active&&current===generation){setError(true);setLoading(false)}}
    }
    void load()
    window.addEventListener(CLOUD_SYNC_FINISHED_EVENT,load)
    window.addEventListener(SHARED_LIBRARY_CHANGED_EVENT,load)
    return ()=>{active=false;window.removeEventListener(CLOUD_SYNC_FINISHED_EVENT,load);window.removeEventListener(SHARED_LIBRARY_CHANGED_EVENT,load)}
  },[revision])
  return {...data,error,loading}
}
