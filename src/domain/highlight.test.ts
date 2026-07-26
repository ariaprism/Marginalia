import { describe, expect, it } from 'vitest'
import { createHighlight } from './highlight'

describe('Highlight', () => {
  it('creates a user highlight with a color', () => {
    const now = '2026-07-26T10:00:00.000Z'
    const highlight = createHighlight(
      {
        id: 'hl-1',
        bookId: 'book-1',
        color: 'rose',
        locator: {
          bookId: 'book-1',
          position: {
            chapterIndex: 0,
            elementPath: [0, 0],
            textOffset: 0,
            selectedText: '书房先听见了雨',
            beforeContext: '',
            afterContext: '。它从屋檐最北边',
          },
        },
      },
      now,
    )

    expect(highlight.color).toBe('rose')
    expect(highlight.createdAt).toBe(now)
    expect(highlight.locator.position.selectedText).toBe('书房先听见了雨')
  })
})
