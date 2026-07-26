/**
 * Locator 是一个不可变的值对象，描述书中一个稳定位置。
 *
 * 保存时不能把动态页码当作定位依据，因为 EPUB 会随窗口、字号和行距重新排版。
 * 持久层应保存本章定义的结构信息；动态页码仅用于显示。
 */
export type TextPosition = {
  /** spine 中的章节索引。 */
  chapterIndex: number
  /** 章节内稳定的元素路径，例如 [2, 1] 表示第 3 个 block 的第 2 个 inline 子元素。 */
  elementPath: readonly number[]
  /** 元素内文本偏移量（字符数）。 */
  textOffset: number
  /** 用户实际选中的文本。 */
  selectedText: string
  /** 选中位置之前约 50 个字符的上下文。 */
  beforeContext: string
  /** 选中位置之后约 50 个字符的上下文。 */
  afterContext: string
  /** EPUB CFI，如果解析器能提供。 */
  cfi?: string
}

export type Locator = {
  bookId: string
  position: TextPosition
}

/**
 * 从一段完整文本中提取选中部分及其前后上下文。
 *
 * @param fullText 包含选中位置的完整文本。
 * @param start 选中起始位置（字符数）。
 * @param end 选中结束位置（字符数，不包含）。
 * @param contextLength 上下文长度，默认 50。
 */
export function extractContext(
  fullText: string,
  start: number,
  end: number,
  contextLength = 50,
): { selectedText: string; beforeContext: string; afterContext: string } {
  const selectedText = fullText.slice(start, end)
  const beforeContext = fullText.slice(Math.max(0, start - contextLength), start)
  const afterContext = fullText.slice(end, Math.min(fullText.length, end + contextLength))
  return { selectedText, beforeContext, afterContext }
}

export function createLocator(
  bookId: string,
  position: Omit<TextPosition, 'beforeContext' | 'afterContext'> & {
    beforeContext: string
    afterContext: string
  },
): Locator {
  return {
    bookId,
    position: {
      ...position,
      beforeContext: trimContext(position.beforeContext),
      afterContext: trimContext(position.afterContext),
    },
  }
}

/** 截断上下文到合理长度，避免保存过长字符串。 */
export function trimContext(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text
  return `…${text.slice(-maxLength + 1)}`
}
