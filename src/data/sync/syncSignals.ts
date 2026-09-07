export const OUTBOX_CHANGED_EVENT = 'marginalia:outbox-changed'
export const CLOUD_SYNC_FINISHED_EVENT = 'marginalia:cloud-sync-finished'

export function notifyOutboxChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OUTBOX_CHANGED_EVENT))
}

export function notifyCloudSyncFinished(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CLOUD_SYNC_FINISHED_EVENT))
}
