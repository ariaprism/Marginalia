import { useEffect, useState } from 'react'
import {
  readReaderAppearance,
  writeReaderAppearance,
  type ReaderTheme,
  type ReaderTypeface,
} from '../settings/localSettings'

export type { ReaderTheme, ReaderTypeface } from '../settings/localSettings'

export function useReaderAppearance() {
  const [initial] = useState(readReaderAppearance)
  const [theme, setTheme] = useState<ReaderTheme>(initial.theme)
  const [fontSize, setFontSize] = useState(initial.fontSize)
  const [lineHeight, setLineHeight] = useState(initial.lineHeight)
  const [pageMargin, setPageMargin] = useState(initial.pageMargin)
  const [readerTypeface, setReaderTypeface] = useState<ReaderTypeface>(initial.readerTypeface)

  useEffect(() => {
    writeReaderAppearance({ theme, fontSize, lineHeight, pageMargin, readerTypeface })
  }, [fontSize, lineHeight, pageMargin, readerTypeface, theme])

  return {
    theme, setTheme,
    fontSize, setFontSize,
    lineHeight, setLineHeight,
    pageMargin, setPageMargin,
    readerTypeface, setReaderTypeface,
  }
}
