import { describe, expect, it } from 'vitest'
import { pageAtTextOffset, textOffsetAtPage } from './pageTextAnchor'

function rectAtPage(page: number): DOMRect {
  const left = page * 500
  return {
    x: left,
    y: 0,
    left,
    right: left + 10,
    top: 0,
    bottom: 20,
    width: 10,
    height: 20,
    toJSON: () => ({}),
  }
}

describe('page text anchors', () => {
  it('keeps a character-level anchor on the later page of a split sentence', () => {
    const sentence = document.createElement('span')
    sentence.append('前半')
    const mark = document.createElement('mark')
    mark.textContent = '后半'
    sentence.append(mark)

    const rects = (node: Text) => [rectAtPage(node.parentElement === mark ? 1 : 0)]

    expect(textOffsetAtPage(sentence, 1, 0, 500, rects)).toBe(2)
    expect(pageAtTextOffset(sentence, 2, 0, 500, rects)).toBe(1)
    expect(pageAtTextOffset(sentence, 1, 0, 500, rects)).toBe(0)
  })
})
