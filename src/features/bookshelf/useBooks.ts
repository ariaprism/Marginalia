import { useEffect, useState } from 'react'
import type { Book } from '../../domain/book'
import { getAllBooks } from '../../data/local/bookStore'

export type BooksState =
  | { status: 'loading' }
  | { status: 'ready'; books: Book[] }
  | { status: 'error'; message: string }

export function useBooks(refreshKey = 0): BooksState {
  const [state, setState] = useState<BooksState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getAllBooks()
      .then((books) => {
        if (!cancelled) setState({ status: 'ready', books })
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', message: String(error) })
      })
    return () => { cancelled = true }
  }, [refreshKey])

  return state
}
