export type ReaderIdentity = { id: string; reader_id: string; label: string }

export function oauthConsentRequest(location: Pick<Location, 'pathname' | 'search'> = window.location) {
  const params = new URLSearchParams(location.search)
  const authorizationId = params.get('authorization_id')?.trim()
  const isConsentPath = location.pathname.replace(/\/$/, '').endsWith('/oauth/consent')
  const isConsentQuery = params.get('oauth') === 'consent'
  return isConsentPath || isConsentQuery || authorizationId
    ? { authorizationId: authorizationId ?? '' }
    : undefined
}

export function chooseReaderIdentity(readers: ReaderIdentity[]) {
  if (readers.length === 1) return { reader: readers[0] }
  if (readers.length === 0) return { message: '这张门帖尚未登记 AI 共读者，不能交给 ChatGPT。' }
  return { message: '这张门帖登记了不止一位 AI 共读者，暂时无法安全判断要打开哪一间书房。' }
}
