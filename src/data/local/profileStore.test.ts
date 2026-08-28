import { describe, expect, it } from 'vitest'
import type { CallingCard } from '../../domain/profile'
import { getOutboxOperations } from './syncStore'
import { ensureStoredProfile, getStoredProfile, saveStoredProfile } from './profileStore'

const card: CallingCard = {
  userName: '小狐狸',
  companionName: '小鱼',
  companionPronoun: '她',
}

describe('profileStore', () => {
  it('moves the old calling card into IndexedDB and queues it once', async () => {
    await expect(ensureStoredProfile(card)).resolves.toMatchObject(card)
    await expect(ensureStoredProfile({ ...card, companionName: '不应覆盖' })).resolves.toMatchObject(card)

    expect(await getStoredProfile()).toMatchObject(card)
    expect((await getOutboxOperations()).filter((item) => item.entityType === 'profile')).toHaveLength(1)
  })

  it('saves a changed calling card with the business record and outbox together', async () => {
    await saveStoredProfile({ ...card, companionName: '小G' }, '2026-08-28T10:00:00.000Z')

    expect(await getStoredProfile()).toEqual({
      id: 'self',
      ...card,
      companionName: '小G',
      updatedAt: '2026-08-28T10:00:00.000Z',
    })
    expect(await getOutboxOperations()).toEqual([
      expect.objectContaining({
        entityKey: 'profile:self',
        operation: 'upsert',
        occurredAt: '2026-08-28T10:00:00.000Z',
      }),
    ])
  })
})
