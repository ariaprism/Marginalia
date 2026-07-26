import { describe, expect, it } from 'vitest'
import { createLocator, extractContext, trimContext } from './locator'

describe('Locator', () => {
  it('extracts selected text and surrounding context', () => {
    const paragraph = '灯亮起来以前，书房先听见了雨。它从屋檐最北边的一片瓦开始，沿着看不见的坡度慢慢走下来。'
    const start = paragraph.indexOf('书房先听见了雨')
    const end = start + '书房先听见了雨'.length
    const context = extractContext(paragraph, start, end, 10)

    expect(context.selectedText).toBe('书房先听见了雨')
    expect(context.beforeContext).toBe('灯亮起来以前，')
    expect(context.afterContext).toBe('。它从屋檐最北边的一')
  })

  it('truncates overly long context', () => {
    const long = 'a'.repeat(100)
    expect(trimContext(long, 10)).toBe(`…${'a'.repeat(9)}`)
  })

  it('creates a locator with trimmed context', () => {
    const locator = createLocator('book-1', {
      chapterIndex: 0,
      elementPath: [2, 0],
      textOffset: 7,
      selectedText: '书房先听见了雨',
      beforeContext: '灯亮起来以前，书房先听见了雨。'.repeat(5),
      afterContext: '。它从屋檐最北边的一片瓦开始',
    })

    expect(locator.bookId).toBe('book-1')
    expect(locator.position.beforeContext.startsWith('…')).toBe(true)
    expect(locator.position.afterContext).toBe('。它从屋檐最北边的一片瓦开始')
  })
})
