/**
 * 一个章节在 EPUB spine 中的位置。
 * 本地存储可选择同时保存原始 XHTML，供阅读器直接渲染。
 */
export type Chapter = {
  id: string
  /** spine 中的顺序，从 0 开始。 */
  index: number
  title: string
  /** EPUB 内 href，例如 "text/chapter1.xhtml"。 */
  href: string
  /** 章节原始 XHTML，可选；不依赖网络时直接渲染。 */
  html?: string
}

export type ChapterMap = {
  bookId: string
  chapters: Chapter[]
}
