import { describe, expect, it } from 'vitest'
import { createBook } from './book'

describe('Book', () => {
  it('creates a book with default progress and timestamps', () => {
    const now = '2026-07-26T10:00:00.000Z'
    const book = createBook(
      {
        id: 'book-1',
        title: '雨夜书房',
        author: '小G',
        source: 'marginalia',
        status: 'reading',
      },
      now,
    )

    expect(book.title).toBe('雨夜书房')
    expect(book.progress).toBe(0)
    expect(book.addedAt).toBe(now)
    expect(book.updatedAt).toBe(now)
  })
})
