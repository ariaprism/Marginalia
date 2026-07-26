import { describe, expect, it } from 'vitest'
import { createAnnotation, annotationBelongsToHighlight } from './annotation'
import { createHighlight } from './highlight'

describe('Annotation', () => {
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

  it('creates a standalone annotation without a highlight', () => {
    const annotation = createAnnotation({
      id: 'note-1',
      bookId: 'book-1',
      locator,
      text: '雨声把这一句托住了。',
    })

    expect(annotation.actor).toBe('user')
    expect(annotation.highlightId).toBeUndefined()
    expect(annotation.text).toBe('雨声把这一句托住了。')
  })

  it('can be attached to a highlight', () => {
    const highlight = createHighlight({
      id: 'hl-1',
      bookId: 'book-1',
      locator,
      color: 'rose',
    })
    const annotation = createAnnotation({
      id: 'note-2',
      bookId: 'book-1',
      highlightId: highlight.id,
      locator,
      text: '附在划线下的想法。',
    })

    expect(annotationBelongsToHighlight(annotation, highlight)).toBe(true)
  })
})
