export type BookSource = 'marginalia' | 'weread'
export type BookStatus = 'reading' | 'wish' | 'finished'
export type BookCoverTone = 'rose' | 'blue' | 'green' | 'ochre'

export type Book = {
  id: string
  title: string
  /** 封面与书籍小房间使用的可选外文书名，不自动翻译。 */
  englishTitle?: string
  author: string
  language?: string
  description?: string
  /** EPUB / 用户图片转换成的本地 data URL；为空时使用 Marginalia 内部封面。 */
  coverUrl?: string
  coverTone?: BookCoverTone
  source: BookSource
  status: BookStatus
  /** 阅读进度百分比，0–100，仅用于展示概览。 */
  progress: number
  /** ISO 8601 时间戳。 */
  addedAt: string
  /** 最近一次由用户主动打开书籍的时间，用于书架排序。 */
  lastOpenedAt?: string
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
