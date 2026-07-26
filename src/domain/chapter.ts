/**
 * 一个章节在 EPUB spine 中的位置。
 * 实际正文内容不保存在这里，而是由阅读器按需解析。
 */
export type Chapter = {
  id: string
  /** spine 中的顺序，从 0 开始。 */
  index: number
  title: string
  /** EPUB 内 href，例如 "text/chapter1.xhtml"。 */
  href: string
}

export type ChapterMap = {
  bookId: string
  chapters: Chapter[]
}
