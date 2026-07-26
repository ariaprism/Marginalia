import { describe, expect, it } from 'vitest'
import { createBook } from '../../domain/book'
import { createHighlight } from '../../domain/highlight'
import { createAnnotation } from '../../domain/annotation'
import { createMarginalia } from '../../domain/marginalia'
import { createReadingProgress } from '../../domain/readingProgress'
import {
  getAllBooks,
  getAnnotations,
  getBook,
  getChapters,
  getHighlights,
  getMarginalia,
  getReadingProgress,
  saveAnnotation,
  saveBook,
  saveChapters,
  saveHighlight,
  saveMarginalia,
  saveReadingProgress,
} from './bookStore'

let testId = 0
function makeBook() {
  testId += 1
  return createBook({
    id: `rain-room-${testId}`,
    title: '雨夜书房',
    author: '小G',
    source: 'marginalia',
    status: 'reading',
  })
}

describe('bookStore', () => {
  function makeLocator(bookId: string) {
    return {
      bookId,
      position: {
        chapterIndex: 0,
        elementPath: [0, 0],
        textOffset: 0,
        selectedText: '书房先听见了雨',
        beforeContext: '灯亮起来以前，',
        afterContext: '。它从屋檐最北边',
      },
    } as const
  }

  it('saves and retrieves a book', async () => {
    const book = makeBook()
    await saveBook(book)
    const retrieved = await getBook(book.id)
    expect(retrieved?.title).toBe('雨夜书房')
    expect(await getAllBooks()).toHaveLength(testId)
  })

  it('saves and retrieves chapters in order', async () => {
    const book = makeBook()
    await saveBook(book)
    await saveChapters(book.id, [
      { id: 'ch1', index: 0, title: '雨先抵达', href: 'ch1.xhtml' },
      { id: 'ch2', index: 1, title: '没有寄出的页码', href: 'ch2.xhtml' },
    ])
    const chapters = await getChapters(book.id)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].title).toBe('雨先抵达')
    expect(chapters[1].title).toBe('没有寄出的页码')
  })

  it('saves and retrieves reading progress', async () => {
    const book = makeBook()
    await saveBook(book)
    const progress = createReadingProgress(book.id, makeLocator(book.id), 12, 38)
    await saveReadingProgress(progress)
    const retrieved = await getReadingProgress(book.id)
    expect(retrieved?.totalProgress).toBe(38)
    expect(retrieved?.locator.position.selectedText).toBe('书房先听见了雨')
  })

  it('saves highlights, annotations and marginalia', async () => {
    const book = makeBook()
    const locator = makeLocator(book.id)
    await saveBook(book)
    const highlight = createHighlight({
      id: `${book.id}-hl-1`,
      bookId: book.id,
      locator,
      color: 'rose',
    })
    await saveHighlight(highlight)

    const annotation = createAnnotation({
      id: `${book.id}-note-1`,
      bookId: book.id,
      highlightId: highlight.id,
      locator,
      text: '雨声把这一句托住了。',
    })
    await saveAnnotation(annotation)

    const marginalia = createMarginalia({
      id: `${book.id}-fish-1`,
      bookId: book.id,
      annotationId: annotation.id,
      locator,
      text: '也许书并不知道。',
      visibility: 'reveal_on_reach',
    })
    await saveMarginalia(marginalia)

    expect(await getHighlights(book.id)).toHaveLength(1)
    expect(await getAnnotations(book.id)).toHaveLength(1)
    expect(await getMarginalia(book.id)).toHaveLength(1)
  })
})
