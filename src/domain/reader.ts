import type { Locator } from './locator'

export type ReaderProgress = {
  readerId: string
  bookId: string
  /** 与页面排版无关的书内位置；不复用人类读者的 readingProgress。 */
  locator: Locator
  /** 精确续读点；Locator 负责重锚定，cursor 负责不重复读最后一个字符。 */
  cursor?: string
  updatedAt: string
}

export type ReaderState = {
  readerId: string
  bookId: string
  /** 此刻怎样理解这本书，不要求复述情节。 */
  understanding: string
  /** 合书时余留的感受，可以为空。 */
  feeling: string
  /** 尚未解开的疑问。 */
  questions: string[]
  /** 下一次回来仍想留意的线索。 */
  attention: string[]
  updatedAt: string
}

export type ReaderTrace = {
  id: string
  readerId: string
  bookId: string
  kind: 'highlight' | 'annotation'
  locator: Locator
  /** 划线为空；批注必须有正文。 */
  text?: string
  createdAt: string
}
