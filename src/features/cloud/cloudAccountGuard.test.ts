import { describe, expect, it } from 'vitest'
import { saveBook } from '../../data/local/bookStore'
import { saveSyncState } from '../../data/local/syncStore'
import { createBook } from '../../domain/book'
import { claimCloudAccount, inspectCloudAccountAccess } from './cloudAccountGuard'

describe('cloud account guard', () => {
  it('lets a brand-new empty browser bind its first cloud account', async () => {
    await expect(inspectCloudAccountAccess('test-owner')).resolves.toEqual({
      kind: 'allowed', ownerId: 'test-owner',
    })
    await expect(inspectCloudAccountAccess('other-owner')).resolves.toEqual({
      kind: 'blocked', ownerId: 'test-owner',
    })
  })

  it('migrates an old room to the earliest account that completed sync', async () => {
    await saveSyncState({
      remoteUserId: 'original-owner', lastPulledChangeId: 8,
      structuredInitialSyncCompletedAt: '2026-09-08T08:00:00.000Z',
    })
    await saveSyncState({
      remoteUserId: 'later-test-owner', lastPulledChangeId: 2,
      structuredInitialSyncCompletedAt: '2026-10-06T08:00:00.000Z',
    })

    await expect(inspectCloudAccountAccess('later-test-owner')).resolves.toEqual({
      kind: 'blocked', ownerId: 'original-owner',
    })
    await expect(inspectCloudAccountAccess('original-owner')).resolves.toEqual({
      kind: 'allowed', ownerId: 'original-owner',
    })
  })

  it('does not silently claim an existing unsynced library', async () => {
    await saveBook(createBook({
      id: 'book-1', title: '旧书房', author: '小狐狸', source: 'marginalia', status: 'reading',
    }))
    await expect(inspectCloudAccountAccess('first-owner')).resolves.toEqual({ kind: 'unclaimed' })

    claimCloudAccount('first-owner')
    await expect(inspectCloudAccountAccess('first-owner')).resolves.toEqual({
      kind: 'allowed', ownerId: 'first-owner',
    })
  })
})
