export type ChapterText = {
  chapter: string
  title: string
  kicker: string
  paragraphs: string[]
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'])

/**
 * 从 EPUB 章节 XHTML 中提取可阅读的纯文本段落。
 *
 * 第一版只做简单清洗：移除 script/style，按块级标签分段，合并空白。
 * 后续再处理更复杂的 HTML 结构（列表、表格、诗歌等）。
 */
export function extractChapterText(html: string, title = '', chapterLabel = ''): ChapterText {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'application/xhtml+xml')

  // 移除脚本、样式、链接（链接保留文本，后续可再处理）
  doc.querySelectorAll('script, style').forEach((element) => element.remove())

  const paragraphs: string[] = []
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT + NodeFilter.SHOW_TEXT)
  let currentBlock: string[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, '') ?? ''
      if (text) currentBlock.push(text)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      if (BLOCK_TAGS.has(element.tagName)) {
        if (currentBlock.length > 0) {
          paragraphs.push(currentBlock.join(''))
          currentBlock = []
        }
      }
    }
  }
  if (currentBlock.length > 0) {
    paragraphs.push(currentBlock.join(''))
  }

  return {
    chapter: chapterLabel,
    title,
    kicker: '',
    paragraphs: paragraphs.filter((paragraph) => paragraph.length > 0),
  }
}
