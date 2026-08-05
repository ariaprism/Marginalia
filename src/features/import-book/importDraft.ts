import type { BookCoverTone } from '../../domain/book'

export type ImportDraft = {
  title: string
  englishTitle: string
  author: string
  description: string
  tone: BookCoverTone
  coverUrl?: string
}

export const EMPTY_IMPORT_DRAFT: ImportDraft = {
  title: '',
  englishTitle: '',
  author: '',
  description: '',
  tone: 'rose',
}
