import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, CloudOff, LogOut, RefreshCw, RotateCcw } from 'lucide-react'
import { getOutboxOperations } from '../../data/local/syncStore'
import { getSupabaseClient } from '../../data/remote/supabaseClient'
import { syncProfileAndBooks } from '../../data/sync/profileBookSync'
import { cloudConnectionEnabled } from './config'

type CloudRoomState =
  | { kind: 'local'; pending: number }
  | { kind: 'loading'; pending: number }
  | { kind: 'signed-out'; pending: number; notice?: string }
  | { kind: 'signed-in'; pending: number; session: Session }
  | { kind: 'error'; pending: number; message: string }

export function CloudRoom() {
  const enabled = cloudConnectionEnabled()
  const client = enabled ? getSupabaseClient() : undefined
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const [state, setState] = useState<CloudRoomState>({ kind: enabled ? 'loading' : 'local', pending: 0 })

  useEffect(() => {
    let active = true
    void getOutboxOperations().then((operations) => {
      if (active) setState((current) => ({ ...current, pending: operations.length }))
    })
    if (!enabled) return () => { active = false }
    if (!client) {
      setState((current) => ({ kind: 'error', pending: current.pending, message: '云端门签缺少连接配置。' }))
      return () => { active = false }
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setState((current) => error
        ? { kind: 'error', pending: current.pending, message: error.message }
        : data.session
          ? { kind: 'signed-in', pending: current.pending, session: data.session }
          : { kind: 'signed-out', pending: current.pending })
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setState((current) => session
        ? { kind: 'signed-in', pending: current.pending, session }
        : { kind: 'signed-out', pending: current.pending })
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [client, enabled])

  const requestMagicLink = async (event: FormEvent) => {
    event.preventDefault()
    if (!client || !email.trim()) return
    setSending(true)
    const redirect = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect, shouldCreateUser: false },
    })
    setSending(false)
    setState((current) => error
      ? { kind: 'error', pending: current.pending, message: '这个邮箱尚未登记，或云端暂时没有回信。' }
      : { kind: 'signed-out', pending: current.pending, notice: '门帖已经寄出，请到邮箱里轻点登录链接。' })
  }

  const signOut = async () => {
    if (!client) return
    await client.auth.signOut()
  }

  const syncFirstSlice = async () => {
    if (!client || state.kind !== 'signed-in') return
    setSyncing(true)
    setSyncNotice(undefined)
    try {
      const result = await syncProfileAndBooks(client, state.session.user.id)
      const pending = (await getOutboxOperations()).length
      const now = new Date()
      setLastSyncedAt(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      setState((current) => ({ ...current, pending }))
      setSyncNotice(`名帖与书目已收好：寄出 ${result.pushed} 笔，取回 ${result.pulled} 笔。其余内容仍安全留在本机。`)
    } catch {
      setSyncNotice('这次没有寄到云端。本地内容没有丢失，稍后可以再试。')
    } finally {
      setSyncing(false)
    }
  }

  const localOnly = state.kind === 'local'
  const signedIn = state.kind === 'signed-in'
  const statusText = localOnly
    ? '这处施工书房只留在当前浏览器'
    : state.kind === 'loading'
      ? '正在辨认云端门帖…'
      : signedIn
        ? '云端门帖已认出，名帖与书目可以先收好'
        : '尚未登录云端书房'

  return (
    <section className="drawer-page" aria-live="polite">
      <section className="cloud-room drawer-panel" aria-label="云端书房">
        <div className={`cloud-room-status ${signedIn ? 'is-connected' : ''}`}>
          <span className="cloud-room-mark">{localOnly ? <CloudOff /> : <Cloud />}</span>
          <div><small>{localOnly ? 'LOCAL WORKROOM' : 'PRIVATE CLOUD ROOM'}</small><strong>{statusText}</strong></div>
        </div>

        <p className="cloud-room-copy">
          {localOnly
            ? 'localhost 默认不碰真实藏书。需要调试云端时，小G会使用另一个测试账号。'
            : '正式书房只认 Supabase 登录身份；项目地址与钥匙已由部署配置收好，不需要在这里填写。'}
        </p>

        {!localOnly && state.kind !== 'loading' && !signedIn && <form className="cloud-login" onSubmit={(event) => { void requestMagicLink(event) }}>
          <label><span>云端门帖邮箱</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
          <button type="submit" disabled={sending}>{sending ? '正在寄出…' : '寄一封登录门帖'}</button>
          <small>只接受已经登记的邮箱，不会从公开页面创建陌生账号。</small>
        </form>}

        {state.kind === 'signed-out' && state.notice && <p className="cloud-room-notice" role="status">{state.notice}</p>}
        {state.kind === 'error' && <p className="cloud-room-notice is-error" role="alert">{state.message}</p>}
        {signedIn && <div className="cloud-identity"><div><small>当前门帖</small><strong>{state.session.user.email ?? '已登录的私人账号'}</strong></div><button type="button" onClick={() => { void signOut() }}><LogOut />退出</button></div>}

        <div className="cloud-sync-summary">
          <div><small>待寄墨迹</small><strong>{state.pending}</strong></div>
          <div><small>最近收好</small><strong>{signedIn ? (lastSyncedAt ?? '尚未首次同步') : '—'}</strong></div>
        </div>

        <div className="cloud-actions">
          <button type="button" disabled={!signedIn || syncing} onClick={() => { void syncFirstSlice() }} title="现阶段只同步名帖与书目"><RefreshCw /><span>{syncing ? '正在收好…' : '先收名帖与书目'}<small>EPUB 与痕迹仍留在本机</small></span></button>
          <button type="button" disabled title="完整恢复流程接通后启用"><RotateCcw /><span>从云端恢复<small>重建这台设备的书房</small></span></button>
        </div>
        {syncNotice && <p className="cloud-room-notice" role="status">{syncNotice}</p>}
        <p className="cloud-room-footnote">第一段真实同步已经接通。等 EPUB、痕迹和恢复保护通过验收后，这里才会变成完整的“立即收好”。</p>
      </section>
    </section>
  )
}
