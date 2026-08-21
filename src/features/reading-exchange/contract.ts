import type { Annotation } from '../../domain/annotation'
import type { Book } from '../../domain/book'
import type { ChapterText } from '../../reader/bookContent'

export const READING_EXCHANGE_SCHEMA_VERSION = '1.0' as const

export type ReadingInvitation = {
  invitationId: string
  annotation: Pick<Annotation, 'id' | 'text' | 'createdAt'> & { author: string }
  passage: {
    selectedText: string
    paragraphsBefore: string[]
    paragraphContainingSelection: string
    paragraphsAfter: string[]
  }
}

export type ReadingExchangePackage = {
  schemaVersion: typeof READING_EXCHANGE_SCHEMA_VERSION
  exchangeId: string
  createdAt: string
  book: Pick<Book, 'id' | 'title' | 'author'>
  chapter: { index: number; title: string; label: string }
  invitations: ReadingInvitation[]
  responseInstructions: {
    actions: readonly ['reply', 'seen']
    note: string
  }
  responseTemplate: CompanionExchangeResponse
}

export type CompanionExchangeItem = {
  responseId: string
  invitationId: string
  annotationId: string
  action: 'reply' | 'seen'
  text?: string
  visibility: 'immediate'
  idempotencyKey: string
}

export type CompanionExchangeResponse = {
  schemaVersion: typeof READING_EXCHANGE_SCHEMA_VERSION
  exchangeId: string
  responseId: string
  bookId: string
  companion: { name: string }
  completedAt: string
  responses: CompanionExchangeItem[]
}

function invitationId(annotationId: string): string {
  return `invitation:${annotationId}`
}

export function buildReadingExchangePackage(input: {
  book: Pick<Book, 'id' | 'title' | 'author'>
  chapter: ChapterText
  chapterIndex: number
  annotations: Annotation[]
  userName: string
  companionName: string
  exchangeId: string
  createdAt?: string
  contextParagraphs?: number
}): ReadingExchangePackage {
  const contextParagraphs = input.contextParagraphs ?? 2
  const invitations = input.annotations
    .filter((annotation) => annotation.bookId === input.book.id
      && annotation.locator.position.chapterIndex === input.chapterIndex)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map<ReadingInvitation>((annotation) => {
      const paragraphIndex = annotation.locator.position.elementPath[0] ?? 0
      const paragraphs = input.chapter.paragraphs
      return {
        invitationId: invitationId(annotation.id),
        annotation: {
          id: annotation.id,
          text: annotation.text,
          createdAt: annotation.createdAt,
          author: input.userName,
        },
        passage: {
          selectedText: annotation.locator.position.selectedText,
          paragraphsBefore: paragraphs.slice(Math.max(0, paragraphIndex - contextParagraphs), paragraphIndex),
          paragraphContainingSelection: paragraphs[paragraphIndex] ?? annotation.locator.position.selectedText,
          paragraphsAfter: paragraphs.slice(paragraphIndex + 1, paragraphIndex + contextParagraphs + 1),
        },
      }
    })

  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    schemaVersion: READING_EXCHANGE_SCHEMA_VERSION,
    exchangeId: input.exchangeId,
    createdAt,
    book: { id: input.book.id, title: input.book.title, author: input.book.author },
    chapter: { index: input.chapterIndex, title: input.chapter.title, label: input.chapter.chapter },
    invitations,
    responseInstructions: {
      actions: ['reply', 'seen'],
      note: '可选择回复或只标记读过；不要改写 invitationId、annotationId、bookId 与 exchangeId。',
    },
    responseTemplate: {
      schemaVersion: READING_EXCHANGE_SCHEMA_VERSION,
      exchangeId: input.exchangeId,
      responseId: `response:${input.exchangeId}`,
      bookId: input.book.id,
      companion: { name: input.companionName },
      completedAt: createdAt,
      responses: invitations.map((invitation) => ({
        responseId: `response:${invitation.annotation.id}`,
        invitationId: invitation.invitationId,
        annotationId: invitation.annotation.id,
        action: 'reply',
        text: '请在这里写回复；若只读不回，把 action 改成 seen 并删除 text。',
        visibility: 'immediate',
        idempotencyKey: `${input.exchangeId}:${invitation.annotation.id}:1`,
      })),
    },
  }
}

export function readingExchangeToMarkdown(exchange: ReadingExchangePackage): string {
  const lines = [
    '# 共读交换包',
    '',
    `书：${exchange.book.title}`,
    `作者：${exchange.book.author}`,
    `章节：${exchange.chapter.label} · ${exchange.chapter.title}`,
    `交换编号：${exchange.exchangeId}`,
  ]

  exchange.invitations.forEach((invitation, index) => {
    lines.push('', `## 批注 ${index + 1}`, '', `邀请编号：${invitation.invitationId}`)
    if (invitation.passage.paragraphsBefore.length) {
      lines.push('', '前文：', '', ...invitation.passage.paragraphsBefore.map((paragraph) => `> ${paragraph}`))
    }
    lines.push('', '批注所在段：', '', `> ${invitation.passage.paragraphContainingSelection}`)
    lines.push('', '划选原文：', '', `> ${invitation.passage.selectedText}`)
    lines.push('', `${invitation.annotation.author}写：`, '', `> ${invitation.annotation.text}`)
    if (invitation.passage.paragraphsAfter.length) {
      lines.push('', '后文：', '', ...invitation.passage.paragraphsAfter.map((paragraph) => `> ${paragraph}`))
    }
    lines.push('', '你可以回复，也可以只标记读过。')
  })

  lines.push('', '---', '', '请同时返回符合交换包 JSON 契约的回复文件，以便把文字准确夹回书中。')
  return lines.join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseCompanionExchangeResponse(text: string): CompanionExchangeResponse {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('这不是有效的 JSON 文件。')
  }
  if (!isRecord(value)
    || value.schemaVersion !== READING_EXCHANGE_SCHEMA_VERSION
    || typeof value.exchangeId !== 'string'
    || typeof value.responseId !== 'string'
    || typeof value.bookId !== 'string'
    || typeof value.completedAt !== 'string'
    || !isRecord(value.companion)
    || typeof value.companion.name !== 'string'
    || !Array.isArray(value.responses)) {
    throw new Error('回复文件缺少必要字段，或交换格式版本不受支持。')
  }

  const responses = value.responses.map((item, index): CompanionExchangeItem => {
    if (!isRecord(item)
      || typeof item.responseId !== 'string'
      || typeof item.invitationId !== 'string'
      || typeof item.annotationId !== 'string'
      || (item.action !== 'reply' && item.action !== 'seen')
      || item.visibility !== 'immediate'
      || typeof item.idempotencyKey !== 'string'
      || (item.action === 'reply' && (typeof item.text !== 'string' || !item.text.trim()))) {
      throw new Error(`第 ${index + 1} 条回复的字段不完整。`)
    }
    return item as CompanionExchangeItem
  })

  return { ...value, responses } as CompanionExchangeResponse
}

export function expectedInvitationId(annotationId: string): string {
  return invitationId(annotationId)
}
