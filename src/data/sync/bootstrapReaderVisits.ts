import type { SupabaseClient } from '@supabase/supabase-js'
import { readerSessionPayload, type ReaderSessionRow } from '../remote/cloudInkRemote'
import type { Database } from '../remote/database.types'
import { withStoresTransaction } from '../local/db'
import { getSyncState } from '../local/syncStore'
import type { SyncState } from './operations'

/** Older clients already passed visit events without caching them. Backfill once without rewinding their cursor. */
export async function bootstrapReaderVisits(client: SupabaseClient<Database>, remoteUserId: string): Promise<void> {
  if ((await getSyncState(remoteUserId))?.readerVisitsBootstrappedAt) return
  const readerClient = client as unknown as SupabaseClient
  const visits: ReaderSessionRow[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await readerClient.from('reader_sessions').select('*')
      .eq('owner_id', remoteUserId).order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    if (!data) throw new Error('来访簿暂时没有取到')
    visits.push(...data as ReaderSessionRow[])
    if (data.length < 500) break
  }
  await withStoresTransaction(['readerSessions', 'syncState'], 'readwrite', transaction => {
    for (const visit of visits) transaction.objectStore('readerSessions').put(readerSessionPayload(visit))
    const stateStore = transaction.objectStore('syncState')
    const request = stateStore.get(remoteUserId)
    request.onsuccess = () => stateStore.put({
      ...(request.result as SyncState | undefined), remoteUserId,
      lastPulledChangeId: (request.result as SyncState | undefined)?.lastPulledChangeId ?? 0,
      readerVisitsBootstrappedAt: new Date().toISOString(),
    } satisfies SyncState)
  })
}
