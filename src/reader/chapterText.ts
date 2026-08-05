export type ChapterText = {
  chapter: string
  title: string
  kicker: string
  paragraphs: string[]
  /** 原 EPUB 中与目录章名重复的开头标题；保留索引供 Locator 使用，但阅读器不重复渲染。 */
  hiddenParagraphIndexes?: number[]
  /** 第一个适合首字下沉的正文段落；前置页或没有正文段落时为空。 */
  openingParagraphIndex?: number
  /** 本章中预留的可点击高亮短语，仅用于视觉原型中的模拟书。 */
  highlight?: string
}

type TextBlock = {
  text: string
  tagName: string
}

/** 块级标签：各自独立成段。 */
const BLOCK_TAGS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'ASIDE', 'FIGURE', 'FIGCAPTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'DT', 'DD', 'TD', 'TH', 'PRE', 'HEADER', 'FOOTER', 'MAIN', 'NAV',
])

/** 不产出正文的标签，整棵子树丢弃。 */
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'RT', 'RP', 'IMG', 'SVG'])

const CJK = String.raw`㐀-䶿一-鿿豈-﫿぀-ヿ＀-￯　-〿`

/**
 * 规范化一段文字里的空白。
 *
 * EPUB 的 XHTML 常在源码里为了排版换行、缩进，这些换行不是内容。
 * 把连续空白压成单个空格并去掉首尾，再删掉中日韩字符之间那个多余的空格
 * （源码换行造成的），但保留西文单词之间的空格。
 */
function normalizeWhitespace(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.replace(new RegExp(`([${CJK}]) (?=[${CJK}])`, 'g'), '$1')
}

/**
 * 把一个元素的内容拆成若干段。
 *
 * 规则：
 * - 遇到块级子元素，先结束当前段，再递归处理它
 * - `<br>` 结束当前段（很多书用 br 换行而不是新开 <p>）
 * - 其余行内内容累积进当前段
 */
function collectTextBlocks(root: Element): TextBlock[] {
  const blocks: TextBlock[] = []
  let buffer = ''
  let bufferTagName = root.tagName.toUpperCase()

  const flush = () => {
    const text = normalizeWhitespace(buffer)
    if (text) blocks.push({ text, tagName: bufferTagName })
    buffer = ''
  }

  const walk = (node: Node, containerTagName: string) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!buffer) bufferTagName = containerTagName
        buffer += child.textContent ?? ''
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue

      const element = child as Element
      const tagName = element.tagName.toUpperCase()

      if (DROP_TAGS.has(tagName)) continue

      if (tagName === 'BR') {
        flush()
        continue
      }

      if (BLOCK_TAGS.has(tagName)) {
        flush()
        walk(element, tagName)
        flush()
        continue
      }

      // 行内元素（span/em/strong/a/ruby…）：文字直接接在当前段后面
      walk(element, containerTagName)
    }
  }

  walk(root, root.tagName.toUpperCase())
  flush()
  return blocks
}

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const FRONT_MATTER_PATTERN = /版权|版权页|目录|目次|扉页|书名页|出版说明|题记|献词|copyright|contents|title\s*page|colophon|epigraph/i

function comparableHeading(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\s·•—–―:：,，.。第章节篇卷部]/g, '')
}

function duplicateHeadingIndexes(blocks: TextBlock[], title: string, chapterLabel: string): number[] {
  const expected = [title, chapterLabel, `${chapterLabel}${title}`]
    .map(comparableHeading)
    .filter(Boolean)
  const hidden: number[] = []

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!HEADING_TAGS.has(block.tagName)) break
    if (!expected.includes(comparableHeading(block.text))) break
    hidden.push(index)
  }

  return hidden
}

/**
 * 从 EPUB 章节 XHTML 中提取可阅读的纯文本段落。
 *
 * 先按 XHTML 解析；若文件不是严格合规的 XML（现实中很常见），
 * 退回按 HTML 解析，避免整章内容丢失。
 */
export function extractChapterText(html: string, title = '', chapterLabel = ''): ChapterText {
  const parser = new DOMParser()

  let doc = parser.parseFromString(html, 'application/xhtml+xml')
  if (doc.querySelector('parsererror') || !doc.body) {
    doc = parser.parseFromString(html, 'text/html')
  }

  const root = doc.body ?? doc.documentElement
  const blocks = root ? collectTextBlocks(root) : []
  const paragraphs = blocks.map((block) => block.text)
  const hiddenParagraphIndexes = duplicateHeadingIndexes(blocks, title, chapterLabel)
  const isFrontMatter = FRONT_MATTER_PATTERN.test(`${chapterLabel} ${title}`)
  const openingParagraphIndex = isFrontMatter
    ? undefined
    : blocks.findIndex((block, index) => block.tagName === 'P' && !hiddenParagraphIndexes.includes(index))

  return {
    chapter: chapterLabel,
    title,
    kicker: '',
    paragraphs,
    hiddenParagraphIndexes,
    openingParagraphIndex: openingParagraphIndex !== undefined && openingParagraphIndex >= 0 ? openingParagraphIndex : undefined,
  }
}
