import { useState } from 'react'

export type ReaderTheme = 'day' | 'night'
export type ReaderTypeface = 'serif' | 'sans'

export function useReaderAppearance() {
  const [theme, setTheme] = useState<ReaderTheme>('day')
  const [fontSize, setFontSize] = useState(19)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [pageMargin, setPageMargin] = useState(8)
  const [readerTypeface, setReaderTypeface] = useState<ReaderTypeface>('serif')

  return {
    theme, setTheme,
    fontSize, setFontSize,
    lineHeight, setLineHeight,
    pageMargin, setPageMargin,
    readerTypeface, setReaderTypeface,
  }
}
