import { describe, expect, it } from 'vitest'
import { createBook } from '../../domain/book'
import { createHighlight } from '../../domain/highlight'
import { createAnnotation } from '../../domain/annotation'
import { createMarginalia } from '../../domain/marginalia'
import {
  createReadingProgress,
  moveReadingBookmark,
  removeReadingBookmark,
} from '../../domain/readingProgress'
import {
  getAllBooks,
  getAllReadingProgress,
  getAnnotations,
  getBook,
  getChapters,
  getEpubFile,
  getHighlights,
  getMarginalia,
  getReadingProgress,
  deleteBookCompletely,
  saveAnnotation,
  saveBook,
  saveChapters,
  saveEpubFile,
  saveHighlight,
  saveMarginalia,
  saveReadingProgress,
  setBookPinned,
  setBookStatus,
  touchBook,
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

  it('records the latest intentional opening time', async () => {
    const book = makeBook()
    await saveBook(book)
    await touchBook(book.id, '2026-07-29T08:00:00.000Z')

    expect((await getBook(book.id))?.lastOpenedAt).toBe('2026-07-29T08:00:00.000Z')
    expect((await getBook(book.id))?.updatedAt).toBe('2026-07-29T08:00:00.000Z')
  })

  it('moves a wished-for book into reading on its first正文 opening', async () => {
    const book = { ...makeBook(), status: 'wish' as const }
    await saveBook(book)
    await touchBook(book.id, '2026-07-30T12:00:00.000Z', 'reading')

    expect((await getBook(book.id))?.status).toBe('reading')
  })

  it('persists and clears a manual shelf pin', async () => {
    const book = makeBook()
    await saveBook(book)
    await setBookPinned(book.id, true, '2026-07-30T09:00:00.000Z')

    expect((await getBook(book.id))?.pinnedAt).toBe('2026-07-30T09:00:00.000Z')

    await setBookPinned(book.id, false, '2026-07-30T09:05:00.000Z')
    const unpinned = await getBook(book.id)
    expect(unpinned?.pinnedAt).toBeUndefined()
    expect(unpinned?.updatedAt).toBe('2026-07-30T09:05:00.000Z')
  })

  it('changes reading status without disturbing pin or recent opening', async () => {
    const book = {
      ...makeBook(),
      pinnedAt: '2026-07-30T08:00:00.000Z',
      lastOpenedAt: '2026-07-30T08:30:00.000Z',
    }
    await saveBook(book)
    await setBookStatus(book.id, 'finished', '2026-07-30T09:00:00.000Z')

    const finished = await getBook(book.id)
    expect(finished?.status).toBe('finished')
    expect(finished?.pinnedAt).toBe(book.pinnedAt)
    expect(finished?.lastOpenedAt).toBe(book.lastOpenedAt)
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

  it('keeps one movable bookmark beside the automatic reading position', async () => {
    const book = makeBook()
    const resumeLocator = makeLocator(book.id)
    const bookmarkLocator = {
      ...makeLocator(book.id),
      position: {
        ...makeLocator(book.id).position,
        chapterIndex: 1,
        selectedText: '折页留在另一章',
      },
    }
    const progress = moveReadingBookmark(
      createReadingProgress(book.id, resumeLocator, 50, 20, '2026-07-28T10:00:00.000Z'),
      bookmarkLocator,
      '2026-07-28T10:05:00.000Z',
    )

    await saveReadingProgress(progress)
    const retrieved = await getReadingProgress(book.id)
    expect(retrieved?.locator).toEqual(resumeLocator)
    expect(retrieved?.bookmark?.locator).toEqual(bookmarkLocator)
    expect(await getAllReadingProgress()).toContainEqual(progress)

    await saveReadingProgress(removeReadingBookmark(progress, '2026-07-28T10:10:00.000Z'))
    expect((await getReadingProgress(book.id))?.bookmark).toBeUndefined()
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

  it('deletes a book and every dependent local record in one operation', async () => {
    const book = makeBook()
    const locator = makeLocator(book.id)
    const highlight = createHighlight({
      id: `${book.id}-hl-delete`,
      bookId: book.id,
      locator,
      color: 'rose',
    })
    const annotation = createAnnotation({
      id: `${book.id}-note-delete`,
      bookId: book.id,
      highlightId: highlight.id,
      locator,
      text: '会跟着书一起移出。',
    })
    const marginalia = createMarginalia({
      id: `${book.id}-reply-delete`,
      bookId: book.id,
      annotationId: annotation.id,
      locator,
      text: '这条回信也会一起移出。',
      visibility: 'immediate',
    })

    await saveBook(book)
    await saveEpubFile(book.id, new Blob(['epub']))
    await saveChapters(book.id, [{ id: 'ch1', index: 0, title: '第一章', href: 'ch1.xhtml' }])
    await saveReadingProgress(createReadingProgress(book.id, locator))
    await saveHighlight(highlight)
    await saveAnnotation(annotation)
    await saveMarginalia(marginalia)

    await deleteBookCompletely(book.id)

    expect(await getBook(book.id)).toBeUndefined()
    expect(await getEpubFile(book.id)).toBeUndefined()
    expect(await getChapters(book.id)).toEqual([])
    expect(await getReadingProgress(book.id)).toBeUndefined()
    expect(await getHighlights(book.id)).toEqual([])
    expect(await getAnnotations(book.id)).toEqual([])
    expect(await getMarginalia(book.id)).toEqual([])
  })
})
