export type BookSource = 'marginalia' | 'weread'
export type BookStatus = 'reading' | 'wish' | 'finished'

export type Book = {
  id: string
  title: string
  author: string
  language?: string
  description?: string
  coverUrl?: string
  source: BookSource
  status: BookStatus
  /** 阅读进度百分比，0–100，仅用于展示概览。 */
  progress: number
  /** ISO 8601 时间戳。 */
  addedAt: string
  updatedAt: string
}

export function createBook(
  input: Omit<Book, 'addedAt' | 'updatedAt' | 'progress'>,
  now = new Date().toISOString(),
): Book {
  return {
    ...input,
    progress: 0,
    addedAt: now,
    updatedAt: now,
  }
}
