import type { Locator } from './locator'

export type ReadingProgress = {
  bookId: string
  locator: Locator
  /** 章节级进度百分比，仅用于展示。 */
  chapterProgress: number
  /** 全书级进度百分比，仅用于展示。 */
  totalProgress: number
  updatedAt: string
}

export function createReadingProgress(
  bookId: string,
  locator: Locator,
  chapterProgress = 0,
  totalProgress = 0,
  now = new Date().toISOString(),
): ReadingProgress {
  return {
    bookId,
    locator,
    chapterProgress,
    totalProgress,
    updatedAt: now,
  }
}
