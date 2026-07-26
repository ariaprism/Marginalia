import type { Actor } from './actor'
import type { Locator } from './locator'

export type Visibility = 'immediate' | 'reveal_on_reach'

/**
 * Marginalia 是她留下的文字。
 *
 * 它通常依附于用户的一条 Annotation，也可以直接挂在 Highlight 上。
 * reveal_on_reach 表示用户到达对应位置时才显现。
 */
export type Marginalia = {
  id: string
  bookId: string
  /** 依附的用户批注。 */
  annotationId: string
  locator: Locator
  text: string
  actor: Extract<Actor, 'companion'>
  visibility: Visibility
  createdAt: string
  updatedAt: string
}

export function createMarginalia(
  input: Omit<Marginalia, 'actor' | 'createdAt' | 'updatedAt'>,
  now = new Date().toISOString(),
): Marginalia {
  return {
    ...input,
    actor: 'companion',
    createdAt: now,
    updatedAt: now,
  }
}
