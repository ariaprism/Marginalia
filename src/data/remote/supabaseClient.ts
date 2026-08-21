import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let client: SupabaseClient<Database> | undefined

/**
 * 云端连接是可选能力：没有环境变量时应用仍然保持完整的本地书房行为。
 * 浏览器中只能配置 publishable key，禁止使用 secret 或 service-role key。
 */
export function getSupabaseClient(): SupabaseClient<Database> | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) return undefined
  client ??= createClient<Database>(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  return client
}
