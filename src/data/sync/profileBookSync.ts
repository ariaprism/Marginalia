import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CALLING_CARD } from '../../domain/profile'
import { getStoredProfile } from '../local/profileStore'
import {
  getSyncState,
  prepareInitialOutbox,
  saveSyncState,
} from '../local/syncStore'
import { CloudInkRemote, createSupabaseCloudInkGateway } from '../remote/cloudInkRemote'
import type { Database } from '../remote/database.types'
import { runSync, type SyncRemote, type SyncRunResult } from './engine'
import { IndexedDbSyncLocal } from './indexedDbLocal'

function isUntouchedDefaultProfile(profile: Awaited<ReturnType<typeof getStoredProfile>>): boolean {
  return Boolean(profile
    && profile.userName === DEFAULT_CALLING_CARD.userName
    && profile.companionName === DEFAULT_CALLING_CARD.companionName
    && profile.companionPronoun === DEFAULT_CALLING_CARD.companionPronoun)
}

async function pullAllBeforeFirstPush(
  local: IndexedDbSyncLocal,
  remote: SyncRemote,
): Promise<number> {
  let pulled = 0
  let cursor = 0
  while (true) {
    const cloud = await remote.pull(cursor)
    pulled += cloud.changes.length
    const cloudHasProfile = cloud.changes.some((change) => change.entityType === 'profile')
    if (cloudHasProfile && isUntouchedDefaultProfile(await getStoredProfile())) {
      const profileOperations = (await local.pending())
        .filter((operation) => operation.entityType === 'profile')
        .map((operation) => operation.operationId)
      await local.acknowledge(profileOperations)
    }
    await local.apply(cloud.changes, cloud.cursor)
    if (!cloud.changes.length || cloud.cursor <= cursor) break
    cursor = cloud.cursor
  }
  return pulled
}

/**
 * 第一次认领云端账号时先取后寄。
 *
 * 新浏览器会自动生成一张默认名帖；若云端已有真实名帖，这张空白默认值没有资格凭
 * 更晚的设备时间覆盖它。用户真正改过的名帖和书目仍按 updatedAt 决定新旧。
 */
export async function syncProfileAndBooksWithRemote(
  remote: SyncRemote,
  remoteUserId: string,
): Promise<SyncRunResult> {
  await prepareInitialOutbox(remoteUserId)
  const local = new IndexedDbSyncLocal(remoteUserId)
  const state = await getSyncState(remoteUserId)
  let firstPulled = 0

  if (!state?.profileBookInitialSyncCompletedAt) {
    firstPulled = await pullAllBeforeFirstPush(local, remote)
  }

  const result = await runSync(local, remote)
  const completedAt = new Date().toISOString()
  const latest = await getSyncState(remoteUserId)
  await saveSyncState({
    remoteUserId,
    lastPulledChangeId: latest?.lastPulledChangeId ?? result.cursor,
    ...(latest?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: latest.lastSuccessfulSyncAt } : {}),
    profileBookInitialSyncCompletedAt: latest?.profileBookInitialSyncCompletedAt ?? completedAt,
    ...(latest?.structuredInitialSyncCompletedAt
      ? { structuredInitialSyncCompletedAt: latest.structuredInitialSyncCompletedAt }
      : {}),
    ...(latest?.initialSyncCompletedAt ? { initialSyncCompletedAt: latest.initialSyncCompletedAt } : {}),
  })
  return { ...result, pulled: result.pulled + firstPulled }
}

/** First structured sync pulls the whole account before sending local chapters and traces. */
export async function syncStructuredCloudInkWithRemote(
  remote: SyncRemote,
  remoteUserId: string,
): Promise<SyncRunResult> {
  await prepareInitialOutbox(remoteUserId)
  const local = new IndexedDbSyncLocal(remoteUserId)
  const state = await getSyncState(remoteUserId)
  const firstPulled = state?.structuredInitialSyncCompletedAt
    ? 0
    : await pullAllBeforeFirstPush(local, remote)
  const result = await runSync(local, remote)
  const latest = await getSyncState(remoteUserId)
  const completedAt = new Date().toISOString()
  await saveSyncState({
    remoteUserId,
    lastPulledChangeId: latest?.lastPulledChangeId ?? result.cursor,
    ...(latest?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: latest.lastSuccessfulSyncAt } : {}),
    profileBookInitialSyncCompletedAt: latest?.profileBookInitialSyncCompletedAt ?? completedAt,
    structuredInitialSyncCompletedAt: latest?.structuredInitialSyncCompletedAt ?? completedAt,
    ...(latest?.initialSyncCompletedAt ? { initialSyncCompletedAt: latest.initialSyncCompletedAt } : {}),
  })
  return { ...result, pulled: result.pulled + firstPulled }
}

export async function syncStructuredCloudInk(
  client: SupabaseClient<Database>,
  remoteUserId: string,
): Promise<SyncRunResult> {
  return syncStructuredCloudInkWithRemote(
    new CloudInkRemote(createSupabaseCloudInkGateway(client)),
    remoteUserId,
  )
}
