import type { Locator } from './locator'

export type HighlightColor = 'rose' | 'gold' | 'mint'

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  rose: '雾粉',
  gold: '淡金',
  mint: '薄荷',
}

export type Highlight = {
  id: string
  bookId: string
  locator: Locator
  color: HighlightColor
  createdAt: string
  updatedAt: string
}

export function createHighlight(
  input: Omit<Highlight, 'createdAt' | 'updatedAt'>,
  now = new Date().toISOString(),
): Highlight {
  return {
    ...input,
    createdAt: now,
    updatedAt: now,
  }
}
