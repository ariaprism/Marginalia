import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../remote/database.types'
import { runCloudSync } from './cloudSync'

const client = {} as SupabaseClient<Database>

describe('shared cloud sync gate', () => {
  it('serializes overlapping requests and performs one catch-up pass', async () => {
    let releaseFirst!: () => void
    const firstPass = new Promise<void>((resolve) => { releaseFirst = resolve })
    const structured = vi.fn()
      .mockImplementationOnce(async () => {
        await firstPass
        return { pushed: 1, pulled: 2, cursor: 4 }
      })
      .mockResolvedValueOnce({ pushed: 3, pulled: 0, cursor: 5 })
    const files = vi.fn().mockResolvedValue({ uploadedBooks: 0, downloadedEpubs: 0, downloadedCovers: 0 })
    const finished = vi.fn()
    const steps = { structured, files, compact: vi.fn(), finished }

    const first = runCloudSync(client, 'reader-1', steps)
    const second = runCloudSync(client, 'reader-1', steps)
    expect(second).toBe(first)
    releaseFirst()

    await expect(first).resolves.toMatchObject({ pushed: 4, pulled: 2, cursor: 5 })
    expect(structured).toHaveBeenCalledTimes(2)
    expect(files).toHaveBeenCalledTimes(2)
    expect(finished).toHaveBeenCalledOnce()
  })
})
