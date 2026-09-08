import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, CloudOff, LogOut, RefreshCw, RotateCcw } from 'lucide-react'
import {
  compactOutbox,
  getPendingSyncSummary,
  getSyncState,
  type PendingSyncSummary,
} from '../../data/local/syncStore'
import { getSupabaseClient } from '../../data/remote/supabaseClient'
import { runCloudSync } from '../../data/sync/cloudSync'
import { restoreCloudLibrary } from '../../data/sync/cloudRestore'
import { CLOUD_SYNC_FINISHED_EVENT } from '../../data/sync/syncSignals'
import { cloudConnectionEnabled } from './config'

type CloudRoomState =
  | { kind: 'local'; pending: number }
  | { kind: 'loading'; pending: number }
  | { kind: 'signed-out'; pending: number; notice?: string }
  | { kind: 'signed-in'; pending: number; session: Session }
  | { kind: 'error'; pending: number; message: string }

const EMPTY_PENDING: PendingSyncSummary = {
  operations: 0,
  books: 0,
  profile: 0,
  files: 0,
  chapters: 0,
  reading: 0,
  traces: 0,
}

export function CloudRoom({ onLocalContentChanged }: { onLocalContentChanged?: () => void } = {}) {
  const enabled = cloudConnectionEnabled()
  const client = enabled ? getSupabaseClient() : undefined
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const [pendingSummary, setPendingSummary] = useState(EMPTY_PENDING)
  const [state, setState] = useState<CloudRoomState>({ kind: enabled ? 'loading' : 'local', pending: 0 })
  const signedInUserId = state.kind === 'signed-in' ? state.session.user.id : undefined

  useEffect(() => {
    let active = true
    void compactOutbox().then(() => getPendingSyncSummary()).then((summary) => {
      if (!active) return
      setPendingSummary(summary)
      setState((current) => ({ ...current, pending: summary.operations }))
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

  useEffect(() => {
    if (!signedInUserId) return
    let active = true
    const refreshCloudStatus = async () => {
      await compactOutbox()
      const [pending, syncState] = await Promise.all([
        getPendingSyncSummary(),
        getSyncState(signedInUserId),
      ])
      if (!active) return
      setPendingSummary(pending)
      setState((current) => ({ ...current, pending: pending.operations }))
      if (syncState?.lastSuccessfulSyncAt) {
        setLastSyncedAt(new Date(syncState.lastSuccessfulSyncAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      }
    }
    void refreshCloudStatus()
    const refreshAfterAutomaticSync = () => { void refreshCloudStatus() }
    window.addEventListener(CLOUD_SYNC_FINISHED_EVENT, refreshAfterAutomaticSync)
    return () => {
      active = false
      window.removeEventListener(CLOUD_SYNC_FINISHED_EVENT, refreshAfterAutomaticSync)
    }
  }, [signedInUserId])

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

  const syncStructuredContent = async () => {
    if (!client || state.kind !== 'signed-in') return
    setSyncing(true)
    setSyncNotice(undefined)
    try {
      const result = await runCloudSync(client, state.session.user.id)
      const files = result.files
      const pending = await getPendingSyncSummary()
      const now = new Date()
      setLastSyncedAt(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      setPendingSummary(pending)
      setState((current) => ({ ...current, pending: pending.operations }))
      onLocalContentChanged?.()
      const fileNotes = [
        files.uploadedBooks ? `私存原书 ${files.uploadedBooks} 本` : '',
        files.downloadedEpubs ? `取回原书 ${files.downloadedEpubs} 本` : '',
        files.downloadedCovers ? `取回封面 ${files.downloadedCovers} 张` : '',
      ].filter(Boolean).join('，')
      setSyncNotice(`书房已收好：寄出 ${result.pushed} 笔，取回 ${result.pulled} 笔${fileNotes ? `，${fileNotes}` : ''}。`)
    } catch {
      setSyncNotice('这次没有寄到云端。本地内容没有丢失，稍后可以再试。')
    } finally {
      setSyncing(false)
    }
  }

  const restoreFromCloud = async () => {
    if (!client || state.kind !== 'signed-in') return
    const confirmed = window.confirm(
      '要用云端书房重建这台设备吗？\n\n小G会先寄出本机尚未收好的内容，再完整检查云端书目、正文、痕迹和 EPUB。全部取齐后才会替换本机书房；阅读排版等本机偏好会保留。',
    )
    if (!confirmed) return
    setRestoring(true)
    setSyncNotice('正在检查并取回云端书房，本机内容暂时不会改变…')
    try {
      if ((await getPendingSyncSummary()).operations > 0) await runCloudSync(client, state.session.user.id)
      if ((await getPendingSyncSummary()).operations > 0) {
        throw new Error('仍有本机内容没有寄出')
      }
      const result = await restoreCloudLibrary(client, state.session.user.id)
      const pending = await getPendingSyncSummary()
      setPendingSummary(pending)
      setState((current) => ({ ...current, pending: pending.operations }))
      setLastSyncedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
      onLocalContentChanged?.()
      setSyncNotice(`云端书房已完整恢复：${result.books} 本书、${result.chapters} 章正文、${result.traces} 笔痕迹和 ${result.files} 份 EPUB 都已回到这台设备。`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : '云端暂时没有回应'
      setSyncNotice(`恢复已停止：${reason}。这台设备原有的书房没有被替换。`)
    } finally {
      setRestoring(false)
    }
  }

  const localOnly = state.kind === 'local'
  const signedIn = state.kind === 'signed-in'
  const statusText = localOnly
    ? '这处施工书房只留在当前浏览器'
    : state.kind === 'loading'
      ? '正在辨认云端门帖…'
      : signedIn
        ? '云端门帖已认出，书页与痕迹可以收好'
        : '尚未登录云端书房'
  const pendingHeadline = pendingSummary.operations === 0
    ? '已收好'
    : pendingSummary.books > 0
      ? `${pendingSummary.books} 本书`
      : pendingSummary.profile > 0
        ? '1 张名帖'
        : `${pendingSummary.operations} 项`
  const pendingDetails = [
    pendingSummary.profile ? '名帖' : '',
    pendingSummary.files ? `原书 ${pendingSummary.files} 份` : '',
    pendingSummary.chapters ? `正文 ${pendingSummary.chapters} 章` : '',
    pendingSummary.reading ? `阅读状态 ${pendingSummary.reading} 份` : '',
    pendingSummary.traces ? `痕迹记录 ${pendingSummary.traces} 笔` : '',
  ].filter(Boolean).join(' · ')

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
          <div><small>待收内容</small><strong>{pendingHeadline}</strong></div>
          <div><small>最近收好</small><strong>{signedIn ? (lastSyncedAt ?? '尚未首次同步') : '—'}</strong></div>
        </div>
        {pendingDetails && <p className="cloud-pending-details">{pendingDetails}</p>}

        <div className="cloud-actions">
          <button type="button" disabled={!signedIn || syncing || restoring} onClick={() => { void syncStructuredContent() }} title="同步名帖、书目、正文、阅读状态、痕迹与私有原书"><RefreshCw /><span>{syncing ? '正在收好…' : '立即收好'}<small>手动检查整间书房</small></span></button>
          <button type="button" disabled={!signedIn || syncing || restoring} onClick={() => { void restoreFromCloud() }} title="用已完整收好的云端内容重建这台设备"><RotateCcw /><span>{restoring ? '正在恢复…' : '从云端恢复'}<small>重建这台设备的书房</small></span></button>
        </div>
        {syncNotice && <p className="cloud-room-notice" role="status">{syncNotice}</p>}
        <p className="cloud-room-footnote">日常写入会自动收好，“立即收好”是手动兜底。“从云端恢复”只在重装或本机数据损坏时使用，并会先确认云端内容完整。</p>
      </section>
    </section>
  )
}
