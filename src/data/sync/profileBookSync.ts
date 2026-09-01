import type { SupabaseClient } from '@supabase/supabase-js'
import { prepareInitialOutbox } from '../local/syncStore'
import { CloudInkRemote, createSupabaseCloudInkGateway } from '../remote/cloudInkRemote'
import type { Database } from '../remote/database.types'
import { runSync, type SyncRunResult } from './engine'
import { IndexedDbSyncLocal } from './indexedDbLocal'

/** Staged manual sync. Only profile/book upserts are acknowledged; every other row stays pending. */
export async function syncProfileAndBooks(
  client: SupabaseClient<Database>,
  remoteUserId: string,
): Promise<SyncRunResult> {
  await prepareInitialOutbox(remoteUserId)
  return runSync(
    new IndexedDbSyncLocal(remoteUserId),
    new CloudInkRemote(createSupabaseCloudInkGateway(client)),
  )
}
