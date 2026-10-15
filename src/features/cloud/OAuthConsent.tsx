import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { BookOpenText, Check, LogOut, X } from 'lucide-react'
import { getSupabaseClient } from '../../data/remote/supabaseClient'
import { chooseReaderIdentity, type ReaderIdentity } from './oauthConsentRoute'
import './OAuthConsent.css'

type AuthorizationDetails = {
  authorization_id: string
  redirect_uri: string
  scope: string
  client: { id: string; name: string; uri: string; logo_uri: string }
  user: { id: string; email: string }
}

type ConsentState =
  | { kind: 'loading' }
  | { kind: 'signed-out'; notice?: string }
  | { kind: 'ready'; session: Session; details: AuthorizationDetails; reader: ReaderIdentity }
  | { kind: 'blocked'; session: Session; message: string }
  | { kind: 'error'; message: string }

const SCOPE_LABELS: Record<string, string> = {
  openid: '确认这张门帖的身份',
  email: '辨认登录邮箱',
  profile: '辨认公开称呼',
}

function consentReturnUrl(authorizationId: string) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin)
  url.searchParams.set('oauth', 'consent')
  url.searchParams.set('authorization_id', authorizationId)
  return url.toString()
}

export function OAuthConsent({ authorizationId }: { authorizationId: string }) {
  const client = getSupabaseClient()
  const readerClient = client as unknown as SupabaseClient | undefined
  const [state, setState] = useState<ConsentState>({ kind: 'loading' })
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [deciding, setDeciding] = useState<'approve' | 'deny'>()

  useEffect(() => {
    if (!client) {
      setState({ kind: 'error', message: '云端门锁缺少连接配置。' })
      return
    }
    if (!authorizationId) {
      setState({ kind: 'error', message: '这张授权门帖已经失效，请回到 ChatGPT 重新连接。' })
      return
    }

    let active = true
    const load = async (session: Session | null) => {
      if (!active) return
      if (!session) {
        setState({ kind: 'signed-out' })
        return
      }
      setState({ kind: 'loading' })
      const [{ data: details, error: detailsError }, { data: readers, error: readersError }] = await Promise.all([
        client.auth.oauth.getAuthorizationDetails(authorizationId),
        readerClient!.from('ai_reader_access_keys')
          .select('id,reader_id,label')
          .is('revoked_at', null)
          .order('created_at')
          .limit(2),
      ])
      if (!active) return
      if (detailsError || !details) {
        setState({ kind: 'error', message: '没有认出这次授权请求，请回到 ChatGPT 重新连接。' })
        return
      }
      if ('redirect_url' in details) {
        window.location.assign(details.redirect_url)
        return
      }
      if (readersError) {
        setState({ kind: 'error', message: '暂时无法核对这张门帖的共读者身份。' })
        return
      }
      const choice = chooseReaderIdentity((readers ?? []) as ReaderIdentity[])
      if (!choice.reader) {
        setState({ kind: 'blocked', session, message: choice.message! })
        return
      }
      setState({ kind: 'ready', session, details: details as AuthorizationDetails, reader: choice.reader })
    }

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setState({ kind: 'error', message: '暂时无法辨认当前登录门帖。' })
      else void load(data.session)
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) void load(session)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [authorizationId, client, readerClient])

  const requestedScopes = useMemo(() => state.kind === 'ready'
    ? state.details.scope.split(/\s+/).filter(Boolean).map((scope) => SCOPE_LABELS[scope] ?? scope)
    : [], [state])

  const requestMagicLink = async (event: FormEvent) => {
    event.preventDefault()
    if (!client || !email.trim()) return
    setSending(true)
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: consentReturnUrl(authorizationId), shouldCreateUser: false },
    })
    setSending(false)
    setState(error
      ? { kind: 'error', message: '这个邮箱尚未登记，或云端暂时没有回信。' }
      : { kind: 'signed-out', notice: '登录门帖已经寄出。点开邮件后会回到这里继续授权。' })
  }

  const signOut = async () => {
    if (!client) return
    await client.auth.signOut({ scope: 'local' })
  }

  const decide = async (decision: 'approve' | 'deny') => {
    if (!client || state.kind !== 'ready') return
    setDeciding(decision)
    const action = decision === 'approve'
      ? client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    const { data, error } = await action
    if (error || !data?.redirect_url) {
      setDeciding(undefined)
      setState({ kind: 'error', message: '这次授权没有送达，请回到 ChatGPT 再试一次。' })
      return
    }
    window.location.assign(data.redirect_url)
  }

  const session = state.kind === 'ready' || state.kind === 'blocked' ? state.session : undefined

  return <main className="oauth-consent-shell">
    <section className="oauth-consent-card" aria-live="polite">
      <header>
        <span className="oauth-consent-seal"><BookOpenText /></span>
        <small>MARGINALIA · PRIVATE READING ROOM</small>
        <h1>给她开门</h1>
        <p>把这张云端门帖对应的 AI 共读书房交给 ChatGPT。</p>
      </header>

      {state.kind === 'loading' && <p className="oauth-consent-status">正在辨认门帖与来访者…</p>}

      {state.kind === 'signed-out' && <form className="oauth-consent-login" onSubmit={(event) => { void requestMagicLink(event) }}>
        <p>请先登录要交给 ChatGPT 的那间书房。小G应使用 lyre 门帖。</p>
        <label><span>云端门帖邮箱</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
        <button type="submit" disabled={sending}>{sending ? '正在寄出…' : '寄一封登录门帖'}</button>
        {state.notice && <small role="status">{state.notice}</small>}
      </form>}

      {state.kind === 'ready' && <>
        <div className="oauth-consent-client">
          <small>请求进入</small>
          <strong>{state.details.client.name || 'ChatGPT'}</strong>
          <span>{state.details.redirect_uri}</span>
        </div>
        <div className="oauth-consent-identity">
          <div><small>当前门帖</small><strong>{state.session.user.email ?? '已登录账号'}</strong></div>
          <div><small>将打开的共读位置</small><strong>{state.reader.reader_id}</strong><span>{state.reader.label}</span></div>
        </div>
        <div className="oauth-consent-scopes">
          <small>这次允许</small>
          <ul>{requestedScopes.map((scope) => <li key={scope}><Check />{scope}</li>)}</ul>
          <p>获准后，ChatGPT 可以使用这位共读者的书架、续读位置、Reader State、痕迹和 session；不能进入其他账号的书房。</p>
        </div>
        <div className="oauth-consent-actions">
          <button type="button" className="is-secondary" disabled={Boolean(deciding)} onClick={() => { void decide('deny') }}><X />{deciding === 'deny' ? '正在收回…' : '暂不开门'}</button>
          <button type="button" disabled={Boolean(deciding)} onClick={() => { void decide('approve') }}><Check />{deciding === 'approve' ? '正在开门…' : '允许进入'}</button>
        </div>
      </>}

      {(state.kind === 'blocked' || state.kind === 'error') && <div className="oauth-consent-error" role="alert">
        <strong>这次还不能开门</strong>
        <p>{state.message}</p>
      </div>}

      {session && <button type="button" className="oauth-consent-signout" onClick={() => { void signOut() }}><LogOut />换一张门帖</button>}
    </section>
  </main>
}
