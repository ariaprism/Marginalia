import type { Locator } from './locator'

export type ReadingProgress = {
  bookId: string
  /** 系统自动保存的继续阅读位置。 */
  locator: Locator
  /** 用户手动留下的唯一折页；与自动继续位置互不覆盖。 */
  bookmark?: {
    locator: Locator
    updatedAt: string
  }
  /** 章节级进度百分比，仅用于展示。 */
  chapterProgress: number
  /** 当前位置在全书中的百分比，仅用于展示，不等同于阅读完成度。 */
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

export function moveReadingBookmark(
  progress: ReadingProgress,
  locator: Locator,
  now = new Date().toISOString(),
): ReadingProgress {
  return {
    ...progress,
    bookmark: { locator, updatedAt: now },
    updatedAt: now,
  }
}

export function removeReadingBookmark(
  progress: ReadingProgress,
  now = new Date().toISOString(),
): ReadingProgress {
  const { bookmark: _, ...withoutBookmark } = progress
  return { ...withoutBookmark, updatedAt: now }
}
