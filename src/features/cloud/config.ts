export function cloudConnectionEnabled(): boolean {
  return import.meta.env.VITE_CLOUD_SYNC_ENABLED === 'true'
}
