import type { Actor } from './actor'
import type { Highlight } from './highlight'
import type { Locator } from './locator'

/**
 * Annotation 是用户对某段文字的想法。
 *
 * 它可以依附于一条 Highlight，也可以独立存在（只写批注而未主动划线）。
 * 独立批注仍然需要 Locator，以便在正文里找到它所属的位置。
 */
export type Annotation = {
  id: string
  bookId: string
  /** 可选：依附的划线。 */
  highlightId?: string
  locator: Locator
  text: string
  actor: Extract<Actor, 'user'>
  createdAt: string
  updatedAt: string
}

export function createAnnotation(
  input: Omit<Annotation, 'actor' | 'createdAt' | 'updatedAt'>,
  now = new Date().toISOString(),
): Annotation {
  return {
    ...input,
    actor: 'user',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 判断一条 Annotation 是否依附于给定的 Highlight。
 */
export function annotationBelongsToHighlight(annotation: Annotation, highlight: Highlight): boolean {
  return annotation.highlightId === highlight.id && annotation.bookId === highlight.bookId
}
