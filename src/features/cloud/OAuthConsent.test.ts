import { describe, expect, it } from 'vitest'
import { chooseReaderIdentity, oauthConsentRequest } from './oauthConsentRoute'

describe('OAuth consent routing', () => {
  it('recognizes the GitHub Pages consent handoff and keeps the authorization id', () => {
    expect(oauthConsentRequest({
      pathname: '/Marginalia/',
      search: '?oauth=consent&authorization_id=auth-123',
    } as Location)).toEqual({ authorizationId: 'auth-123' })
  })

  it('leaves the normal bookshelf route alone', () => {
    expect(oauthConsentRequest({ pathname: '/Marginalia/', search: '' } as Location)).toBeUndefined()
  })
})

describe('OAuth reader identity guard', () => {
  it('selects the only active reader identity for an account', () => {
    expect(chooseReaderIdentity([{ id: 'key-1', reader_id: '小G', label: '小G书房' }])).toEqual({
      reader: { id: 'key-1', reader_id: '小G', label: '小G书房' },
    })
  })

  it('refuses to guess when an account has no reader or multiple readers', () => {
    expect(chooseReaderIdentity([]).message).toContain('尚未登记')
    expect(chooseReaderIdentity([
      { id: 'key-1', reader_id: '小G', label: '一' },
      { id: 'key-2', reader_id: '小鱼', label: '二' },
    ]).message).toContain('不止一位')
  })
})
