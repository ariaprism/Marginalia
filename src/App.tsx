import {
  ArrowLeft,
  BarChart3,
  BookOpenText,
  Check,
  ChevronRight,
  Copy,
  CornerUpLeft,
  Highlighter,
  ListTree,
  MessageSquareText,
  SunMoon,
  Type,
  Upload,
  X,
} from 'lucide-react'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useBooks } from './features/bookshelf/useBooks'
import { importEpubFile } from './features/import-book/importEpub'
import { loadBookChapters, sampleChapters, type ChapterText } from './reader/bookContent'
import './App.css'

type ShelfFilter = 'all' | 'reading' | 'wish' | 'finished'
type ReaderPanel = 'toc' | 'traces' | 'stats' | 'type' | null
type ReaderTheme = 'day' | 'night'
type ReaderTypeface = 'serif' | 'sans'
type ShelfView = 'list' | 'covers'
type Screen = 'shelf' | 'room' | 'reader'
type BookStatus = Exclude<ShelfFilter, 'all'>

type Book = {
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
  tone: string
}

type Trace = {
  id: string
  /** 痕迹归属的书，避免不同书之间互相串数据。 */
  bookId: string
  chapterIndex: number
  sentenceStart?: number
  sentenceEnd?: number
  highlighted?: boolean
  chapter: string
  quote: string
  foxNotes?: NoteEntry[]
  fish?: string
  fishAt?: string
}

type NoteEntry = { id: string; text: string; createdAt: string }

type ReflowAnchor = { chapterIndex: number; ratio: number }
type SentenceSelection = { chapterIndex: number; start: number; end: number }
type BubblePosition = { left: number; top: number; placement: 'above' | 'below' }

const books: Book[] = [
  {
    id: 'rain-room',
    title: '雨夜书房',
    englishTitle: 'The Library After Rain',
    author: '小G · 著',
    status: 'reading',
    statusLabel: '在读',
    progress: 38,
    description: '一座只在雨夜出现的旧书房，替迟迟没有说出口的人，保存那些被折起来的句子。',
    quote: '灯亮起来以前，书房先听见了雨。',
    lastChapter: '第一章',
    tone: 'rose',
  },
  {
    id: 'bottle-museum',
    title: '漂流瓶博物馆',
    englishTitle: 'Museum of Unsent Letters',
    author: '林渡 · 著',
    status: 'wish',
    statusLabel: '想读',
    progress: 0,
    description: '海边有一间博物馆，只收藏从未抵达收信人手里的信。',
    quote: '每一封没有寄出的信，都曾经抵达过写信的人。',
    tone: 'blue',
  },
  {
    id: 'winter-greenhouse',
    title: '玻璃温室里的冬天',
    englishTitle: 'Winter in the Glasshouse',
    author: '周悬 · 著',
    status: 'finished',
    statusLabel: '已读完',
    progress: 100,
    description: '两个替植物记录体温的人，在漫长冬季里交换各自的天气。',
    quote: '我们并没有等到春天，只是学会了辨认更轻的绿色。',
    lastChapter: '尾声',
    tone: 'green',
  },
  {
    id: 'light-index',
    title: '光的索引',
    englishTitle: 'An Index of Light',
    author: 'Mira Vale · 著',
    status: 'wish',
    statusLabel: '想读',
    progress: 0,
    description: '一本记录清晨、黄昏和旧窗户的私人词典。',
    quote: 'Light remembers every room differently.',
    tone: 'ochre',
  },
]

/** 示例书《雨夜书房》预置的痕迹，仅属于 rain-room 这一本。 */
const initialTraces: Trace[] = [
  {
    id: 'trace-1',
    bookId: 'rain-room',
    chapterIndex: 0,
    chapter: '第一章 · 雨先抵达',
    quote: '句子需要重量。',
    highlighted: true,
    foxNotes: [{ id: 'fox-note-1', text: '有些话打在屏幕上很轻，写进书里以后却会留下来。', createdAt: '07/14/18：47' }],
  },
  {
    id: 'trace-2',
    bookId: 'rain-room',
    chapterIndex: 1,
    chapter: '第二章 · 没有寄出的页码',
    quote: '我以为有人提前知道了我的心事。',
    highlighted: true,
    foxNotes: [{ id: 'fox-note-2', text: '读到这里时，好像被一本陌生的书认了出来。', createdAt: '07/15/16：42' }],
    fish: '也许书并不知道，只是它替那一刻保留了一个位置。',
    fishAt: '07/15/17：00',
  },
  {
    id: 'trace-3',
    bookId: 'rain-room',
    chapterIndex: 3,
    chapter: '第四章 · 替沉默装订',
    quote: '空白并不比文字轻。',
    highlighted: true,
  },
]

function formatTraceTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${pad(date.getHours())}：${pad(date.getMinutes())}`
}

function traceLineClass(trace: Trace) {
  if (trace.highlighted) return 'trace-line-highlight'
  if (trace.foxNotes?.length) return 'trace-line-annotation'
  return ''
}

const filters: { id: ShelfFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'reading', label: '在读' },
  { id: 'wish', label: '想读' },
  { id: 'finished', label: '已读完' },
]

function ChapterTraceMark() {
  return (
    <svg className="chapter-trace-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.1 2.8c3.6.2 7.3-.2 11.1 0 .9 0 1.5.6 1.5 1.5-.2 5.1.2 10.2 0 15.4 0 .9-.6 1.5-1.5 1.5-3.7-.2-7.4.2-11.1 0-.9 0-1.5-.6-1.5-1.5.2-5.2-.2-10.3 0-15.4 0-.9.6-1.5 1.5-1.5Z" />
      <path d="M7.7 7.1c2.1-.3 4.1.3 6.4-.1M7.5 10.5c3 .4 5.3-.4 8.8.1M7.8 13.8c1.7-.2 3.1.3 4.8 0" />
      <circle className="trace-dot" cx="15.9" cy="15.6" r=".75" />
      <circle className="trace-dot" cx="9.1" cy="17.7" r=".55" />
    </svg>
  )
}

function catalogueIndexFor(book: Book) {
  const sampleIndex = books.findIndex((item) => item.id === book.id)
  if (sampleIndex >= 0) return sampleIndex + 1
  let hash = 0
  for (const char of book.id) hash = (hash * 31 + char.charCodeAt(0)) % 89
  return books.length + 1 + hash
}

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const catalogueNumber = String(catalogueIndexFor(book)).padStart(2, '0')
  return (
    <span className={`book-cover cover-${book.tone} ${large ? 'is-large' : ''}`} aria-hidden="true">
      <span className="cover-index">MARGINALIA · {catalogueNumber}</span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-english">{book.englishTitle}</span>
    </span>
  )
}

/**
 * 藏书入口。
 *
 * 用 <label> 直接包住 <input type="file">，而不是拿按钮去 input.click()：
 * iOS Safari 只信任落在 input 自身上的用户手势，JS 转发的点击会被静默忽略，
 * 表现就是手机上点「藏入一本书」毫无反应。
 */
function ImportBookControl({ onFileChange }: { onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="import-book">
      <Upload size={18} strokeWidth={1.5} aria-hidden="true" />
      <span>藏入一本书</span>
      <input
        type="file"
        accept=".epub,application/epub+zip"
        className="import-book-input"
        onChange={onFileChange}
      />
    </label>
  )
}

function BrandHeader({ onBack, shelfView, onToggleView, onFileChange }: { onBack?: () => void; shelfView?: ShelfView; onToggleView?: () => void; onFileChange?: (event: React.ChangeEvent<HTMLInputElement>) => void }) {
  if (onBack) {
    return (
      <header className="shelf-header room-header">
        <button className="room-back-link" type="button" onClick={onBack} aria-label="返回书架">
          <span className="room-back"><ArrowLeft /></span><small>BACK TO BOOKSHELF</small>
        </button>
      </header>
    )
  }

  return (
    <header className="shelf-header">
      <button
        className="brand-lockup brand-toggle"
        type="button"
        onClick={onToggleView}
        aria-label={shelfView === 'covers' ? '切换为列表书架' : '切换为封面书架'}
        title={shelfView === 'covers' ? '切换为列表书架' : '切换为封面书架'}
      >
        <span className="brand-flourish" aria-hidden="true">
          <span className="seal-curve seal-curve-outer" />
          <span className="seal-curve seal-curve-inner" />
          <i>M</i>
        </span>
        <div><p className="brand-name">Marginalia</p><p className="brand-subtitle">在正文之外，我们相遇。</p></div>
      </button>
      {onFileChange && <ImportBookControl onFileChange={onFileChange} />}
    </header>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>('shelf')
  const [shelfView, setShelfView] = useState<ShelfView>('list')
  const [roomBook, setRoomBook] = useState<Book>(books[0])
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [readerChapters, setReaderChapters] = useState<ChapterText[]>(sampleChapters)
  const [readerChaptersReady, setReaderChaptersReady] = useState(true)
  const [pageIndex, setPageIndex] = useState(0)
  const [totalPages, setTotalPages] = useState(sampleChapters.length)
  const [chapterStarts, setChapterStarts] = useState(sampleChapters.map((_, index) => index))
  const [chromeVisible, setChromeVisible] = useState(false)
  const [panel, setPanel] = useState<ReaderPanel>(null)
  const [theme, setTheme] = useState<ReaderTheme>('day')
  const [fontSize, setFontSize] = useState(19)
  const [lineHeight, setLineHeight] = useState(1.95)
  const [pageMargin, setPageMargin] = useState(12)
  const [readerTypeface, setReaderTypeface] = useState<ReaderTypeface>('serif')
  const [selectedText, setSelectedText] = useState('')
  const [sentenceSelection, setSentenceSelection] = useState<SentenceSelection | null>(null)
  const [bubblePosition, setBubblePosition] = useState<BubblePosition | null>(null)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteMenuTargetId, setNoteMenuTargetId] = useState<string | null>(null)
  const [noteTargetTraceId, setNoteTargetTraceId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [traces, setTraces] = useState<Trace[]>(initialTraces)
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null)
  const [returnPage, setReturnPage] = useState<number | null>(null)
  const [pendingChapter, setPendingChapter] = useState<number | null>(null)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; details?: string } | null>(null)
  const [importKey, setImportKey] = useState(0)

  const viewportRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const reflowAnchorRef = useRef<ReflowAnchor | null>(null)

  const booksState = useBooks(importKey)

  const segmentedChapters = useMemo(() => {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'sentence' })
    return readerChapters.map((chapter) => {
      let sentenceIndex = 0
      const paragraphs = chapter.paragraphs.map((paragraph) => (
        Array.from(segmenter.segment(paragraph), ({ segment }) => ({
          index: sentenceIndex++,
          text: segment,
        }))
      ))
      return { paragraphs, sentences: paragraphs.flat() }
    })
  }, [readerChapters])

  const loadedBooks: Book[] = useMemo(() => {
    if (booksState.status !== 'ready') return []
    return booksState.books.map((domainBook) => ({
      id: domainBook.id,
      title: domainBook.title,
      englishTitle: '',
      author: domainBook.author,
      status: domainBook.status as BookStatus,
      statusLabel: domainBook.status === 'reading' ? '在读' : domainBook.status === 'wish' ? '想读' : '已读完',
      progress: domainBook.progress,
      description: domainBook.description ?? '',
      quote: '',
      tone: 'rose' as const,
    }))
  }, [booksState])

  const shelfBooks: Book[] = useMemo(() => [...books, ...loadedBooks], [loadedBooks])

  const openableBookIds = useMemo(
    () => new Set(['rain-room', ...loadedBooks.map((book) => book.id)]),
    [loadedBooks],
  )

  const filteredBooks = useMemo(
    () => shelfBooks.filter((book) => filter === 'all' || book.status === filter),
    [filter, shelfBooks],
  )

  /**
   * 只属于当前这本书的痕迹。
   *
   * 所有展示与统计都必须走这个列表，直接用 traces 会把示例书的划线
   * 漏到别的书里（书房页、页边痕迹、统计都出现过这个串数据的问题）。
   */
  const bookTraces = useMemo(
    () => traces.filter((trace) => trace.bookId === roomBook.id),
    [roomBook.id, traces],
  )

  const currentChapterIndex = useMemo(() => {
    let active = 0
    chapterStarts.forEach((start, index) => { if (start <= pageIndex) active = index })
    return active
  }, [chapterStarts, pageIndex])

  const selectedRangeTrace = useMemo(() => {
    if (!sentenceSelection) return undefined
    return bookTraces.find((trace) => trace.chapterIndex === sentenceSelection.chapterIndex
      && trace.sentenceStart === sentenceSelection.start
      && trace.sentenceEnd === sentenceSelection.end)
  }, [bookTraces, sentenceSelection])
  const selectedRangeIsHighlighted = Boolean(selectedRangeTrace && selectedRangeTrace.highlighted !== false)
  const activeNoteTrace = useMemo(
    () => bookTraces.find((trace) => trace.id === noteTargetTraceId),
    [bookTraces, noteTargetTraceId],
  )
  const noteQuoteLineClass = (activeNoteTrace ?? selectedRangeTrace)?.highlighted
    ? 'trace-line-highlight'
    : 'trace-line-annotation'
  const noteEntries = activeNoteTrace?.foxNotes ?? selectedRangeTrace?.foxNotes ?? []

  const showToast = (message: string, details?: string) => {
    setToast({ message, details })
    if (!details) {
      window.setTimeout(() => setToast(null), 2200)
    }
  }

  const clearToast = () => setToast(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const result = await importEpubFile(file)
    if (result.ok) {
      setImportKey((key) => key + 1)
      showToast('已经藏入书架。')
    } else {
      showToast(result.message, result.details)
    }
  }

  const toggleShelfView = () => {
    const next = shelfView === 'list' ? 'covers' : 'list'
    setShelfView(next)
    showToast(next === 'covers' ? '已切换为封面书架。' : '已切换为列表书架。')
  }

  const recalculatePagination = useCallback(() => {
    const viewport = viewportRef.current
    const flow = flowRef.current
    if (!viewport || !flow || viewport.clientWidth < 1) return

    const width = viewport.clientWidth
    flow.style.setProperty('--column-width', `${width}px`)

    window.requestAnimationFrame(() => {
      const nextTotal = Math.max(1, Math.ceil(flow.scrollWidth / width))
      const flowRect = flow.getBoundingClientRect()
      const nextStarts = Array.from(flow.querySelectorAll<HTMLElement>('[data-chapter-index]')).map((heading) => {
        const left = heading.getBoundingClientRect().left - flowRect.left
        return Math.max(0, Math.min(nextTotal - 1, Math.round(left / width)))
      })

      setTotalPages(nextTotal)
      setChapterStarts(nextStarts)
      const anchor = reflowAnchorRef.current
      if (anchor) {
        const start = nextStarts[anchor.chapterIndex] ?? 0
        const end = nextStarts[anchor.chapterIndex + 1] ?? nextTotal
        const length = Math.max(1, end - start)
        setPageIndex(Math.min(nextTotal - 1, start + Math.round((length - 1) * anchor.ratio)))
        reflowAnchorRef.current = null
      } else if (pendingChapter !== null) {
        setPageIndex(nextStarts[pendingChapter] ?? 0)
        setPendingChapter(null)
      } else {
        setPageIndex((current) => Math.min(current, nextTotal - 1))
      }
    })
  }, [pendingChapter])

  useLayoutEffect(() => {
    if (screen !== 'reader') return
    recalculatePagination()
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(recalculatePagination)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [screen, fontSize, lineHeight, pageMargin, readerTypeface, recalculatePagination])

  useLayoutEffect(() => {
    if (!sentenceSelection || screen !== 'reader') {
      setBubblePosition(null)
      return
    }

    const updateBubblePosition = () => {
      const sentenceElements = Array.from(document.querySelectorAll<HTMLElement>(
        `[data-chapter-index="${sentenceSelection.chapterIndex}"] [data-sentence-index]`,
      )).filter((element) => {
        const index = Number(element.dataset.sentenceIndex)
        return index >= sentenceSelection.start && index <= sentenceSelection.end
      })
      const rects = sentenceElements.flatMap((element) => Array.from(element.getClientRects()))
        .filter((rect) => rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight)
      if (!rects.length) {
        setBubblePosition(null)
        return
      }

      const leftEdge = Math.min(...rects.map((rect) => rect.left))
      const rightEdge = Math.max(...rects.map((rect) => rect.right))
      const topEdge = Math.min(...rects.map((rect) => rect.top))
      const bottomEdge = Math.max(...rects.map((rect) => rect.bottom))
      const bubbleHalfWidth = Math.min(114, (window.innerWidth - 24) / 2)
      const left = Math.max(12 + bubbleHalfWidth, Math.min(window.innerWidth - 12 - bubbleHalfWidth, (leftEdge + rightEdge) / 2))
      const placeAbove = topEdge >= 66
      setBubblePosition({
        left,
        top: placeAbove ? topEdge - 54 : bottomEdge + 10,
        placement: placeAbove ? 'above' : 'below',
      })
    }

    updateBubblePosition()
    window.addEventListener('resize', updateBubblePosition)
    return () => window.removeEventListener('resize', updateBubblePosition)
  }, [fontSize, lineHeight, pageIndex, pageMargin, readerTypeface, screen, sentenceSelection])

  const rememberReflowAnchor = () => {
    const start = chapterStarts[currentChapterIndex] ?? 0
    const end = chapterStarts[currentChapterIndex + 1] ?? totalPages
    const length = Math.max(1, end - start)
    reflowAnchorRef.current = {
      chapterIndex: currentChapterIndex,
      ratio: Math.max(0, Math.min(1, (pageIndex - start) / length)),
    }
  }

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges()
    setSentenceSelection(null)
    setBubblePosition(null)
    setSelectedText('')
  }

  const applySentenceSelection = (selection: SentenceSelection | null) => {
    setSentenceSelection(selection)
    if (!selection) {
      setSelectedText('')
      return
    }
    const sentences = segmentedChapters[selection.chapterIndex].sentences
    setSelectedText(sentences.slice(selection.start, selection.end + 1).map((sentence) => sentence.text).join(''))
    setChromeVisible(false)
    setPanel(null)
    setActiveTrace(null)
  }

  const handleSentenceClick = (event: React.MouseEvent<HTMLSpanElement>, chapterIndex: number, sentenceIndex: number) => {
    event.stopPropagation()
    if (!sentenceSelection || sentenceSelection.chapterIndex !== chapterIndex) {
      applySentenceSelection({ chapterIndex, start: sentenceIndex, end: sentenceIndex })
      return
    }

    const { start, end } = sentenceSelection
    if (start === end && sentenceIndex === start) applySentenceSelection(null)
    else if (sentenceIndex === start) applySentenceSelection({ chapterIndex, start: start + 1, end })
    else if (sentenceIndex === end) applySentenceSelection({ chapterIndex, start, end: end - 1 })
    else if (sentenceIndex === start - 1) applySentenceSelection({ chapterIndex, start: sentenceIndex, end })
    else if (sentenceIndex === end + 1) applySentenceSelection({ chapterIndex, start, end: sentenceIndex })
    else applySentenceSelection({ chapterIndex, start: sentenceIndex, end: sentenceIndex })
  }

  const openReaderAtChapter = (chapterIndex: number, book: Book = roomBook) => {
    setRoomBook(book)
    setReaderChaptersReady(false)
    setScreen('reader')
    setChromeVisible(false)
    setPanel(null)
    loadBookChapters(book.id)
      .then((loadedChapters) => {
        if (!loadedChapters.length) {
          setScreen('shelf')
          setReaderChaptersReady(true)
          showToast('这本书暂时无法打开', '没有从这本书里解析出可阅读的章节。')
          return
        }
        setReaderChapters(loadedChapters)
        setPendingChapter(chapterIndex)
        setPageIndex(0)
        setReaderChaptersReady(true)
      })
      .catch((error) => {
        setScreen('shelf')
        setReaderChaptersReady(true)
        showToast('这本书暂时无法打开', String(error))
      })
  }

  const openRoom = (book: Book) => {
    setRoomBook(book)
    setScreen('room')
    setReaderChaptersReady(false)
    loadBookChapters(book.id)
      .then((loadedChapters) => {
        setReaderChapters(loadedChapters)
        setReaderChaptersReady(true)
      })
      .catch(() => {
        setReaderChapters([])
        setReaderChaptersReady(true)
      })
  }

  const turnToPage = (nextPage: number) => {
    const bounded = Math.max(0, Math.min(totalPages - 1, nextPage))
    if (bounded === pageIndex) return
    setPageIndex(bounded)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
    clearSelection()
  }

  const handleReaderClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, mark, textarea, input, select')) return
    if (sentenceSelection) {
      clearSelection()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - rect.left) / rect.width
    if (position < 0.4) turnToPage(pageIndex - 1)
    else if (position > 0.6) turnToPage(pageIndex + 1)
    else { setChromeVisible((visible) => !visible); setPanel(null) }
  }

  const saveHighlight = () => {
    if (!selectedText || !sentenceSelection) return
    const chapterIndex = sentenceSelection?.chapterIndex ?? currentChapterIndex
    setTraces((current) => {
      const existingIndex = current.findIndex((trace) => trace.bookId === roomBook.id
        && trace.chapterIndex === chapterIndex
        && trace.sentenceStart === sentenceSelection.start
        && trace.sentenceEnd === sentenceSelection.end)
      if (existingIndex >= 0) {
        return current.map((trace, index) => index === existingIndex
          ? { ...trace, quote: selectedText, highlighted: true }
          : trace)
      }
      return [...current, {
        id: `trace-${Date.now()}`,
        bookId: roomBook.id,
        chapterIndex,
        sentenceStart: sentenceSelection.start,
        sentenceEnd: sentenceSelection.end,
        highlighted: true,
        chapter: `${readerChapters[chapterIndex].chapter} · ${readerChapters[chapterIndex].title}`,
        quote: selectedText,
      }]
    })
    clearSelection()
    showToast('这句话已经留在页边。')
  }

  const cancelHighlight = () => {
    if (!sentenceSelection) return
    setTraces((current) => current.flatMap((trace) => {
      const isCurrentRange = trace.bookId === roomBook.id
        && trace.chapterIndex === sentenceSelection.chapterIndex
        && trace.sentenceStart === sentenceSelection.start
        && trace.sentenceEnd === sentenceSelection.end
      if (!isCurrentRange) return [trace]
      if (trace.foxNotes?.length || trace.fish) return [{ ...trace, highlighted: false }]
      return []
    }))
    clearSelection()
    showToast('已经取消这处划线。')
  }

  const openSentenceNoteSheet = () => {
    setNoteTargetTraceId(selectedRangeTrace?.id ?? null)
    setEditingNoteId(null)
    setNoteDraft('')
    setNoteMenuTargetId(null)
    setNoteComposerOpen(true)
  }

  const closeNoteSheet = () => {
    setNoteComposerOpen(false)
    setNoteMenuTargetId(null)
    setNoteTargetTraceId(null)
    setEditingNoteId(null)
    setNoteDraft('')
    clearSelection()
  }

  const saveNote = () => {
    if (!selectedText || !noteDraft.trim()) return
    const chapterIndex = sentenceSelection?.chapterIndex ?? currentChapterIndex
    const targetId = noteTargetTraceId ?? selectedRangeTrace?.id ?? `trace-${Date.now()}`
    const noteTimestamp = formatTraceTime(new Date())
    const noteId = editingNoteId ?? `fox-note-${Date.now()}-${noteEntries.length}`
    const nextNote = { id: noteId, text: noteDraft.trim(), createdAt: noteTimestamp }
    setTraces((current) => {
      if (current.some((trace) => trace.id === targetId)) {
        return current.map((trace) => {
          if (trace.id !== targetId) return trace
          const foxNotes = trace.foxNotes ?? []
          return {
            ...trace,
            quote: selectedText,
            foxNotes: editingNoteId
              ? foxNotes.map((note) => note.id === editingNoteId ? { ...note, text: nextNote.text } : note)
              : [...foxNotes, nextNote],
          }
        })
      }
      const existingIndex = sentenceSelection ? current.findIndex((trace) => trace.bookId === roomBook.id
        && trace.chapterIndex === chapterIndex
        && trace.sentenceStart === sentenceSelection.start
        && trace.sentenceEnd === sentenceSelection.end) : -1
      if (existingIndex >= 0) {
        return current.map((trace, index) => index === existingIndex
          ? { ...trace, quote: selectedText, foxNotes: [...(trace.foxNotes ?? []), nextNote], highlighted: trace.highlighted ?? false }
          : trace)
      }
      return [...current, {
        id: targetId,
        bookId: roomBook.id,
        chapterIndex,
        sentenceStart: sentenceSelection?.start,
        sentenceEnd: sentenceSelection?.end,
        highlighted: false,
        chapter: `${readerChapters[chapterIndex].chapter} · ${readerChapters[chapterIndex].title}`,
        quote: selectedText,
        foxNotes: [nextNote],
      }]
    })
    setNoteTargetTraceId(targetId)
    setEditingNoteId(null)
    setNoteDraft('')
    setNoteMenuTargetId(null)
    showToast('批注已经夹进这一页。')
  }

  const reviseNote = (note: NoteEntry) => {
    setEditingNoteId(note.id)
    setNoteDraft(note.text)
    setNoteMenuTargetId(null)
  }

  const removeNote = (noteId: string) => {
    if (!noteTargetTraceId) return
    setTraces((current) => current.flatMap((trace) => {
      if (trace.id !== noteTargetTraceId) return [trace]
      const foxNotes = (trace.foxNotes ?? []).filter((note) => note.id !== noteId)
      if (foxNotes.length || trace.highlighted || trace.fish) return [{ ...trace, foxNotes }]
      return []
    }))
    if (editingNoteId === noteId) {
      setEditingNoteId(null)
      setNoteDraft('')
    }
    setNoteMenuTargetId(null)
    showToast('这段文字已经抹去。')
  }

  const reviseActiveTraceNote = (trace: Trace, note: NoteEntry) => {
    setSelectedText(trace.quote)
    setNoteTargetTraceId(trace.id)
    setEditingNoteId(note.id)
    setNoteDraft(note.text)
    setNoteMenuTargetId(null)
    setActiveTrace(null)
    setNoteComposerOpen(true)
  }

  const removeActiveTraceNote = (trace: Trace, noteId: string) => {
    setTraces((current) => current.flatMap((item) => {
      if (item.id !== trace.id) return [item]
      const foxNotes = (item.foxNotes ?? []).filter((note) => note.id !== noteId)
      if (foxNotes.length || item.highlighted || item.fish) return [{ ...item, foxNotes }]
      return []
    }))
    setNoteMenuTargetId(null)
    setActiveTrace(null)
    showToast('这段文字已经抹去。')
  }

  const jumpToChapter = (chapterIndex: number) => {
    if (returnPage === null) setReturnPage(pageIndex)
    setPageIndex(chapterStarts[chapterIndex] ?? 0)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
  }

  const openExistingTrace = (chapterIndex: number, quote: string) => {
    const trace = bookTraces.find((item) => item.chapterIndex === chapterIndex)
    setActiveTrace(trace ?? {
      id: `preview-${chapterIndex}`,
      bookId: roomBook.id,
      chapterIndex,
      chapter: `${readerChapters[chapterIndex].chapter} · ${readerChapters[chapterIndex].title}`,
      quote,
    })
    setNoteMenuTargetId(null)
    setPanel(null)
    setChromeVisible(false)
  }

  if (screen === 'room') {
    const hasChapters = readerChaptersReady && readerChapters.length > 0
    return (
      <main className="room-shell">
        <BrandHeader onBack={() => setScreen('shelf')} />
        <section className="room-hero">
          <BookCover book={roomBook} large />
          <div className="room-book-info">
            <h1>{roomBook.title}</h1>
            <em>{roomBook.englishTitle}</em>
            <p className="room-author">{roomBook.author}</p>
            <button className="room-description-preview" type="button" onClick={() => setDescriptionOpen(true)} aria-haspopup="dialog">
              <span>{roomBook.description}</span><small>展开</small>
            </button>
          </div>
        </section>
        <section className="room-details">
          <button className="room-recent" type="button" onClick={() => hasChapters && openReaderAtChapter(0)}>
            <BookOpenText /><small>{roomBook.lastChapter ? `最近停留 · ${roomBook.lastChapter} · ${roomBook.statusLabel} ${roomBook.progress}%` : '尚未开始阅读'}</small>
            <q>{roomBook.lastChapter ? roomBook.quote : '这本书还在等待第一次翻开。'}</q>
            <span>{hasChapters ? (roomBook.lastChapter ? '从这里继续' : '从头开始读') : '尚无阅读位置'} <ChevronRight /></span>
          </button>
        </section>
        {hasChapters && (
          <section className="room-chapters">
            <div className="room-section-title"><ChapterTraceMark /><h2>章节与痕迹</h2></div>
            {readerChapters.map((chapter, index) => {
              const chapterTraces = bookTraces.filter((trace) => trace.chapterIndex === index)
              return (
                <div className="room-chapter-group" key={chapter.title}>
                  <button className="room-chapter-heading" type="button" onClick={() => openReaderAtChapter(index)}>
                    <span>{chapter.chapter}</span><strong>{chapter.title}</strong><small>{chapterTraces.length ? `${chapterTraces.length} 条痕迹` : '尚无痕迹'}</small><ChevronRight />
                  </button>
                  {chapterTraces.length > 0 && (
                    <div className="room-trace-list">
                      {chapterTraces.map((trace) => (
                        <button type="button" key={trace.id} onClick={() => openReaderAtChapter(index)}>
                          <q><span className={traceLineClass(trace)}>{trace.quote}</span></q>
                          {trace.foxNotes?.map((note) => <p key={note.id}><b>小狐狸</b>：{note.text}</p>)}
                          {trace.fish && <p className="fish-note"><b>小鱼</b>：{trace.fish}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}
        {descriptionOpen && (
          <div className="description-backdrop" onClick={() => setDescriptionOpen(false)}>
            <section className="description-dialog" role="dialog" aria-modal="true" aria-labelledby="description-title" onClick={(event) => event.stopPropagation()}>
              <div className="description-dialog-heading"><small>ABOUT THE BOOK</small><button type="button" onClick={() => setDescriptionOpen(false)} aria-label="关闭完整简介"><X /></button></div>
              <h2 id="description-title">{roomBook.title}</h2>
              <p>{roomBook.description}</p>
            </section>
          </div>
        )}
        <Toast toast={toast} onClose={clearToast} />
      </main>
    )
  }

  if (screen === 'reader') {
    const currentChapter = readerChapters[currentChapterIndex]
    return (
      <main className={`reader-shell reader-${theme}`}>
        {!readerChaptersReady && (
          <div className="reader-loading" aria-label="正在打开书籍" aria-live="polite">
            <span>正在打开…</span>
          </div>
        )}
        <header className={`reader-topbar ${chromeVisible ? 'is-visible' : ''}`}>
          <button className="icon-button back-button" type="button" onClick={() => setScreen('shelf')} aria-label="返回书架"><ArrowLeft size={19} /><span>书架</span></button>
          <div className="reader-location"><span>{roomBook.title}</span></div>
          <span className="reader-progress">{Math.round(((pageIndex + 1) / totalPages) * 100)}%</span>
        </header>

        <article
          className="reader-page reader-page-v2"
          onClick={handleReaderClick}
          style={{
            '--reader-font-size': `${fontSize}px`,
            '--reader-line-height': lineHeight,
            '--reader-margin': `${pageMargin}%`,
            '--reader-font-family': `var(--font-reading-${readerTypeface})`,
          } as React.CSSProperties}
        >
          <div className="page-grain" aria-hidden="true" />
          <div className="running-header">{currentChapter.chapter} · {currentChapter.title}</div>
          <div className="reader-text-viewport" ref={viewportRef}>
            <div className="reader-flow" ref={flowRef} style={{ transform: `translateX(-${pageIndex * 100}%)` }}>
              {readerChapters.map((chapter, chapterIndex) => (
                <section className="chapter-section" data-chapter-index={chapterIndex} key={chapter.title}>
                  <div className="chapter-heading">
                    <span>{chapter.chapter}</span><h1>{chapter.title}</h1><p>{chapter.kicker}</p>
                  </div>
                  {segmentedChapters[chapterIndex].paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={chapter.paragraphs[paragraphIndex]} className={paragraphIndex === 0 ? 'opening-paragraph' : ''}>
                      {paragraph.map((sentence) => {
                        const highlight = chapter.highlight ?? ''
                        const parts = highlight ? sentence.text.split(highlight) : [sentence.text]
                        const isSelected = sentenceSelection?.chapterIndex === chapterIndex
                          && sentence.index >= sentenceSelection.start
                          && sentence.index <= sentenceSelection.end
                        const hasUserHighlight = bookTraces.some((trace) => trace.chapterIndex === chapterIndex
                          && trace.sentenceStart !== undefined
                          && trace.sentenceEnd !== undefined
                          && trace.highlighted === true
                          && sentence.index >= trace.sentenceStart
                          && sentence.index <= trace.sentenceEnd)
                        const hasAnnotation = !hasUserHighlight && bookTraces.some((trace) => trace.chapterIndex === chapterIndex
                          && trace.sentenceStart !== undefined
                          && trace.sentenceEnd !== undefined
                          && Boolean(trace.foxNotes?.length)
                          && sentence.index >= trace.sentenceStart
                          && sentence.index <= trace.sentenceEnd)
                        return (
                          <span
                            className={`sentence-unit ${isSelected ? 'is-selected' : ''} ${hasUserHighlight ? 'has-user-highlight' : ''} ${hasAnnotation ? 'has-annotation' : ''}`}
                            data-sentence-index={sentence.index}
                            key={sentence.index}
                            onClick={(event) => handleSentenceClick(event, chapterIndex, sentence.index)}
                          >
                            {parts.length === 1 ? sentence.text : <>{parts[0]}<mark onClick={(event) => { event.stopPropagation(); openExistingTrace(chapterIndex, highlight) }}>{highlight}</mark>{parts[1]}</>}
                          </span>
                        )
                      })}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
          <div className="page-number" aria-label={`第 ${pageIndex + 1} 页，共 ${totalPages} 页`}>{String(pageIndex + 1).padStart(2, '0')}<span />{String(totalPages).padStart(2, '0')}</div>
        </article>

        {returnPage !== null && <button className="return-slip" type="button" onClick={() => { setPageIndex(returnPage); setReturnPage(null) }}><CornerUpLeft />回到刚才的位置</button>}

        {activeTrace && (
          <div className="trace-detail-backdrop" onClick={() => { setActiveTrace(null); setNoteMenuTargetId(null) }}>
            <section
              className="trace-detail-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="划线详情"
              onClick={(event) => event.stopPropagation()}
              style={{ '--trace-font-family': `var(--font-reading-${readerTypeface})` } as React.CSSProperties}
            >
              <blockquote>“<span className={traceLineClass(activeTrace)}>{activeTrace.quote}</span>”</blockquote>
              {activeTrace.foxNotes?.length ? activeTrace.foxNotes.map((note) => <div className="trace-note-block" key={note.id}>
                <div className="trace-note-meta"><b>小狐狸</b><time>{note.createdAt}</time><span className="note-menu-anchor"><button type="button" aria-label={`批注操作 ${note.createdAt}`} onClick={() => setNoteMenuTargetId((current) => current === note.id ? null : note.id)}>···</button>{noteMenuTargetId === note.id && <span className="note-action-menu trace-note-menu"><button type="button" onClick={() => reviseActiveTraceNote(activeTrace, note)}>修订</button><button type="button" onClick={() => removeActiveTraceNote(activeTrace, note.id)}>抹去文字</button></span>}</span></div>
                <p>{note.text}</p>
              </div>) : <button className="empty-note" type="button" onClick={() => { setSelectedText(activeTrace.quote); setNoteTargetTraceId(activeTrace.id); setEditingNoteId(null); setNoteDraft(''); setNoteMenuTargetId(null); setActiveTrace(null); setNoteComposerOpen(true) }}>这里还没有文字。留下一道痕迹</button>}
              {activeTrace.fish && <div className="trace-note-block fish-detail"><div className="trace-note-meta"><b>小鱼</b><time>{activeTrace.fishAt}</time></div><p>{activeTrace.fish}</p></div>}
            </section>
          </div>
        )}

        {selectedText && sentenceSelection && !noteComposerOpen && (
          <div
            className={`selection-bubble ${bubblePosition ? `is-${bubblePosition.placement} is-positioned` : ''}`}
            role="toolbar"
            aria-label="句子操作"
            style={{ left: bubblePosition?.left ?? '50%', top: bubblePosition?.top ?? 0 }}
          >
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(selectedText); showToast('已复制。'); clearSelection() }}><Copy />复制</button>
            <button type="button" onClick={selectedRangeIsHighlighted ? cancelHighlight : saveHighlight}><Highlighter />{selectedRangeIsHighlighted ? '抹去' : '划线'}</button>
            <button type="button" onClick={openSentenceNoteSheet}><MessageSquareText />{selectedRangeTrace?.foxNotes?.length ? '重温' : '留痕'}</button>
          </div>
        )}

        {noteComposerOpen && (
          <div className="note-backdrop" onClick={closeNoteSheet}>
            <section
              className={`note-composer ${noteEntries.length ? 'has-notes' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={noteEntries.length ? '重温批注' : '留痕'}
              onClick={(event) => event.stopPropagation()}
              style={{ '--trace-font-family': `var(--font-reading-${readerTypeface})` } as React.CSSProperties}
            >
              <div className="note-quote">“<span className={noteQuoteLineClass}>{selectedText}</span>”</div>
              {noteEntries.map((note) => <article className="sent-note" key={note.id}>
                <div className="sent-note-heading"><b>小狐狸</b><time>{note.createdAt}</time><span className="note-menu-anchor"><button type="button" aria-label={`批注操作 ${note.createdAt}`} onClick={() => setNoteMenuTargetId((current) => current === note.id ? null : note.id)}>···</button>{noteMenuTargetId === note.id && <span className="note-action-menu"><button type="button" onClick={() => reviseNote(note)}>修订</button><button type="button" onClick={() => removeNote(note.id)}>抹去文字</button></span>}</span></div>
                <p>{note.text}</p>
              </article>)}
              <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Thoughts..." autoFocus={!noteEntries.length} />
              <div className="composer-actions"><button type="button" onClick={() => {
                if (editingNoteId) {
                  setEditingNoteId(null)
                  setNoteDraft('')
                } else closeNoteSheet()
              }}>取消</button><button className="save-note" type="button" onClick={saveNote}><Check />留下</button></div>
            </section>
          </div>
        )}

        {panel && (
          <section className="reader-panel">
            <div className="panel-handle" />
            {panel === 'toc' && <><PanelHeading eyebrow="CONTENTS" title="目录" close={() => setPanel(null)} /><div className="toc-list">{readerChapters.map((chapter, index) => <button className={index === currentChapterIndex ? 'is-current' : ''} type="button" key={chapter.title} onClick={() => jumpToChapter(index)}><span>{chapter.chapter}</span><strong>{chapter.title}</strong><small>{String((chapterStarts[index] ?? 0) + 1).padStart(2, '0')}</small></button>)}</div></>}
            {panel === 'traces' && <><PanelHeading eyebrow="MARGINALIA" title="页边痕迹" close={() => setPanel(null)} /><div className="trace-list">{bookTraces.length === 0 ? <p className="panel-empty">这本书还没有留下痕迹。</p> : [...bookTraces].reverse().map((trace) => <button type="button" key={trace.id} onClick={() => jumpToChapter(trace.chapterIndex)}><small>{trace.chapter}</small><blockquote>“<span className={traceLineClass(trace)}>{trace.quote}</span>”</blockquote>{trace.foxNotes?.map((note) => <p key={note.id}><b>小狐狸</b>：{note.text}</p>)}{trace.fish && <p className="fish-note"><b>小鱼</b>：{trace.fish}</p>}</button>)}</div></>}
            {panel === 'stats' && <><PanelHeading eyebrow="READING LIFE" title="阅读统计" close={() => setPanel(null)} /><div className="stats-grid stats-grid-v2"><div><strong>{Math.round(((pageIndex + 1) / totalPages) * 100)}<sup>%</sup></strong><small>当前进度</small></div><div><strong>{currentChapterIndex + 1} / {readerChapters.length} 章</strong><small>读到第几章</small></div><div><strong>{bookTraces.length} 条</strong><small>笔记与划线</small></div></div></>}
            {panel === 'type' && <><PanelHeading eyebrow="TYPESETTING" title="排版" close={() => setPanel(null)} /><div className="type-settings">
              <label><span>字号 <small>{fontSize}px</small></span><input type="range" min="16" max="25" value={fontSize} onChange={(event) => { rememberReflowAnchor(); setFontSize(Number(event.target.value)) }} /></label>
              <label><span>行距 <small>{lineHeight.toFixed(1)}</small></span><input type="range" min="1.5" max="2.3" step="0.1" value={lineHeight} onChange={(event) => { rememberReflowAnchor(); setLineHeight(Number(event.target.value)) }} /></label>
              <label><span>页边距 <small>{pageMargin}%</small></span><input type="range" min="7" max="18" value={pageMargin} onChange={(event) => { rememberReflowAnchor(); setPageMargin(Number(event.target.value)) }} /></label>
              <label><span>字体</span><select value={readerTypeface} onChange={(event) => { rememberReflowAnchor(); setReaderTypeface(event.target.value as ReaderTypeface) }}><option value="serif">书页宋体</option><option value="sans">清晰黑体</option></select></label>
            </div></>}
          </section>
        )}

        <nav className={`reader-toolbar ${chromeVisible ? 'is-visible' : ''}`} aria-label="阅读工具">
          <button aria-label="目录" title="目录" className={panel === 'toc' ? 'is-active' : ''} type="button" onClick={() => setPanel(panel === 'toc' ? null : 'toc')}><ListTree /></button>
          <button aria-label="页边痕迹" title="页边痕迹" className={panel === 'traces' ? 'is-active' : ''} type="button" onClick={() => setPanel(panel === 'traces' ? null : 'traces')}><Highlighter /></button>
          <button aria-label="阅读统计" title="阅读统计" className={panel === 'stats' ? 'is-active' : ''} type="button" onClick={() => setPanel(panel === 'stats' ? null : 'stats')}><BarChart3 /></button>
          <button aria-label={theme === 'day' ? '切换至夜间模式' : '切换至日间模式'} title={theme === 'day' ? '夜间模式' : '日间模式'} type="button" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}><SunMoon /></button>
          <button aria-label="排版设置" title="排版设置" className={panel === 'type' ? 'is-active' : ''} type="button" onClick={() => setPanel(panel === 'type' ? null : 'type')}><Type /></button>
        </nav>
        <Toast toast={toast} onClose={clearToast} />
      </main>
    )
  }

  return (
    <main className="shelf-shell shelf-shell-v2">
      <BrandHeader shelfView={shelfView} onToggleView={toggleShelfView} onFileChange={handleFileChange} />
      <nav className="shelf-filters" aria-label="书架分类">
        {filters.map((item) => {
          const count = item.id === 'all' ? shelfBooks.length : shelfBooks.filter((book) => book.status === item.id).length
          return <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)} aria-label={`${item.label}，${count} 本`} aria-pressed={filter === item.id}><span>{item.label}</span></button>
        })}
      </nav>
      {shelfView === 'list' ? (
        <section className="book-list" aria-label="书籍列表">
          {filteredBooks.map((book) => (
            <article className="book-row book-row-v2" key={book.id}>
              <button className="book-cover-button" type="button" onClick={() => openRoom(book)} aria-label={`查看《${book.title}》的书籍档案`}><BookCover book={book} /><small>查看书籍档案</small></button>
              <button className="book-main book-main-button" type="button" onClick={() => { if (openableBookIds.has(book.id)) openReaderAtChapter(0, book); else { setRoomBook(book); showToast('这本书还没有拆封。') } }} aria-label={`${book.progress ? '继续阅读' : '打开'}《${book.title}》`}>
                <span className="book-state">{book.statusLabel} {book.progress > 0 && `· ${book.progress}%`}</span><strong>{book.title}</strong><em>{book.englishTitle}</em><span className="book-author">{book.author}</span><span className="book-description">{book.description}</span><span className="open-book">{book.progress ? '继续阅读' : '翻开看看'} <ChevronRight /></span>
              </button>
              <button className="book-trace book-trace-button" type="button" onClick={() => { if (openableBookIds.has(book.id)) openReaderAtChapter(0, book); else { setRoomBook(book); showToast('这里还没有阅读痕迹。') } }} aria-label={`查看《${book.title}》最近停留的位置`}>
                <BookOpenText /><small>{book.lastChapter ? `最近停留 · ${book.lastChapter}` : '尚未开始阅读'}</small>
                <q>{book.lastChapter ? book.quote : '这本书还在等待第一次翻开。'}</q>
                <span>{book.lastChapter ? '回到这句话' : '翻开看看'} <ChevronRight /></span>
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="book-grid" aria-label="封面书架">
          {filteredBooks.map((book) => (
            <button className="grid-cover-button" type="button" key={book.id} onClick={() => openRoom(book)} aria-label={`查看《${book.title}》的书籍档案`}>
              <BookCover book={book} />
            </button>
          ))}
        </section>
      )}
      <footer className="shelf-footer"><span>Marginalia · 私人共读书房</span><span>昨夜的灯尚未亮起</span></footer>
      <Toast toast={toast} onClose={clearToast} />
    </main>
  )
}

function PanelHeading({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) {
  return <div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={close} aria-label={`关闭${title}`}><X /></button></div>
}

function Toast({ toast, onClose }: { toast: { message: string; details?: string } | null; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false)
  if (!toast) return null
  return (
    <>
      {toast.details && <div className="toast-backdrop" onClick={onClose} aria-hidden="true" />}
      <div className={`toast ${toast.details ? 'toast-pinned' : ''}`} role="status">
        <span className="toast-message">{toast.message}</span>
        {toast.details && (
          <button
            className="toast-expand"
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-label={expanded ? '收起详情' : '展开详情'}
            aria-expanded={expanded}
          >
            <ChevronRight className={expanded ? 'is-expanded' : ''} />
          </button>
        )}
        {expanded && <pre className="toast-details">{toast.details}</pre>}
      </div>
    </>
  )
}

export default App
