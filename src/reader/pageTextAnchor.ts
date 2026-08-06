type CharacterRects = (node: Text, offset: number) => readonly DOMRect[]

function textNodes(element: HTMLElement): Text[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

function browserCharacterRects(node: Text, offset: number): DOMRect[] {
  const range = document.createRange()
  range.setStart(node, offset)
  range.setEnd(node, offset + 1)
  return typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : []
}

function pageForRect(rect: DOMRect, flowLeft: number, pageWidth: number) {
  if (rect.width <= 0 || rect.height <= 0) return null
  return Math.max(0, Math.floor((rect.left - flowLeft + 1) / pageWidth))
}

/** 找到一个内联文本元素在指定动态页上出现的首个字符。 */
export function textOffsetAtPage(
  element: HTMLElement,
  targetPage: number,
  flowLeft: number,
  pageWidth: number,
  readRects: CharacterRects = browserCharacterRects,
): number | null {
  let absoluteOffset = 0
  for (const node of textNodes(element)) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const appearsOnTargetPage = readRects(node, offset)
        .some((rect) => pageForRect(rect, flowLeft, pageWidth) === targetPage)
      if (appearsOnTargetPage) return absoluteOffset + offset
    }
    absoluteOffset += node.data.length
  }
  return null
}

/** 把元素内的稳定字符偏移重新换算成当前排版下的动态页。 */
export function pageAtTextOffset(
  element: HTMLElement,
  textOffset: number,
  flowLeft: number,
  pageWidth: number,
  readRects: CharacterRects = browserCharacterRects,
): number | null {
  let remaining = Math.max(0, textOffset)
  for (const node of textNodes(element)) {
    if (remaining >= node.data.length) {
      remaining -= node.data.length
      continue
    }
    for (const rect of readRects(node, remaining)) {
      const page = pageForRect(rect, flowLeft, pageWidth)
      if (page !== null) return page
    }
    return null
  }
  return null
}
