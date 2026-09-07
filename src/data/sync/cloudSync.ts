import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../remote/database.types'
import { compactOutbox } from '../local/syncStore'
import { syncPrivateBookFiles, type BookFileSyncResult } from './bookFileSync'
import { syncStructuredCloudInk } from './profileBookSync'
import { notifyCloudSyncFinished } from './syncSignals'

export type CloudSyncResult = {
  pushed: number
  pulled: number
  cursor: number
  files: BookFileSyncResult
}

type CloudSyncSteps = {
  structured: typeof syncStructuredCloudInk
  files: typeof syncPrivateBookFiles
  compact: typeof compactOutbox
  finished: typeof notifyCloudSyncFinished
}

const defaultSteps: CloudSyncSteps = {
  structured: syncStructuredCloudInk,
  files: syncPrivateBookFiles,
  compact: compactOutbox,
  finished: notifyCloudSyncFinished,
}

let activeRun: Promise<CloudSyncResult> | undefined
let repeatAfterActiveRun = false

/**
 * 手动按钮和所有自动入口共用同一扇门。
 *
 * 同步进行时的新请求不会并发碰 IndexedDB／远端游标，而是在当前轮结束后补跑一轮，
 * 因此当前轮中途新写下的批注也不会被漏在本机。
 */
export function runCloudSync(
  client: SupabaseClient<Database>,
  remoteUserId: string,
  steps: CloudSyncSteps = defaultSteps,
): Promise<CloudSyncResult> {
  if (activeRun) {
    repeatAfterActiveRun = true
    return activeRun
  }

  activeRun = (async () => {
    const total: CloudSyncResult = {
      pushed: 0,
      pulled: 0,
      cursor: 0,
      files: { uploadedBooks: 0, downloadedEpubs: 0, downloadedCovers: 0 },
    }
    do {
      repeatAfterActiveRun = false
      const structured = await steps.structured(client, remoteUserId)
      const files = await steps.files(client, remoteUserId)
      await steps.compact()
      total.pushed += structured.pushed
      total.pulled += structured.pulled
      total.cursor = structured.cursor
      total.files.uploadedBooks += files.uploadedBooks
      total.files.downloadedEpubs += files.downloadedEpubs
      total.files.downloadedCovers += files.downloadedCovers
    } while (repeatAfterActiveRun)
    steps.finished()
    return total
  })().finally(() => {
    activeRun = undefined
    repeatAfterActiveRun = false
  })
  return activeRun
}
