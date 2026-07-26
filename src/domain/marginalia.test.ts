import { describe, expect, it } from 'vitest'
import { createMarginalia } from './marginalia'

describe('Marginalia', () => {
  const locator = {
    bookId: 'book-1',
    position: {
      chapterIndex: 0,
      elementPath: [0, 0],
      textOffset: 0,
      selectedText: '书房先听见了雨',
      beforeContext: '',
      afterContext: '。它从屋檐最北边',
    },
  } as const

  it('creates a companion note with reveal_on_reach visibility', () => {
    const note = createMarginalia({
      id: 'fish-1',
      bookId: 'book-1',
      annotationId: 'note-1',
      locator,
      text: '也许书并不知道，只是它替那一刻保留了一个位置。',
      visibility: 'reveal_on_reach',
    })

    expect(note.actor).toBe('companion')
    expect(note.visibility).toBe('reveal_on_reach')
  })
})
