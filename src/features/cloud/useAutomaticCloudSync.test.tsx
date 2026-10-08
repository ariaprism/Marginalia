import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTBOX_CHANGED_EVENT } from '../../data/sync/syncSignals'
import { useAutomaticCloudSync } from './useAutomaticCloudSync'

const mocks = vi.hoisted(() => {
  const runCloudSync = vi.fn(async () => ({
    pushed: 0,
    pulled: 0,
    cursor: 0,
    files: { uploadedBooks: 0, downloadedEpubs: 0, downloadedCovers: 0 },
  }))
  let realtimeNotice: (() => void) | undefined
  let authNotice: ((_event: string, session: { user: { id: string } } | null) => void) | undefined
  const channel = {
    on: vi.fn((_kind, _filter, callback: () => void) => {
      realtimeNotice = callback
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'reader-1' } } } })),
      onAuthStateChange: vi.fn((callback) => {
        authNotice = callback
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  }
  let accountAccess: { kind: 'allowed'; ownerId: string } | { kind: 'blocked'; ownerId: string } = {
    kind: 'allowed', ownerId: 'reader-1',
  }
  return {
    runCloudSync, client, channel, realtime: () => realtimeNotice?.(),
    inspectCloudAccountAccess: vi.fn(async () => accountAccess),
    allowAccount: () => { accountAccess = { kind: 'allowed', ownerId: 'reader-1' } },
    blockAccount: () => { accountAccess = { kind: 'blocked', ownerId: 'original-reader' } },
    signInAs: (userId: string) => authNotice?.('SIGNED_IN', { user: { id: userId } }),
  }
})

vi.mock('./config', () => ({ cloudConnectionEnabled: () => true }))
vi.mock('../../data/remote/supabaseClient', () => ({ getSupabaseClient: () => mocks.client }))
vi.mock('../../data/sync/cloudSync', () => ({ runCloudSync: mocks.runCloudSync }))
vi.mock('./cloudAccountGuard', () => ({
  CLOUD_ACCOUNT_BINDING_CHANGED_EVENT: 'marginalia:cloud-account-binding-changed',
  inspectCloudAccountAccess: mocks.inspectCloudAccountAccess,
}))

function Harness({ onChanged = () => undefined }: { onChanged?: () => void }) {
  useAutomaticCloudSync(onChanged)
  return null
}

describe('automatic cloud sync triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.runCloudSync.mockClear()
    mocks.inspectCloudAccountAccess.mockClear()
    mocks.allowAccount()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs on startup and coalesces rapid local writes', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.runOnlyPendingTimers(); await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
      window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
      vi.advanceTimersByTime(2499)
    })
    expect(mocks.runCloudSync).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledTimes(2)
  })

  it('never starts automatic sync when the signed-in account belongs to another room', async () => {
    mocks.blockAccount()
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.runOnlyPendingTimers(); await Promise.resolve() })
    expect(mocks.runCloudSync).not.toHaveBeenCalled()
  })

  it('invalidates the old permission immediately when Auth switches UID', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.runOnlyPendingTimers(); await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledOnce()
    mocks.runCloudSync.mockClear()

    mocks.blockAccount()
    act(() => { mocks.signInAs('second-reader') })
    await act(async () => { await Promise.resolve(); await vi.runAllTimersAsync() })
    expect(mocks.runCloudSync).not.toHaveBeenCalled()
  })

  it('uses Realtime only as a debounced request to pull through the normal engine', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve(); vi.runOnlyPendingTimers(); await Promise.resolve() })
    mocks.runCloudSync.mockClear()

    act(() => {
      mocks.realtime()
      vi.advanceTimersByTime(349)
    })
    expect(mocks.runCloudSync).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledOnce()
  })

  it('rechecks after the local-write window when returning to the foreground', async () => {
    render(<Harness />)
    await act(async () => { await Promise.resolve(); await vi.runAllTimersAsync() })
    vi.clearAllTimers()
    mocks.runCloudSync.mockClear()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })

    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledOnce()
    await act(async () => { vi.advanceTimersByTime(4000); await Promise.resolve() })
    expect(mocks.runCloudSync).toHaveBeenCalledTimes(2)
  })
})
