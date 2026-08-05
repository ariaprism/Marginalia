import type { BookCoverTone } from '../../domain/book'

export type ShelfFilter = 'all' | 'reading' | 'wish' | 'finished'
export type ShelfView = 'list' | 'covers'
export type BookStatus = Exclude<ShelfFilter, 'all'>

export type ShelfBook = {
  id: string
  title: string
  englishTitle: string
  author: string
  status: BookStatus
  statusLabel: string
  progress: number
  description: string
  quote: string
  lastChapter?: string
  tone: BookCoverTone
  coverUrl?: string
  lastOpenedAt?: string
  pinnedAt?: string
}

export const EMPTY_ROOM_BOOK: ShelfBook = {
  id: '',
  title: '',
  englishTitle: '',
  author: '',
  status: 'reading',
  statusLabel: '在读',
  progress: 0,
  description: '',
  quote: '',
  tone: 'rose',
}

export const SHELF_FILTERS: { id: ShelfFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'reading', label: '在读' },
  { id: 'wish', label: '想读' },
  { id: 'finished', label: '已读完' },
]
