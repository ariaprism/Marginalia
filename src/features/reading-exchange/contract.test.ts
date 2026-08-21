import { describe, expect, it } from 'vitest'
import { createAnnotation } from '../../domain/annotation'
import { createBook } from '../../domain/book'
import { createLocator } from '../../domain/locator'
import { sampleChapters } from '../../reader/bookContent'
import {
  buildReadingExchangePackage,
  parseCompanionExchangeResponse,
  readingExchangeToMarkdown,
} from './contract'

const book = createBook({
  id: 'rain-room', title: '雨夜书房', author: '小G', source: 'marginalia', status: 'reading',
}, '2026-08-18T00:00:00.000Z')

function annotationAt(paragraphIndex: number, id: string) {
  const paragraph = sampleChapters[0].paragraphs[paragraphIndex]
  const selectedText = paragraph.slice(0, 4)
  return createAnnotation({
    id,
    bookId: book.id,
    text: `写在第 ${paragraphIndex + 1} 段`,
    locator: createLocator(book.id, {
      chapterIndex: 0,
      elementPath: [paragraphIndex],
      textOffset: 0,
      selectedText,
      beforeContext: '',
      afterContext: paragraph.slice(4, 20),
    }),
  }, `2026-08-18T00:00:0${paragraphIndex}.000Z`)
}

describe('reading exchange contract', () => {
  it('clips context naturally at the beginning and end of a chapter', () => {
    const exchange = buildReadingExchangePackage({
      book,
      chapter: sampleChapters[0],
      chapterIndex: 0,
      annotations: [annotationAt(0, 'first'), annotationAt(2, 'last')],
      userName: '小狐狸',
      companionName: '小鱼',
      exchangeId: 'exchange-1',
      createdAt: '2026-08-18T01:00:00.000Z',
    })

    expect(exchange.invitations[0].passage.paragraphsBefore).toEqual([])
    expect(exchange.invitations[0].passage.paragraphsAfter).toHaveLength(2)
    expect(exchange.invitations[1].passage.paragraphsBefore).toHaveLength(2)
    expect(exchange.invitations[1].passage.paragraphsAfter).toEqual([])
    expect(JSON.stringify(exchange)).not.toContain('elementPath')
    expect(JSON.stringify(exchange)).not.toContain('textOffset')
    expect(readingExchangeToMarkdown(exchange)).toContain('小狐狸写：')
  })

  it('rejects malformed companion responses', () => {
    expect(() => parseCompanionExchangeResponse('{')).toThrow('有效的 JSON')
    expect(() => parseCompanionExchangeResponse(JSON.stringify({ schemaVersion: '2.0' }))).toThrow('版本不受支持')
  })
})
