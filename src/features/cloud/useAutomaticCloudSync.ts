import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../data/remote/supabaseClient'
import { runCloudSync } from '../../data/sync/cloudSync'
import { OUTBOX_CHANGED_EVENT } from '../../data/sync/syncSignals'
import { cloudConnectionEnabled } from './config'

const WRITE_DEBOUNCE_MS = 2500
const REALTIME_DEBOUNCE_MS = 350

export function useAutomaticCloudSync(onLocalContentChanged: () => void): void {
  const enabled = cloudConnectionEnabled()
  const client = enabled ? getSupabaseClient() : undefined
  const [session, setSession] = useState<Session | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const callbackRef = useRef(onLocalContentChanged)
  callbackRef.current = onLocalContentChanged

  const cancelScheduled = useCallback(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  const syncNow = useCallback(() => {
    if (!client || !session || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    void runCloudSync(client, session.user.id)
      .then(() => callbackRef.current())
      .catch((error) => console.warn('自动收好暂未成功；内容仍安全留在本机。', error))
  }, [client, session])

  const schedule = useCallback((delay: number) => {
    cancelScheduled()
    timerRef.current = window.setTimeout(syncNow, delay)
  }, [cancelScheduled, syncNow])

  useEffect(() => {
    if (!client) return
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      // Auth 回调中不调用任何异步 Supabase API，避免阻塞客户端内部锁。
      if (active) setSession(nextSession)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [client])

  useEffect(() => {
    if (!client || !session) {
      cancelScheduled()
      return
    }

    const requestAfterWrite = () => schedule(WRITE_DEBOUNCE_MS)
    const requestWhenOnline = () => schedule(0)
    const requestOnVisibility = () => schedule(document.visibilityState === 'visible' ? 0 : 100)
    const requestBeforeLeaving = () => syncNow()
    window.addEventListener(OUTBOX_CHANGED_EVENT, requestAfterWrite)
    window.addEventListener('online', requestWhenOnline)
    window.addEventListener('pagehide', requestBeforeLeaving)
    document.addEventListener('visibilitychange', requestOnVisibility)

    let channel: RealtimeChannel | undefined
    channel = client
      .channel(`cloud-ink:${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sync_changes',
        filter: `owner_id=eq.${session.user.id}`,
      }, () => schedule(REALTIME_DEBOUNCE_MS))
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('云端变化提醒暂不可用；启动、重连与回到前台仍会补收。', error)
        }
      })

    schedule(0)
    return () => {
      cancelScheduled()
      window.removeEventListener(OUTBOX_CHANGED_EVENT, requestAfterWrite)
      window.removeEventListener('online', requestWhenOnline)
      window.removeEventListener('pagehide', requestBeforeLeaving)
      document.removeEventListener('visibilitychange', requestOnVisibility)
      if (channel) void client.removeChannel(channel)
    }
  }, [cancelScheduled, client, schedule, session, syncNow])
}
