import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  BookOpenText,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  CornerUpLeft,
  Feather,
  Fish,
  Highlighter,
  ImagePlus,
  LibraryBig,
  ListTree,
  MessageSquareText,
  MoreHorizontal,
  Pin,
  Plus,
  SquarePen,
  SunMoon,
  Type,
  Upload,
  Trash2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  deleteBookCompletely,
  getAllReadingProgress,
  getReadingProgress,
  saveReadingProgress,
  setBookPinned,
  setBookStatus,
  touchBook,
} from './data/local/bookStore'
import {
  loadTraces,
  passageKey,
  persistHighlight,
  persistNote,
  removeHighlight,
  removeNote as deleteNoteRecord,
} from './data/local/traceStore'
import { cleanupLegacySampleData } from './data/local/seedSampleTraces'
import type { Locator } from './domain/locator'
import type { BookCoverTone } from './domain/book'
import {
  createReadingProgress,
  moveReadingBookmark,
  removeReadingBookmark,
  type ReadingProgress,
} from './domain/readingProgress'
import { useBooks } from './features/bookshelf/useBooks'
import { coverTitleLines } from './features/bookshelf/coverTitle'
import {
  imageFileToDataUrl,
  prepareEpubFile,
  savePreparedEpub,
  type PreparedEpubImport,
} from './features/import-book/importEpub'
import { loadBookChapters, type ChapterText } from './reader/bookContent'
import {
  locatorFromSentenceRange,
  resolveLocator,
  segmentChapters,
} from './reader/sentenceAnchor'
import type { NoteEntry, Trace } from './reader/trace'
import './App.css'

type ShelfFilter = 'all' | 'reading' | 'wish' | 'finished'
type ReaderPanel = 'toc' | 'traces' | 'stats' | 'type' | null
type ReaderTheme = 'day' | 'night'
type ReaderTypeface = 'serif' | 'sans'
type ShelfView = 'list' | 'covers'
type Screen = 'shelf' | 'room' | 'reader'
type BookStatus = Exclude<ShelfFilter, 'all'>
type SidebarSection = 'shelf' | 'calling-card' | 'thoughts' | 'visits' | 'shadow-books' | 'cloud'

const DRAWER_PAGE_TITLES: Record<Exclude<SidebarSection, 'shelf'>, { title: string; eyebrow: string }> = {
  'calling-card': { title: '名帖', eyebrow: 'CALLING CARDS' },
  thoughts: { title: '念头', eyebrow: 'THOUGHTS' },
  visits: { title: '来访', eyebrow: 'VISITS' },
  'shadow-books': { title: '影子书', eyebrow: 'SHADOW BOOKS' },
  cloud: { title: '云端书房', eyebrow: 'CLOUD ROOM' },
}

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
  tone: BookCoverTone
  coverUrl?: string
  lastOpenedAt?: string
  pinnedAt?: string
}

type ImportDraft = {
  title: string
  englishTitle: string
  author: string
  description: string
  tone: BookCoverTone
  coverUrl?: string
}

type ReflowAnchor = { chapterIndex: number; ratio: number }
type SentenceSelection = { chapterIndex: number; start: number; end: number }
type BubblePosition = { left: number; top: number; placement: 'above' | 'below' }
type PageAnchor = SentenceSelection
type LastView = { screen: Screen; bookId?: string }
type CompanionPronoun = '她' | '他' | 'TA' | 'name'
type CallingCard = {
  userName: string
  companionName: string
  companionPronoun: CompanionPronoun
}

const LAST_VIEW_KEY = 'marginalia:last-view'
const BOOK_RECENCY_KEY = 'marginalia:book-recency'
const CALLING_CARD_KEY = 'marginalia:calling-card'
const DEFAULT_CALLING_CARD: CallingCard = {
  userName: '小狐狸',
  companionName: '小鱼',
  companionPronoun: '她',
}
const EMPTY_IMPORT_DRAFT: ImportDraft = {
  title: '',
  englishTitle: '',
  author: '',
  description: '',
  tone: 'rose',
}
const COVER_TONES: { id: BookCoverTone; label: string }[] = [
  { id: 'rose', label: '棕红' },
  { id: 'blue', label: '雾蓝' },
  { id: 'green', label: '苔绿' },
  { id: 'ochre', label: '赭黄' },
]

function readLastView(): LastView {
  try {
    const raw = window.localStorage.getItem(LAST_VIEW_KEY)
    if (!raw) return { screen: 'shelf' }
    const parsed = JSON.parse(raw) as LastView
    return parsed.screen === 'reader' || parsed.screen === 'room'
      ? parsed
      : { screen: 'shelf' }
  } catch {
    return { screen: 'shelf' }
  }
}

function writeLastView(view: LastView) {
  try {
    window.localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(view))
  } catch {
    // 隐私模式或存储被禁用时，阅读位置仍由 IndexedDB 保存；只是不恢复界面层。
  }
}

function readBookRecency(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(BOOK_RECENCY_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeBookRecency(recency: Record<string, string>) {
  try {
    window.localStorage.setItem(BOOK_RECENCY_KEY, JSON.stringify(recency))
  } catch {
    // 排序偏好写不进去时不影响书籍本身。
  }
}

function readCallingCard(): CallingCard {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CALLING_CARD_KEY) ?? '{}') as Partial<CallingCard>
    const pronoun = stored.companionPronoun
    return {
      userName: stored.userName ?? DEFAULT_CALLING_CARD.userName,
      companionName: stored.companionName ?? DEFAULT_CALLING_CARD.companionName,
      companionPronoun: pronoun === '她' || pronoun === '他' || pronoun === 'TA' || pronoun === 'name'
        ? pronoun
        : DEFAULT_CALLING_CARD.companionPronoun,
    }
  } catch {
    return DEFAULT_CALLING_CARD
  }
}

function writeCallingCard(card: CallingCard) {
  try {
    window.localStorage.setItem(CALLING_CARD_KEY, JSON.stringify(card))
  } catch {
    // 称呼属于轻量界面设置；存储受限时仅保留到本次打开。
  }
}

const EMPTY_ROOM_BOOK: Book = {
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
    </svg>
  )
}

function catalogueIndexFor(book: Book) {
  let hash = 0
  for (const char of book.id) hash = (hash * 31 + char.charCodeAt(0)) % 89
  return 1 + hash
}

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const catalogueNumber = String(catalogueIndexFor(book)).padStart(2, '0')
  const titleLines = coverTitleLines(book.title)
  const widestLine = Math.max(...titleLines.map((line) => Array.from(line).length))
  return (
    <span className={`book-cover cover-${book.tone} ${book.coverUrl ? 'has-image' : ''} ${large ? 'is-large' : ''}`} aria-hidden="true">
      {book.coverUrl
        ? <img className="cover-image" src={book.coverUrl} alt="" />
        : <>
            <span className="cover-index">MARGINALIA · {catalogueNumber}</span>
            <span className={`cover-title ${widestLine > 3 ? 'has-wide-line' : ''}`}>
              {titleLines.map((line, index) => <span className="cover-title-line" key={`${index}-${line}`}>{line}</span>)}
            </span>
            <span className="cover-english">{book.englishTitle}</span>
          </>}
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
function ImportBookControl({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="import-book" type="button" onClick={onOpen}>
      <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
      <span>藏入书籍</span>
    </button>
  )
}

function BrandHeader({
  onBack,
  shelfView,
  onToggleView,
  onOpenSidebar,
  onOpenImport,
  onOpenBookMenu,
  bookMenuOpen,
}: {
  onBack?: () => void
  shelfView?: ShelfView
  onToggleView?: () => void
  onOpenSidebar?: () => void
  onOpenImport?: () => void
  onOpenBookMenu?: () => void
  bookMenuOpen?: boolean
}) {
  if (onBack) {
    return (
      <header className="shelf-header room-header">
        <button className="room-back-link" type="button" onClick={onBack} aria-label="返回书架">
          <span className="room-back"><ArrowLeft /></span><small>BACK TO BOOKSHELF</small>
        </button>
        {onOpenBookMenu && (
          <button className="room-menu-button" type="button" onClick={onOpenBookMenu} aria-label="管理这本书" aria-expanded={bookMenuOpen}>
            <MoreHorizontal />
          </button>
        )}
      </header>
    )
  }

  return (
    <header className="shelf-header">
      <div className="brand-lockup">
        {onOpenSidebar && <SidebarMenuButton onOpen={onOpenSidebar} />}
        <div className="brand-copy">
          <button
            className="brand-title-toggle"
            type="button"
            onClick={onToggleView}
            aria-label={shelfView === 'covers' ? '切换为列表书架' : '切换为封面书架'}
            title={shelfView === 'covers' ? '切换为列表书架' : '切换为封面书架'}
          >
            <span className="brand-name">Marginalia</span>
          </button>
        </div>
      </div>
      {onOpenImport && <ImportBookControl onOpen={onOpenImport} />}
    </header>
  )
}

function SidebarMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="shelf-menu-button" type="button" onClick={onOpen} aria-label="打开侧边栏" title="打开侧边栏">
      <span className="shelf-menu-mark" aria-hidden="true">
        <i className="shelf-menu-leaf" />
        <i className="shelf-menu-pull" />
      </span>
    </button>
  )
}

function DrawerPageHeader({ section, onOpenSidebar }: { section: Exclude<SidebarSection, 'shelf'>; onOpenSidebar: () => void }) {
  const pageTitle = DRAWER_PAGE_TITLES[section]
  return (
    <header className="shelf-header drawer-page-header">
      <div className="drawer-page-title"><SidebarMenuButton onOpen={onOpenSidebar} /><h1>{pageTitle.title}</h1></div>
      <small>{pageTitle.eyebrow}</small>
    </header>
  )
}

function PinnedBookSeal() {
  return (
    <span className="pinned-book-seal" aria-hidden="true">
      <span className="seal-curve seal-curve-outer" />
      <span className="seal-curve seal-curve-inner" />
      <i>M</i>
    </span>
  )
}

async function copyTextToClipboard(text: string) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限策略或浏览器实现仍可能拒绝，继续走同步兼容路径。
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto -9999px'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.focus({ preventScroll: true })
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    copied = false
  }
  textarea.remove()
  return copied
}

function App() {
  const initialViewRef = useRef<LastView>(readLastView())
  const [lastViewRestored, setLastViewRestored] = useState(false)
  const [screen, setScreen] = useState<Screen>('shelf')
  const [shelfView, setShelfView] = useState<ShelfView>('list')
  const [sidebarPhase, setSidebarPhase] = useState<'open' | 'closing' | null>(null)
  const sidebarCloseTimerRef = useRef<number | null>(null)
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('shelf')
  const [drawerPage, setDrawerPage] = useState<SidebarSection | null>(null)
  const [callingCard, setCallingCard] = useState<CallingCard>(readCallingCard)
  const [bookRecency, setBookRecency] = useState<Record<string, string>>(readBookRecency)
  const [bookPinOverrides, setBookPinOverrides] = useState<Record<string, string | null>>({})
  const [bookStatusOverrides, setBookStatusOverrides] = useState<Record<string, BookStatus>>({})
  const [removedBookIds, setRemovedBookIds] = useState<Set<string>>(() => new Set())
  const [roomBook, setRoomBook] = useState<Book>(EMPTY_ROOM_BOOK)
  const [roomMenuOpen, setRoomMenuOpen] = useState(false)
  const [deleteBookDialogOpen, setDeleteBookDialogOpen] = useState(false)
  const [deletingBook, setDeletingBook] = useState(false)
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [readerChapters, setReaderChapters] = useState<ChapterText[]>([])
  const [readerChaptersReady, setReaderChaptersReady] = useState(true)
  const [pageIndex, setPageIndex] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [chapterStarts, setChapterStarts] = useState<number[]>([])
  const [chromeVisible, setChromeVisible] = useState(false)
  const [panel, setPanel] = useState<ReaderPanel>(null)
  const [theme, setTheme] = useState<ReaderTheme>('day')
  const [fontSize, setFontSize] = useState(19)
  const [lineHeight, setLineHeight] = useState(1.8)
  const [pageMargin, setPageMargin] = useState(8)
  const [readerTypeface, setReaderTypeface] = useState<ReaderTypeface>('serif')
  const [selectedText, setSelectedText] = useState('')
  const [sentenceSelection, setSentenceSelection] = useState<SentenceSelection | null>(null)
  const [bubblePosition, setBubblePosition] = useState<BubblePosition | null>(null)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteMenuTargetId, setNoteMenuTargetId] = useState<string | null>(null)
  const [noteTargetTraceId, setNoteTargetTraceId] = useState<string | null>(null)
  /** 正在写的批注要落到哪一处原文。从痕迹详情进来时没有选区，只能靠它。 */
  const [noteTargetLocator, setNoteTargetLocator] = useState<Locator | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [traces, setTraces] = useState<Trace[]>([])
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null)
  const [returnPage, setReturnPage] = useState<number | null>(null)
  const [pendingChapter, setPendingChapter] = useState<number | null>(null)
  const [pendingLocator, setPendingLocator] = useState<Locator | null>(null)
  const [readerPositionReady, setReaderPositionReady] = useState(false)
  const [activeProgress, setActiveProgress] = useState<ReadingProgress | null>(null)
  const [progressByBook, setProgressByBook] = useState<Record<string, ReadingProgress>>({})
  const [bookmarkPage, setBookmarkPage] = useState<number | null>(null)
  const [bookmarkMenuOpen, setBookmarkMenuOpen] = useState(false)
  const [bookmarkReminderVisible, setBookmarkReminderVisible] = useState(false)
  const [endSlipPhase, setEndSlipPhase] = useState<'open' | 'closing' | null>(null)
  const [finishingBook, setFinishingBook] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; details?: string } | null>(null)
  const [importKey, setImportKey] = useState(0)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importParsing, setImportParsing] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [preparedImport, setPreparedImport] = useState<PreparedEpubImport | null>(null)
  const [importDraft, setImportDraft] = useState<ImportDraft>(EMPTY_IMPORT_DRAFT)

  const viewportRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const reflowAnchorRef = useRef<ReflowAnchor | null>(null)
  const pageAnchorsRef = useRef<(PageAnchor | null)[]>([])
  const sentencePagesRef = useRef(new Map<string, number>())
  const resumeEligibleRef = useRef(true)
  const activeProgressRef = useRef<ReadingProgress | null>(null)
  const progressWriteRef = useRef(Promise.resolve())
  const bookTouchWriteRef = useRef(Promise.resolve())
  const importSessionRef = useRef(0)
  const longPressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef<string | null>(null)
  const bookRecencyClockRef = useRef(Math.max(
    0,
    ...Object.values(bookRecency).map((timestamp) => Date.parse(timestamp) || 0),
  ))
  /** 渲染期同步，供异步读取回来时判断「现在还在这本书上吗」。 */
  const currentBookIdRef = useRef(roomBook.id)
  currentBookIdRef.current = roomBook.id

  const userLabel = callingCard.userName.trim() || '我'
  const companionLabel = callingCard.companionName.trim() || '共读者'
  const companionSubject = callingCard.companionPronoun === 'name'
    ? companionLabel
    : callingCard.companionPronoun

  const booksState = useBooks(importKey)

  const segmentedChapters = useMemo(() => segmentChapters(readerChapters), [readerChapters])

  useEffect(() => {
    let cancelled = false
    cleanupLegacySampleData().catch((error) => console.error('清理旧示例痕迹失败', error))
    getAllReadingProgress()
      .then((records) => {
        if (cancelled) return
        setProgressByBook(Object.fromEntries(records.map((record) => [record.bookId, record])))
      })
      .catch((error) => console.error('读取阅读位置失败', error))
    return () => { cancelled = true }
  }, [])

  const loadedBooks: Book[] = useMemo(() => {
    if (booksState.status !== 'ready') return []
    return booksState.books
      .filter((domainBook) => !removedBookIds.has(domainBook.id))
      .map((domainBook) => ({
      id: domainBook.id,
      title: domainBook.title,
      englishTitle: domainBook.englishTitle ?? '',
      author: domainBook.author,
      status: bookStatusOverrides[domainBook.id] ?? domainBook.status as BookStatus,
      statusLabel: (bookStatusOverrides[domainBook.id] ?? domainBook.status) === 'reading'
        ? '在读'
        : (bookStatusOverrides[domainBook.id] ?? domainBook.status) === 'wish' ? '想读' : '已读完',
      progress: domainBook.progress,
      description: domainBook.description ?? '',
      quote: '',
      tone: domainBook.coverTone ?? 'rose',
      coverUrl: domainBook.coverUrl,
      lastOpenedAt: domainBook.lastOpenedAt,
      pinnedAt: Object.hasOwn(bookPinOverrides, domainBook.id)
        ? bookPinOverrides[domainBook.id] ?? undefined
        : domainBook.pinnedAt,
    }))
  }, [bookPinOverrides, bookStatusOverrides, booksState, removedBookIds])

  const shelfBooks: Book[] = useMemo(() => loadedBooks
    .map((book) => {
      const progress = progressByBook[book.id]
      if (!progress) return book
      return {
        ...book,
        progress: progress.totalProgress,
        lastChapter: `第 ${progress.locator.position.chapterIndex + 1} 章`,
        quote: progress.locator.position.selectedText,
      }
    })
    .sort((a, b) => {
      if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1
      const aOpened = bookRecency[a.id] ?? a.lastOpenedAt
      const bOpened = bookRecency[b.id] ?? b.lastOpenedAt
      if (aOpened === bOpened) {
        if (a.pinnedAt && b.pinnedAt && a.pinnedAt !== b.pinnedAt) {
          return b.pinnedAt.localeCompare(a.pinnedAt)
        }
        return 0
      }
      if (!aOpened) return 1
      if (!bOpened) return -1
      return bOpened.localeCompare(aOpened)
    }), [bookRecency, loadedBooks, progressByBook])

  const openableBookIds = useMemo(
    () => new Set(loadedBooks.map((book) => book.id)),
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

  /**
   * 从库里重新读出当前这本书的痕迹。
   *
   * 每次写入之后都要走一遍，不在本地拼状态：句子区间是 Locator 重新锚定出来的，
   * 本地凭选区拼出的区间和库里算出来的可能差一句（比如划线正好压在句子边界上），
   * 那样界面和数据库就开始各说各话。读一遍最慢也就是一次 IndexedDB 扫描。
   */
  const refreshTraces = useCallback(async () => {
    const bookId = roomBook.id
    const loaded = await loadTraces(bookId, readerChapters, segmentedChapters)
    // 读的过程中可能已经翻去别的书了，只有仍然停在这本书上才写回状态，
    // 否则会把上一本书的痕迹盖到新书上。
    if (currentBookIdRef.current === bookId) setTraces(loaded)
  }, [readerChapters, roomBook.id, segmentedChapters])

  useEffect(() => {
    // 章节还在加载时 readerChapters 仍是上一本书的，这时候读出来的句子区间会锚到
    // 错的正文上。等 ready 再读，界面上只是痕迹晚一帧出现。
    if (!readerChaptersReady) return
    let cancelled = false
    refreshTraces()
      .catch((error) => { if (!cancelled) console.error('读取痕迹失败', error) })
    return () => { cancelled = true }
  }, [readerChaptersReady, refreshTraces])

  /** 当前选区对应的稳定定位。写库一律用它，不用句子序号。 */
  const locatorForSelection = useCallback((selection: SentenceSelection) => (
    locatorFromSentenceRange(
      roomBook.id,
      selection.chapterIndex,
      segmentedChapters[selection.chapterIndex],
      readerChapters[selection.chapterIndex]?.paragraphs ?? [],
      selection.start,
      selection.end,
    )
  ), [readerChapters, roomBook.id, segmentedChapters])

  const currentChapterIndex = useMemo(() => {
    let active = 0
    chapterStarts.forEach((start, index) => { if (start <= pageIndex) active = index })
    return active
  }, [chapterStarts, pageIndex])

  const adoptActiveProgress = useCallback((progress: ReadingProgress | null) => {
    activeProgressRef.current = progress
    setActiveProgress(progress)
    if (progress) {
      setProgressByBook((current) => ({ ...current, [progress.bookId]: progress }))
    }
  }, [])

  const chapterIndexForPage = useCallback((targetPage: number) => {
    let chapterIndex = 0
    chapterStarts.forEach((start, index) => {
      if (start <= targetPage) chapterIndex = index
    })
    return chapterIndex
  }, [chapterStarts])

  const locatorForPage = useCallback((targetPage: number): Locator | null => {
    const mapped = pageAnchorsRef.current[targetPage]
    if (mapped) return locatorForSelection(mapped)

    // jsdom 与极少数尚未完成布局的浏览器拿不到 DOM rect；退到本章第一句，
    // 仍然保存稳定 Locator，不能退回动态页码。
    const chapterIndex = chapterIndexForPage(targetPage)
    const first = segmentedChapters[chapterIndex]?.sentences[0]
    return first ? locatorForSelection({ chapterIndex, start: first.index, end: first.index }) : null
  }, [chapterIndexForPage, locatorForSelection, segmentedChapters])

  const pageForLocator = useCallback((locator: Locator): number | null => {
    const resolved = resolveLocator(
      locator.position,
      segmentedChapters,
      readerChapters.map((chapter) => chapter.paragraphs),
    )
    if (!resolved) return null
    return sentencePagesRef.current.get(`${resolved.chapterIndex}:${resolved.start}`)
      ?? chapterStarts[resolved.chapterIndex]
      ?? null
  }, [chapterStarts, readerChapters, segmentedChapters])

  const writeProgress = useCallback((progress: ReadingProgress) => {
    adoptActiveProgress(progress)
    progressWriteRef.current = progressWriteRef.current
      .catch(() => undefined)
      .then(() => saveReadingProgress(progress))
      .catch((error) => { console.error('保存阅读位置失败', error) })
  }, [adoptActiveProgress])

  const saveResumeLocator = useCallback((locator: Locator, targetPage = pageIndex) => {
    const now = new Date().toISOString()
    const chapterIndex = chapterIndexForPage(targetPage)
    const chapterStart = chapterStarts[chapterIndex] ?? 0
    const chapterEnd = chapterStarts[chapterIndex + 1] ?? totalPages
    const chapterLength = Math.max(1, chapterEnd - chapterStart)
    const chapterProgress = Math.round(((targetPage - chapterStart + 1) / chapterLength) * 100)
    const totalProgress = Math.round(((targetPage + 1) / Math.max(1, totalPages)) * 100)
    const existing = activeProgressRef.current?.bookId === roomBook.id
      ? activeProgressRef.current
      : null
    const next = existing
      ? { ...existing, locator, chapterProgress, totalProgress, updatedAt: now }
      : createReadingProgress(roomBook.id, locator, chapterProgress, totalProgress, now)
    writeProgress(next)
  }, [chapterIndexForPage, chapterStarts, pageIndex, roomBook.id, totalPages, writeProgress])

  const saveCurrentPagePosition = useCallback(() => {
    if (!readerPositionReady || !resumeEligibleRef.current) return
    const locator = locatorForPage(pageIndex)
    if (locator) saveResumeLocator(locator, pageIndex)
  }, [locatorForPage, pageIndex, readerPositionReady, saveResumeLocator])

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

  const toggleBookPinned = async (book: Book) => {
    const pinning = !book.pinnedAt
    try {
      const updated = await setBookPinned(book.id, pinning)
      if (!updated) return
      setRoomBook((current) => current.id === book.id
        ? { ...current, pinnedAt: updated.pinnedAt }
        : current)
      setBookPinOverrides((current) => ({
        ...current,
        [book.id]: updated.pinnedAt ?? null,
      }))
      setRoomMenuOpen(false)
      setImportKey((key) => key + 1)
      showToast(pinning ? `《${book.title}》已经盖章置顶。` : `《${book.title}》已取消置顶。`)
    } catch (error) {
      showToast('这枚印章暂时没能落下', error instanceof Error ? error.message : String(error))
    }
  }

  const cancelBookLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const beginBookLongPress = (book: Book) => {
    cancelBookLongPress()
    longPressTriggeredRef.current = null
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      longPressTriggeredRef.current = book.id
      void toggleBookPinned(book)
    }, 620)
  }

  const suppressClickAfterLongPress = (bookId: string, event: React.MouseEvent) => {
    if (longPressTriggeredRef.current !== bookId) return
    event.preventDefault()
    event.stopPropagation()
    longPressTriggeredRef.current = null
  }

  const updateCallingCard = (patch: Partial<CallingCard>) => {
    setCallingCard((current) => {
      const next = { ...current, ...patch }
      writeCallingCard(next)
      return next
    })
  }

  const rememberBookOpened = (book: Book, startReading = false) => {
    bookRecencyClockRef.current = Math.max(Date.now(), bookRecencyClockRef.current + 1)
    const openedAt = new Date(bookRecencyClockRef.current).toISOString()
    const nextStatus = startReading && book.status === 'wish' ? 'reading' : undefined
    setBookRecency((current) => {
      const next = { ...current, [book.id]: openedAt }
      writeBookRecency(next)
      return next
    })
    if (nextStatus) {
      setBookStatusOverrides((current) => ({ ...current, [book.id]: nextStatus }))
    }
    bookTouchWriteRef.current = bookTouchWriteRef.current
      .then(() => touchBook(book.id, openedAt, nextStatus))
      .then(() => undefined)
      .catch((error) => console.error('记录最近打开书籍失败', error))
  }

  const openImportDialog = () => {
    importSessionRef.current += 1
    setPreparedImport(null)
    setImportDraft(EMPTY_IMPORT_DRAFT)
    setImportParsing(false)
    setImportSaving(false)
    setImportDialogOpen(true)
  }

  const closeImportDialog = () => {
    if (importSaving) return
    importSessionRef.current += 1
    setImportDialogOpen(false)
    setPreparedImport(null)
    setImportDraft(EMPTY_IMPORT_DRAFT)
    setImportParsing(false)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const session = importSessionRef.current + 1
    importSessionRef.current = session
    setImportParsing(true)
    setPreparedImport(null)

    try {
      const result = await prepareEpubFile(file)
      if (importSessionRef.current !== session) return
      if (result.ok) {
        const { prepared } = result
        setPreparedImport(prepared)
        setImportDraft({
          title: prepared.metadata.title || file.name.replace(/\.epub$/i, ''),
          englishTitle: '',
          author: prepared.metadata.author || '',
          description: prepared.metadata.description ?? '',
          tone: 'rose',
          coverUrl: prepared.embeddedCoverUrl,
        })
      } else {
        showToast(result.message, result.details)
      }
    } catch (error) {
      showToast('这本书暂时无法打开', error instanceof Error ? error.message : String(error))
    } finally {
      if (importSessionRef.current === session) setImportParsing(false)
    }
  }

  const handleCoverFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('请选择一张图片作为封面。')
      return
    }
    try {
      const coverUrl = await imageFileToDataUrl(file)
      setImportDraft((draft) => ({ ...draft, coverUrl }))
    } catch (error) {
      showToast('这张封面暂时无法使用', error instanceof Error ? error.message : String(error))
    }
  }

  const chooseGeneratedCover = (tone: BookCoverTone) => {
    setImportDraft((draft) => ({ ...draft, tone, coverUrl: undefined }))
  }

  const saveImport = async () => {
    if (!preparedImport || !importDraft.title.trim() || importSaving) return
    setImportSaving(true)
    try {
      const result = await savePreparedEpub(preparedImport, {
        title: importDraft.title,
        englishTitle: importDraft.englishTitle,
        author: importDraft.author,
        description: importDraft.description,
        coverUrl: importDraft.coverUrl,
        coverTone: importDraft.tone,
      })
      if (result.ok) {
        importSessionRef.current += 1
        setImportDialogOpen(false)
        setPreparedImport(null)
        setImportDraft(EMPTY_IMPORT_DRAFT)
        setImportKey((key) => key + 1)
        showToast('已经藏入书架。')
      } else {
        showToast(result.message, result.details)
      }
    } catch (error) {
      showToast('这本书暂时无法打开', error instanceof Error ? error.message : String(error))
    } finally {
      setImportSaving(false)
    }
  }

  const toggleShelfView = () => {
    const next = shelfView === 'list' ? 'covers' : 'list'
    setShelfView(next)
    showToast(next === 'covers' ? '已切换为封面书架。' : '已切换为列表书架。')
  }

  const copySelection = async () => {
    const copied = await copyTextToClipboard(selectedText)
    if (copied) {
      showToast('已复制。')
      clearSelection()
    } else {
      showToast('摘录没有进入剪贴板，请再试一次。')
    }
  }

  const openSidebar = useCallback(() => {
    if (sidebarCloseTimerRef.current !== null) window.clearTimeout(sidebarCloseTimerRef.current)
    sidebarCloseTimerRef.current = null
    setSidebarPhase('open')
  }, [])

  const closeSidebar = useCallback(() => {
    if (sidebarPhase !== 'open') return
    setSidebarPhase('closing')
    sidebarCloseTimerRef.current = window.setTimeout(() => {
      setSidebarPhase(null)
      sidebarCloseTimerRef.current = null
    }, 320)
  }, [sidebarPhase])

  useEffect(() => () => {
    if (sidebarCloseTimerRef.current !== null) window.clearTimeout(sidebarCloseTimerRef.current)
  }, [])

  useEffect(() => {
    if (sidebarPhase === null) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebar()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeSidebar, sidebarPhase])

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
      const nextPageAnchors: (PageAnchor | null)[] = Array.from({ length: nextTotal }, () => null)
      const nextSentencePages = new Map<string, number>()
      for (const sentence of flow.querySelectorAll<HTMLElement>('.sentence-unit[data-sentence-index]')) {
        const chapterElement = sentence.closest<HTMLElement>('[data-chapter-index]')
        const chapterIndex = Number(chapterElement?.dataset.chapterIndex)
        const sentenceIndex = Number(sentence.dataset.sentenceIndex)
        if (!Number.isInteger(chapterIndex) || !Number.isInteger(sentenceIndex)) continue
        for (const rect of sentence.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue
          const targetPage = Math.max(0, Math.min(nextTotal - 1, Math.floor((rect.left - flowRect.left + 1) / width)))
          const key = `${chapterIndex}:${sentenceIndex}`
          if (!nextSentencePages.has(key)) nextSentencePages.set(key, targetPage)
          nextPageAnchors[targetPage] ??= { chapterIndex, start: sentenceIndex, end: sentenceIndex }
        }
      }

      setTotalPages(nextTotal)
      setChapterStarts(nextStarts)
      pageAnchorsRef.current = nextPageAnchors
      sentencePagesRef.current = nextSentencePages
      const anchor = reflowAnchorRef.current
      if (anchor) {
        const start = nextStarts[anchor.chapterIndex] ?? 0
        const end = nextStarts[anchor.chapterIndex + 1] ?? nextTotal
        const length = Math.max(1, end - start)
        setPageIndex(Math.min(nextTotal - 1, start + Math.round((length - 1) * anchor.ratio)))
        reflowAnchorRef.current = null
        setReaderPositionReady(true)
      } else if (pendingLocator) {
        const resolved = pageForLocator(pendingLocator)
        const targetPage = resolved ?? nextStarts[pendingLocator.position.chapterIndex] ?? 0
        setPageIndex(targetPage)
        setPendingLocator(null)
        setReaderPositionReady(true)
        const savedBookmark = activeProgressRef.current?.bookmark?.locator
        const savedBookmarkPage = savedBookmark ? pageForLocator(savedBookmark) : null
        setBookmarkPage(savedBookmarkPage)
        setBookmarkReminderVisible(savedBookmarkPage !== null && savedBookmarkPage !== targetPage)
      } else if (pendingChapter !== null) {
        setPageIndex(nextStarts[pendingChapter] ?? 0)
        setPendingChapter(null)
        setReaderPositionReady(true)
      } else {
        setPageIndex((current) => Math.min(current, nextTotal - 1))
        setReaderPositionReady(true)
      }
    })
  }, [pageForLocator, pendingChapter, pendingLocator])

  useLayoutEffect(() => {
    if (screen !== 'reader') return
    recalculatePagination()
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(recalculatePagination)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [screen, fontSize, lineHeight, pageMargin, readerTypeface, recalculatePagination])

  useEffect(() => {
    if (screen !== 'reader' || !readerChaptersReady || !readerPositionReady) return
    // 这 120ms 只等 CSS columns 完成布局，不用停留时长猜测用户意图。
    const timer = window.setTimeout(saveCurrentPagePosition, 120)
    return () => window.clearTimeout(timer)
  }, [pageIndex, readerChaptersReady, readerPositionReady, saveCurrentPagePosition, screen])

  useEffect(() => {
    if (screen !== 'reader') return
    const flush = () => saveCurrentPagePosition()
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [saveCurrentPagePosition, screen])

  useEffect(() => {
    if (!bookmarkReminderVisible) return
    const timer = window.setTimeout(() => setBookmarkReminderVisible(false), 6000)
    return () => window.clearTimeout(timer)
  }, [bookmarkReminderVisible])

  useEffect(() => {
    const bookmark = activeProgress?.bookmark?.locator
    setBookmarkPage(bookmark ? pageForLocator(bookmark) : null)
  }, [activeProgress?.bookmark, pageForLocator])

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

  const openReader = (
    book: Book,
    target:
      | { kind: 'resume' }
      | { kind: 'chapter'; chapterIndex: number }
      | { kind: 'locator'; locator: Locator },
    rememberOpening = true,
    resetResumePosition = false,
  ) => {
    if (rememberOpening) rememberBookOpened(book, true)
    setRoomBook(book.status === 'wish' ? { ...book, status: 'reading', statusLabel: '在读' } : book)
    setRoomMenuOpen(false)
    setDeleteBookDialogOpen(false)
    setReaderChaptersReady(false)
    setReaderPositionReady(false)
    setScreen('reader')
    setChromeVisible(false)
    setPanel(null)
    setReturnPage(null)
    setBookmarkMenuOpen(false)
    setBookmarkReminderVisible(false)
    setEndSlipPhase(null)
    setPageIndex(0)
    Promise.all([
      loadBookChapters(book.id),
      getReadingProgress(book.id).catch(() => undefined),
    ])
      .then(([loadedChapters, savedProgress]) => {
        if (!loadedChapters.length) {
          setScreen('shelf')
          setReaderChaptersReady(true)
          showToast('这本书暂时无法打开', '没有从这本书里解析出可阅读的章节。')
          return
        }
        adoptActiveProgress(savedProgress ?? null)
        setReaderChapters(loadedChapters)
        // 动态分页接管前先给每章一个稳定的兜底页；测试环境、隐藏标签页或
        // 尚未取得 viewport 宽度时也能完成目录与 Locator 跳转。
        setChapterStarts(loadedChapters.map((_, index) => index))
        setTotalPages(Math.max(1, loadedChapters.length))
        if (target.kind === 'resume' && savedProgress) {
          resumeEligibleRef.current = true
          setPendingLocator(savedProgress.locator)
          setPendingChapter(null)
        } else if (target.kind === 'locator') {
          // 痕迹入口携带稳定定位，等动态分页完成后再落到原句所在页。
          // 已有阅读位置时只算临时翻看，不覆盖“上次读到”。
          resumeEligibleRef.current = !savedProgress
          setPendingLocator(target.locator)
          setPendingChapter(null)
        } else {
          // 没有旧位置时，用户选章节就是第一次开始阅读；有旧位置时才算临时翻看。
          resumeEligibleRef.current = resetResumePosition || !savedProgress
          setPendingLocator(null)
          setPendingChapter(target.kind === 'chapter' ? target.chapterIndex : 0)
        }
        setReaderChaptersReady(true)
      })
      .catch((error) => {
        setScreen('shelf')
        setReaderChaptersReady(true)
        showToast('这本书暂时无法打开', String(error))
      })
  }

  const openReaderAtResume = (book: Book = roomBook, rememberOpening = true) => (
    openReader(book, { kind: 'resume' }, rememberOpening)
  )
  const openReaderAtChapter = (chapterIndex: number, book: Book = roomBook, rememberOpening = true) => (
    openReader(book, { kind: 'chapter', chapterIndex }, rememberOpening)
  )
  const openReaderAtLocator = (locator: Locator, book: Book = roomBook, rememberOpening = true) => (
    openReader(book, { kind: 'locator', locator }, rememberOpening)
  )

  const openRoom = (book: Book, rememberOpening = true) => {
    if (rememberOpening) rememberBookOpened(book)
    setRoomBook(book)
    setRoomMenuOpen(false)
    setDeleteBookDialogOpen(false)
    setScreen('room')
    setReaderChaptersReady(false)
    adoptActiveProgress(progressByBook[book.id] ?? null)
    Promise.all([
      loadBookChapters(book.id),
      getReadingProgress(book.id).catch(() => undefined),
    ])
      .then(([loadedChapters, savedProgress]) => {
        adoptActiveProgress(savedProgress ?? null)
        setReaderChapters(loadedChapters)
        setReaderChaptersReady(true)
      })
      .catch(() => {
        setReaderChapters([])
        setReaderChaptersReady(true)
      })
  }

  const openSavedReaderRef = useRef(openReaderAtResume)
  const openSavedRoomRef = useRef(openRoom)
  openSavedReaderRef.current = openReaderAtResume
  openSavedRoomRef.current = openRoom

  useEffect(() => {
    if (lastViewRestored) return
    const saved = initialViewRef.current
    if (saved.screen === 'shelf' || !saved.bookId) {
      setLastViewRestored(true)
      return
    }
    const savedBook = shelfBooks.find((book) => book.id === saved.bookId)
    if (!savedBook) {
      if (booksState.status === 'loading') return
      setLastViewRestored(true)
      return
    }
    setLastViewRestored(true)
    if (saved.screen === 'reader') openSavedReaderRef.current(savedBook, false)
    else openSavedRoomRef.current(savedBook, false)
  }, [booksState.status, lastViewRestored, shelfBooks])

  useEffect(() => {
    if (!lastViewRestored) return
    writeLastView(screen === 'shelf'
      ? { screen: 'shelf' }
      : { screen, bookId: roomBook.id })
  }, [lastViewRestored, roomBook.id, screen])

  const turnToPage = (nextPage: number) => {
    const bounded = Math.max(0, Math.min(totalPages - 1, nextPage))
    if (bounded === pageIndex) return
    resumeEligibleRef.current = true
    setPageIndex(bounded)
    setReturnPage(null)
    setBookmarkReminderVisible(false)
    setBookmarkMenuOpen(false)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
    setEndSlipPhase(null)
    clearSelection()
  }

  const handleReaderClick = (event: React.MouseEvent<HTMLElement>) => {
    if (endSlipPhase) return
    const target = event.target as HTMLElement
    if (target.closest('button, mark, textarea, input, select')) return
    if (bookmarkMenuOpen) {
      setBookmarkMenuOpen(false)
      setChromeVisible(false)
      setPanel(null)
      return
    }
    if (sentenceSelection) {
      clearSelection()
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - rect.left) / rect.width
    if (position < 0.4) turnToPage(pageIndex - 1)
    else if (position > 0.6) {
      if (pageIndex === totalPages - 1) {
        setChromeVisible(false)
        setPanel(null)
        setBookmarkMenuOpen(false)
        setEndSlipPhase('open')
      } else turnToPage(pageIndex + 1)
    }
    else { setChromeVisible((visible) => !visible); setPanel(null) }
  }

  const saveHighlight = async () => {
    if (!selectedText || !sentenceSelection) return
    const locator = locatorForSelection(sentenceSelection)
    if (!locator) {
      showToast('这句话暂时没法留下', '没能在正文里定位到这处选区。')
      return
    }
    clearSelection()
    try {
      resumeEligibleRef.current = true
      saveResumeLocator(locator)
      await persistHighlight(locator)
      await refreshTraces()
      showToast('这句话已经留在页边。')
    } catch (error) {
      showToast('这处划线没有存下来', error instanceof Error ? error.message : String(error))
    }
  }

  /** 取消划线只删划线本身；这处如果还有批注，批注和她的回信留着。 */
  const cancelHighlight = async () => {
    if (!sentenceSelection) return
    const locator = selectedRangeTrace?.locator ?? locatorForSelection(sentenceSelection)
    if (!locator) return
    clearSelection()
    try {
      await removeHighlight(locator)
      await refreshTraces()
      showToast('已经取消这处划线。')
    } catch (error) {
      showToast('这处划线没能取消', error instanceof Error ? error.message : String(error))
    }
  }

  const openSentenceNoteSheet = () => {
    setNoteTargetTraceId(selectedRangeTrace?.id ?? null)
    setNoteTargetLocator(
      selectedRangeTrace?.locator
      ?? (sentenceSelection ? locatorForSelection(sentenceSelection) : null),
    )
    setEditingNoteId(null)
    setNoteDraft('')
    setNoteMenuTargetId(null)
    setNoteComposerOpen(true)
  }

  const closeNoteSheet = () => {
    setNoteComposerOpen(false)
    setNoteMenuTargetId(null)
    setNoteTargetTraceId(null)
    setNoteTargetLocator(null)
    setEditingNoteId(null)
    setNoteDraft('')
    clearSelection()
  }

  /**
   * 写下或改写一条批注。
   *
   * 定位有三个来源，按可靠程度取：正在写的那处痕迹自带的 locator（从痕迹详情进来时
   * 没有选区）、当前选区已有痕迹的 locator、最后才由选区现算一个。
   */
  const saveNote = async () => {
    const text = noteDraft.trim()
    if (!selectedText || !text) return

    const locator = noteTargetLocator
      ?? activeNoteTrace?.locator
      ?? selectedRangeTrace?.locator
      ?? (sentenceSelection ? locatorForSelection(sentenceSelection) : null)
    if (!locator) {
      showToast('这条批注暂时没法夹进去', '没能在正文里定位到这处选区。')
      return
    }

    const highlighted = Boolean((activeNoteTrace ?? selectedRangeTrace)?.highlighted)
    setEditingNoteId(null)
    setNoteDraft('')
    setNoteMenuTargetId(null)
    try {
      resumeEligibleRef.current = true
      saveResumeLocator(locator)
      await persistNote(locator, text, editingNoteId ?? undefined, highlighted)
      // 痕迹 id 就是定位串，所以写完之后这个 id 一定能对上重新读出来的那条痕迹。
      setNoteTargetTraceId(passageKey(locator.position))
      setNoteTargetLocator(locator)
      await refreshTraces()
      showToast('批注已经夹进这一页。')
    } catch (error) {
      showToast('这条批注没有存下来', error instanceof Error ? error.message : String(error))
    }
  }

  const reviseNote = (note: NoteEntry) => {
    setEditingNoteId(note.id)
    setNoteDraft(note.text)
    setNoteMenuTargetId(null)
  }

  const removeNote = async (noteId: string) => {
    if (editingNoteId === noteId) {
      setEditingNoteId(null)
      setNoteDraft('')
    }
    setNoteMenuTargetId(null)
    try {
      await deleteNoteRecord(noteId)
      await refreshTraces()
      showToast('这段文字已经抹去。')
    } catch (error) {
      showToast('这段文字没能抹去', error instanceof Error ? error.message : String(error))
    }
  }

  const reviseActiveTraceNote = (trace: Trace, note: NoteEntry) => {
    setSelectedText(trace.quote)
    setNoteTargetTraceId(trace.id)
    setNoteTargetLocator(trace.locator ?? null)
    setEditingNoteId(note.id)
    setNoteDraft(note.text)
    setNoteMenuTargetId(null)
    setActiveTrace(null)
    setNoteComposerOpen(true)
  }

  const removeActiveTraceNote = async (noteId: string) => {
    setActiveTrace(null)
    await removeNote(noteId)
  }

  const jumpToChapter = (chapterIndex: number) => {
    if (returnPage === null) setReturnPage(pageIndex)
    resumeEligibleRef.current = false
    setPageIndex(chapterStarts[chapterIndex] ?? 0)
    setBookmarkReminderVisible(false)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
  }

  const jumpToTrace = (trace: Trace) => {
    if (!trace.locator || trace.drifted) {
      jumpToChapter(trace.chapterIndex)
      return
    }
    if (returnPage === null) setReturnPage(pageIndex)
    resumeEligibleRef.current = false
    setPageIndex(pageForLocator(trace.locator) ?? chapterStarts[trace.chapterIndex] ?? 0)
    setBookmarkReminderVisible(false)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
    clearSelection()
  }

  const currentProgress = activeProgress?.bookId === roomBook.id
    ? activeProgress
    : progressByBook[roomBook.id] ?? null
  const currentBookmark = currentProgress?.bookmark
  const bookmarkIsOnCurrentPage = bookmarkPage !== null && bookmarkPage === pageIndex

  const moveBookmarkHere = () => {
    const locator = locatorForPage(pageIndex)
    if (!locator) {
      showToast('这一页暂时没法折起来。')
      return
    }
    resumeEligibleRef.current = true
    saveResumeLocator(locator, pageIndex)
    const resumed = activeProgressRef.current
    if (!resumed) return
    const next = moveReadingBookmark(resumed, locator)
    writeProgress(next)
    setBookmarkPage(pageIndex)
    setBookmarkMenuOpen(false)
    setBookmarkReminderVisible(false)
    showToast(currentBookmark ? '折页已经移到这里。' : '这一页已经折好。')
  }

  const removeBookmark = () => {
    const progress = activeProgressRef.current
    if (!progress?.bookmark) return
    writeProgress(removeReadingBookmark(progress))
    setBookmarkPage(null)
    setBookmarkMenuOpen(false)
    setBookmarkReminderVisible(false)
    showToast('折页已经展平。')
  }

  const returnToBookmark = () => {
    const locator = activeProgressRef.current?.bookmark?.locator
    const targetPage = bookmarkPage ?? (locator ? pageForLocator(locator) : null)
    if (targetPage === null) {
      showToast('这枚折页暂时找不到原来的句子。')
      return
    }
    if (returnPage === null) setReturnPage(pageIndex)
    resumeEligibleRef.current = false
    setPageIndex(targetPage)
    setBookmarkPage(targetPage)
    setBookmarkMenuOpen(false)
    setBookmarkReminderVisible(false)
    setPanel(null)
    setChromeVisible(false)
    clearSelection()
  }

  const handleBookmarkButton = () => {
    if (!currentBookmark) {
      moveBookmarkHere()
      return
    }
    setBookmarkMenuOpen((open) => !open)
  }

  const updateRoomBookStatus = (status: BookStatus) => {
    const statusLabel = status === 'finished' ? '已读完' : status === 'wish' ? '想读' : '在读'
    setBookStatusOverrides((current) => ({ ...current, [roomBook.id]: status }))
    setRoomBook((current) => ({ ...current, status, statusLabel }))
  }

  const markRoomBookFinished = async () => {
    setRoomMenuOpen(false)
    try {
      await setBookStatus(roomBook.id, 'finished')
      updateRoomBookStatus('finished')
      showToast('已经收进「已读完」。')
    } catch (error) {
      showToast('这本书暂时没能收好', error instanceof Error ? error.message : String(error))
    }
  }

  const restartRoomBook = async () => {
    setRoomMenuOpen(false)
    try {
      await setBookStatus(roomBook.id, 'reading')
      const restarted = { ...roomBook, status: 'reading' as const, statusLabel: '在读' }
      setBookStatusOverrides((current) => ({ ...current, [roomBook.id]: 'reading' }))
      setRoomBook(restarted)
      openReader(restarted, { kind: 'chapter', chapterIndex: 0 }, true, true)
    } catch (error) {
      showToast('这本书暂时没能重新翻开', error instanceof Error ? error.message : String(error))
    }
  }

  const dismissEndSlip = () => {
    setEndSlipPhase('closing')
    window.setTimeout(() => setEndSlipPhase(null), 320)
  }

  const confirmEndOfBook = async () => {
    if (finishingBook) return
    setFinishingBook(true)
    saveCurrentPagePosition()
    try {
      await progressWriteRef.current
      await setBookStatus(roomBook.id, 'finished')
      updateRoomBookStatus('finished')
      setEndSlipPhase('closing')
      window.setTimeout(() => {
        setEndSlipPhase(null)
        setFinishingBook(false)
        setScreen('room')
        showToast('已经收好。')
      }, 520)
    } catch (error) {
      setFinishingBook(false)
      setEndSlipPhase(null)
      showToast('这本书暂时没能收好', error instanceof Error ? error.message : String(error))
    }
  }

  const confirmDeleteRoomBook = async () => {
    if (deletingBook) return
    const bookId = roomBook.id
    const bookTitle = roomBook.title
    setDeletingBook(true)
    try {
      await bookTouchWriteRef.current
      await deleteBookCompletely(bookId)
      setRemovedBookIds((current) => new Set(current).add(bookId))
      setBookRecency((current) => {
        const next = { ...current }
        delete next[bookId]
        writeBookRecency(next)
        return next
      })
      setProgressByBook((current) => {
        const next = { ...current }
        delete next[bookId]
        return next
      })
      setTraces((current) => current.filter((trace) => trace.bookId !== bookId))
      setActiveProgress(null)
      activeProgressRef.current = null
      setDeleteBookDialogOpen(false)
      setRoomMenuOpen(false)
      setScreen('shelf')
      writeLastView({ screen: 'shelf' })
      setImportKey((key) => key + 1)
      showToast(`《${bookTitle}》已经移出书房。`)
    } catch (error) {
      showToast('这本书暂时没能移出', error instanceof Error ? error.message : String(error))
    } finally {
      setDeletingBook(false)
    }
  }

  /**
   * 用原文反查定位。
   *
   * 示例书正文里预置的那句 highlight 没有对应的痕迹记录，但从它写下的批注也得能落库，
   * 所以按文字找到所在句子，再走和手动划线完全相同的那条 Locator 构造路径。
   */
  const locatorForQuote = (chapterIndex: number, quote: string): Locator | null => {
    const segmented = segmentedChapters[chapterIndex]
    if (!segmented) return null
    const run = segmented.sentences.find((sentence) => sentence.text.includes(quote))
    return run ? locatorForSelection({ chapterIndex, start: run.index, end: run.index }) : null
  }

  const openExistingTrace = (chapterIndex: number, quote: string) => {
    const trace = bookTraces.find((item) => item.chapterIndex === chapterIndex)
    setActiveTrace(trace ?? {
      id: `preview-${chapterIndex}`,
      bookId: roomBook.id,
      chapterIndex,
      chapter: `${readerChapters[chapterIndex].chapter} · ${readerChapters[chapterIndex].title}`,
      quote,
      locator: locatorForQuote(chapterIndex, quote) ?? undefined,
    })
    setNoteMenuTargetId(null)
    setPanel(null)
    setChromeVisible(false)
  }

  if (screen === 'room') {
    const hasChapters = readerChaptersReady && readerChapters.length > 0
    const roomBookDeletable = loadedBooks.some((book) => book.id === roomBook.id)
    const resumeChapterIndex = currentProgress?.locator.position.chapterIndex
    const resumeChapter = resumeChapterIndex === undefined
      ? undefined
      : readerChapters[resumeChapterIndex]?.chapter ?? `第 ${resumeChapterIndex + 1} 章`
    const resumeQuote = currentProgress?.locator.position.selectedText
    return (
      <main className="room-shell">
        <BrandHeader
          onBack={() => { setRoomMenuOpen(false); setScreen('shelf') }}
          onOpenBookMenu={roomBookDeletable ? () => setRoomMenuOpen((open) => !open) : undefined}
          bookMenuOpen={roomMenuOpen}
        />
        {roomMenuOpen && roomBookDeletable && (
          <>
            <button className="room-book-menu-dismiss" type="button" aria-label="收起书籍操作" onClick={() => setRoomMenuOpen(false)} />
            <div className="room-book-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void toggleBookPinned(roomBook)}>
                <Pin />{roomBook.pinnedAt ? '取消置顶' : '置顶这本书'}
              </button>
              <button type="button" role="menuitem" onClick={() => { void (roomBook.status === 'finished' ? restartRoomBook() : markRoomBookFinished()) }}>
                {roomBook.status === 'finished' ? <CornerUpLeft /> : <Check />}
                {roomBook.status === 'finished' ? '从头重温' : '标记读完'}
              </button>
              <button type="button" role="menuitem" onClick={() => { setRoomMenuOpen(false); setDeleteBookDialogOpen(true) }}>
                <Trash2 />移出书房
              </button>
            </div>
          </>
        )}
        <section className="room-hero">
          <BookCover book={roomBook} large />
          <div className="room-book-info">
            <h1>{roomBook.title}</h1>
            <em>{roomBook.englishTitle}</em>
            <p className="room-author">{roomBook.author}</p>
            <button className="room-description-preview" type="button" onClick={() => setDescriptionOpen(true)} aria-haspopup="dialog">
              <span>{roomBook.description}</span>
            </button>
          </div>
        </section>
        <section className="room-details">
          <button className="room-recent" type="button" onClick={() => hasChapters && openReaderAtResume()}>
            <BookOpenText /><small>{resumeChapter ? `上次读到 · ${resumeChapter}` : '尚未开始阅读'}</small>
            <q>{resumeQuote || '这本书还在等待第一次翻开。'}</q>
            <span>{hasChapters ? (currentProgress ? '从这里继续' : '从头开始读') : '尚无阅读位置'} <ChevronRight /></span>
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
                        <button
                          type="button"
                          key={trace.id}
                          onClick={() => trace.locator && !trace.drifted
                            ? openReaderAtLocator(trace.locator)
                            : openReaderAtChapter(index)}
                        >
                          <q><span className={traceLineClass(trace)}>{trace.quote}</span></q>
                          {trace.foxNotes?.map((note) => <p key={note.id}><b>{userLabel}</b>：{note.text}</p>)}
                          {trace.fish && <p className="fish-note"><b>{companionLabel}</b>：{trace.fish}</p>}
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
        {deleteBookDialogOpen && (
          <div className="delete-book-backdrop" onClick={() => { if (!deletingBook) setDeleteBookDialogOpen(false) }}>
            <section className="delete-book-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-book-title" onClick={(event) => event.stopPropagation()}>
              <small>REMOVE FROM THE LIBRARY</small>
              <h2 id="delete-book-title">移出《{roomBook.title}》？</h2>
              <p>EPUB、阅读位置、折页、划线、批注和页边文字都会从这间本地书房中抹去。</p>
              <div>
                <button type="button" onClick={() => setDeleteBookDialogOpen(false)} disabled={deletingBook}>先留下</button>
                <button className="confirm-delete-book" type="button" onClick={() => { void confirmDeleteRoomBook() }} disabled={deletingBook}>
                  {deletingBook ? '正在移出…' : '确认移出'}
                </button>
              </div>
            </section>
          </div>
        )}
        <Toast toast={toast} onClose={clearToast} />
      </main>
    )
  }

  if (screen === 'reader') {
    const currentChapter = readerChapters[currentChapterIndex] ?? {
      chapter: '',
      title: '',
      kicker: '',
      paragraphs: [],
    }
    return (
      <main className={`reader-shell reader-${theme}`}>
        {!readerChaptersReady && (
          <div className="reader-loading" aria-label="正在打开书籍" aria-live="polite">
            <span>正在打开…</span>
          </div>
        )}
        <header className={`reader-topbar ${chromeVisible ? 'is-visible' : ''}`}>
          <button className="icon-button back-button" type="button" onClick={() => { saveCurrentPagePosition(); setScreen('shelf') }} aria-label="返回书架"><ArrowLeft size={19} /><span>书架</span></button>
          <div className="reader-location"><span>{roomBook.title}</span></div>
          <button
            className={`reader-bookmark-button ${currentBookmark ? 'has-bookmark' : ''} ${bookmarkIsOnCurrentPage ? 'is-current' : ''}`}
            type="button"
            onClick={handleBookmarkButton}
            aria-label={currentBookmark ? '打开折页' : '在这里折页'}
            title={currentBookmark ? '折页' : '在这里折页'}
          >
            <Bookmark />
          </button>
        </header>

        {bookmarkMenuOpen && currentBookmark && (
          <section className="bookmark-menu" aria-label="折页">
            <small>原折 · 第 {currentBookmark.locator.position.chapterIndex + 1} 章</small>
            <q>{currentBookmark.locator.position.selectedText}</q>
            <div>
              {!bookmarkIsOnCurrentPage && <button type="button" onClick={returnToBookmark}>回到原折</button>}
              {!bookmarkIsOnCurrentPage && <button type="button" onClick={moveBookmarkHere}>移折至此</button>}
              <button type="button" onClick={removeBookmark}>取消折页</button>
            </div>
          </section>
        )}

        <article
          className={`reader-page reader-page-v2 ${endSlipPhase ? 'is-at-ending' : ''}`}
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

        {endSlipPhase && (
          <section className={`end-paper-slip ${endSlipPhase === 'closing' ? 'is-closing' : ''}`} aria-labelledby="end-paper-title">
            <small>THE END</small>
            <h2 id="end-paper-title">读到这里了</h2>
            <p>要把这本书收进「已读完」吗？</p>
            <div>
              <button type="button" onClick={() => { void confirmEndOfBook() }} disabled={finishingBook}>收进已读完</button>
              <button type="button" onClick={dismissEndSlip} disabled={finishingBook}>再停一会</button>
            </div>
          </section>
        )}

        {returnPage !== null && <button className="return-slip" type="button" onClick={() => { resumeEligibleRef.current = true; setPageIndex(returnPage); setReturnPage(null); setBookmarkReminderVisible(false) }}><CornerUpLeft />回到刚才的位置</button>}
        {bookmarkReminderVisible && currentBookmark && (
          <button className="bookmark-reminder" type="button" onClick={returnToBookmark}>
            <Bookmark />折页还在第 {currentBookmark.locator.position.chapterIndex + 1} 章 · 回去看看
          </button>
        )}

        {activeTrace && (
          <div className="trace-detail-backdrop" onClick={() => { setActiveTrace(null); setNoteMenuTargetId(null) }}>
            <section
              className="trace-detail-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="划线详情"
              onClick={(event) => {
                event.stopPropagation()
                if (noteMenuTargetId) setNoteMenuTargetId(null)
              }}
              style={{ '--trace-font-family': `var(--font-reading-${readerTypeface})` } as React.CSSProperties}
            >
              <blockquote>“<span className={traceLineClass(activeTrace)}>{activeTrace.quote}</span>”</blockquote>
              {activeTrace.foxNotes?.length ? activeTrace.foxNotes.map((note) => <div className="trace-note-block" key={note.id}>
                <div className="trace-note-meta"><b>{userLabel}</b><time>{note.createdAt}</time><span className="note-menu-anchor"><button type="button" aria-label={`批注操作 ${note.createdAt}`} onClick={() => setNoteMenuTargetId((current) => current === note.id ? null : note.id)}><SquarePen aria-hidden="true" /></button>{noteMenuTargetId === note.id && <span className="note-action-menu trace-note-menu"><button type="button" onClick={() => reviseActiveTraceNote(activeTrace, note)}>修订</button><button type="button" onClick={() => removeActiveTraceNote(note.id)}>抹去文字</button></span>}</span></div>
                <p>{note.text}</p>
              </div>) : <button className="empty-note" type="button" onClick={() => { setSelectedText(activeTrace.quote); setNoteTargetTraceId(activeTrace.id); setNoteTargetLocator(activeTrace.locator ?? null); setEditingNoteId(null); setNoteDraft(''); setNoteMenuTargetId(null); setActiveTrace(null); setNoteComposerOpen(true) }}>这里还没有文字。留下一道痕迹</button>}
              {activeTrace.fish && <div className="trace-note-block fish-detail"><div className="trace-note-meta"><b>{companionLabel}</b><time>{activeTrace.fishAt}</time></div><p>{activeTrace.fish}</p></div>}
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
            <button type="button" onClick={() => { void copySelection() }}><Copy />摘录</button>
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
              onClick={(event) => {
                event.stopPropagation()
                if (noteMenuTargetId) setNoteMenuTargetId(null)
              }}
              style={{ '--trace-font-family': `var(--font-reading-${readerTypeface})` } as React.CSSProperties}
            >
              <div className="note-quote">“<span className={noteQuoteLineClass}>{selectedText}</span>”</div>
              {noteEntries.map((note) => <article className="sent-note" key={note.id}>
                <div className="sent-note-heading"><b>{userLabel}</b><time>{note.createdAt}</time><span className="note-menu-anchor"><button type="button" aria-label={`批注操作 ${note.createdAt}`} onClick={() => setNoteMenuTargetId((current) => current === note.id ? null : note.id)}><SquarePen aria-hidden="true" /></button>{noteMenuTargetId === note.id && <span className="note-action-menu"><button type="button" onClick={() => reviseNote(note)}>修订</button><button type="button" onClick={() => removeNote(note.id)}>抹去文字</button></span>}</span></div>
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
            {panel === 'traces' && <><PanelHeading eyebrow="MARGINALIA" title="页边痕迹" close={() => setPanel(null)} /><div className="trace-list">{bookTraces.length === 0 ? <p className="panel-empty">这本书还没有留下痕迹。</p> : [...bookTraces].reverse().map((trace) => <button type="button" key={trace.id} onClick={() => jumpToTrace(trace)}><small>{trace.chapter}</small><blockquote>“<span className={traceLineClass(trace)}>{trace.quote}</span>”</blockquote>{trace.foxNotes?.map((note) => <p key={note.id}><b>{userLabel}</b>：{note.text}</p>)}{trace.fish && <p className="fish-note"><b>{companionLabel}</b>：{trace.fish}</p>}</button>)}</div></>}
            {panel === 'stats' && <><PanelHeading eyebrow="READING LIFE" title="阅读统计" close={() => setPanel(null)} /><div className="stats-grid stats-grid-v2"><div><strong>{Math.round(((pageIndex + 1) / totalPages) * 100)}<sup>%</sup></strong><small>当前所在位置</small></div><div><strong>{currentChapterIndex + 1} / {readerChapters.length} 章</strong><small>当前章节</small></div><div><strong>{bookTraces.length} 条</strong><small>笔记与划线</small></div></div></>}
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
      {drawerPage && drawerPage !== 'shelf'
        ? <DrawerPageHeader section={drawerPage} onOpenSidebar={openSidebar} />
        : <BrandHeader shelfView={shelfView} onToggleView={toggleShelfView} onOpenSidebar={openSidebar} onOpenImport={openImportDialog} />}
      {!drawerPage && importDialogOpen && (
        <div className="import-dialog-backdrop" onClick={closeImportDialog}>
          <section
            className="import-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="import-dialog-heading">
              <div><small>ADD TO THE LIBRARY</small><h2 id="import-dialog-title">藏入书籍</h2></div>
              <button type="button" onClick={closeImportDialog} aria-label="关闭藏书弹窗"><X /></button>
            </header>

            <label className={`import-file-drop ${preparedImport ? 'has-file' : ''}`}>
              <span className="import-file-plus">{importParsing ? <span className="import-spinner" /> : <Plus />}</span>
              <span>
                <b>{importParsing ? '正在拆封…' : preparedImport ? preparedImport.file.name : '选择一本 EPUB'}</b>
                <small>{preparedImport ? `${preparedImport.chapters.length} 个章节 · 点击可换一本` : '书名、作者与简介会自动带入'}</small>
              </span>
              <input
                type="file"
                accept=".epub,application/epub+zip"
                aria-label="选择 EPUB 文件"
                onChange={handleFileChange}
                disabled={importParsing || importSaving}
              />
            </label>

            <div className={`import-editor ${preparedImport ? 'is-ready' : ''}`}>
              <div className="import-fields">
                <label><span>书名</span><input value={importDraft.title} disabled={!preparedImport} onChange={(event) => setImportDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
                <label><span>英文名 <small>可留空</small></span><input value={importDraft.englishTitle} disabled={!preparedImport} onChange={(event) => setImportDraft((draft) => ({ ...draft, englishTitle: event.target.value }))} /></label>
                <label><span>作者</span><input value={importDraft.author} disabled={!preparedImport} onChange={(event) => setImportDraft((draft) => ({ ...draft, author: event.target.value }))} /></label>
                <label className="import-description-field"><span>简介 <small>可留空</small></span><textarea value={importDraft.description} disabled={!preparedImport} onChange={(event) => setImportDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              </div>

              <section className="import-cover-controls" aria-labelledby="import-cover-title">
                <div className="import-section-heading"><span id="import-cover-title">书籍封面</span><small>可随时替换</small></div>
                <div className="import-cover-actions">
                  <label className="import-image-button">
                    <ImagePlus /><span>导入图片</span>
                    <input type="file" accept="image/*" aria-label="导入封面图片" onChange={handleCoverFileChange} disabled={!preparedImport || importSaving} />
                  </label>
                  {preparedImport?.embeddedCoverUrl && (
                    <button type="button" onClick={() => setImportDraft((draft) => ({ ...draft, coverUrl: preparedImport.embeddedCoverUrl }))}>
                      <Upload />书内封面
                    </button>
                  )}
                </div>
                <div className="import-tone-row" aria-label="Marginalia 内部封面颜色">
                  <small>MG 内部封面</small>
                  <div>
                    {COVER_TONES.map((tone) => (
                      <button
                        type="button"
                        key={tone.id}
                        className={`tone-${tone.id} ${!importDraft.coverUrl && importDraft.tone === tone.id ? 'is-selected' : ''}`}
                        onClick={() => chooseGeneratedCover(tone.id)}
                        aria-label={`选择${tone.label}封面`}
                        aria-pressed={!importDraft.coverUrl && importDraft.tone === tone.id}
                        disabled={!preparedImport}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <section className="import-preview" aria-label="书籍预览">
              <small>PREVIEW</small>
              <div className="import-preview-book">
                <BookCover book={{
                  id: 'import-preview',
                  title: importDraft.title || '未题名',
                  englishTitle: importDraft.englishTitle,
                  author: importDraft.author || '未知作者',
                  description: importDraft.description,
                  status: 'wish',
                  statusLabel: '想读',
                  progress: 0,
                  quote: '',
                  tone: importDraft.tone,
                  coverUrl: importDraft.coverUrl,
                }} />
                <div>
                  <span>想读</span>
                  <strong>{importDraft.title || '等待一本书'}</strong>
                  {importDraft.englishTitle && <em>{importDraft.englishTitle}</em>}
                  <small>{importDraft.author || '作者会出现在这里'}</small>
                  <p>{importDraft.description || '简介会和这本书一起留在书架。'}</p>
                </div>
              </div>
            </section>

            <footer className="import-dialog-actions">
              <button type="button" onClick={closeImportDialog} disabled={importSaving}>暂不藏入</button>
              <button className="save-import" type="button" onClick={() => { void saveImport() }} disabled={!preparedImport || !importDraft.title.trim() || importParsing || importSaving}>
                {importSaving ? '正在藏入…' : '藏入书架'}
              </button>
            </footer>
          </section>
        </div>
      )}
      {sidebarPhase && (
        <>
          <button className={`shelf-sidebar-backdrop ${sidebarPhase === 'closing' ? 'is-closing' : ''}`} type="button" onClick={closeSidebar} aria-label="关闭侧边栏" />
          <aside className={`shelf-sidebar ${sidebarPhase === 'closing' ? 'is-closing' : ''}`} aria-label="侧边栏">
            <header className="sidebar-heading">
              <div><small>MARGINALIA</small><h2>目录</h2></div>
            </header>
            <nav className="drawer-index" aria-label="书房抽屉">
              <h3><span>书房</span><small>THE READING ROOM</small></h3>
              {([
                ['shelf', '书架', '全部藏书', <BookOpenText key="shelf" />],
                ['thoughts', '念头', '一处私人写作区', <Feather key="thoughts" />],
                ['visits', '来访', `${companionLabel}的活动记录`, <Fish key="visits" />],
              ] as const).map(([id, title, description, icon]) => (
                <button
                  type="button"
                  key={id}
                  className={sidebarSection === id ? 'is-active' : ''}
                  aria-pressed={sidebarSection === id}
                  onClick={() => { setSidebarSection(id); setDrawerPage(id === 'shelf' ? null : id); closeSidebar() }}
                >
                  {icon}<span><strong>{title}</strong><small>{description}</small></span><ChevronRight />
                </button>
              ))}
              <h3><span>抽屉</span><small>THE DRAWER</small></h3>
              {([
                ['calling-card', '名帖', '称呼与落款', <SquarePen key="calling-card" />],
                ['shadow-books', '影子书', '微信读书旧痕迹', <LibraryBig key="shadow-books" />],
                ['cloud', '云端书房', '同步、备份与数据', <Cloud key="cloud" />],
              ] as const).map(([id, title, description, icon]) => (
                <button
                  type="button"
                  key={id}
                  className={sidebarSection === id ? 'is-active' : ''}
                  aria-pressed={sidebarSection === id}
                  onClick={() => { setSidebarSection(id); setDrawerPage(id); closeSidebar() }}
                >
                  {icon}<span><strong>{title}</strong><small>{description}</small></span><ChevronRight />
                </button>
              ))}
            </nav>
          </aside>
        </>
      )}
      {drawerPage ? <section className="drawer-page" aria-live="polite">
        {sidebarSection === 'calling-card' ? <section className="calling-card drawer-panel" aria-label="名帖设置">
              <label>
                <span>我的落款</span>
                <input aria-label="我的落款" value={callingCard.userName} onChange={(event) => updateCallingCard({ userName: event.target.value })} />
                <small>写批注时，文字会署上这个名字。</small>
              </label>
              <label>
                <span>共读者的名字</span>
                <input aria-label="共读者的名字" value={callingCard.companionName} onChange={(event) => updateCallingCard({ companionName: event.target.value })} />
              </label>
              <label>
                <span>如何称呼共读者</span>
                <select aria-label="如何称呼共读者" value={callingCard.companionPronoun} onChange={(event) => updateCallingCard({ companionPronoun: event.target.value as CompanionPronoun })}>
                  <option value="她">她</option>
                  <option value="他">他</option>
                  <option value="TA">TA</option>
                  <option value="name">只使用名字</option>
                </select>
              </label>
              <div className="calling-card-preview">
                <span>{companionLabel}</span>
                <p>{companionSubject}来过时，留下的文字会以这个名字落款。</p>
              </div>
            </section> : (
              <section className="drawer-placeholder drawer-panel" aria-live="polite">
                <p>
                  {sidebarSection === 'thoughts' && '以后可以在这里写下不依附于某一本书的文字。'}
                  {sidebarSection === 'visits' && `${companionLabel}进入书房、翻过书页或留下文字的踪迹，会安静地收在这里。`}
                  {sidebarSection === 'shadow-books' && '从微信读书带回的旧划线与想法，会先以影子书的方式留在这里。'}
                  {sidebarSection === 'cloud' && '跨设备同步、书房备份与 Supabase 连接状态，将在这里统一照看。'}
                </p>
                <span>这只抽屉已经留好位置，尚未启用。</span>
              </section>
            )}
      </section> : <>
      <nav className="shelf-filters" aria-label="书架分类">
        {filters.map((item) => {
          const count = item.id === 'all' ? shelfBooks.length : shelfBooks.filter((book) => book.status === item.id).length
          return <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)} aria-label={`${item.label}，${count} 本`} aria-pressed={filter === item.id}><span>{item.label}</span></button>
        })}
      </nav>
      {shelfView === 'list' ? (
        <section className="book-list" aria-label="书籍列表">
          {booksState.status !== 'ready' && (
            <div className="shelf-empty is-loading" role="status">
              <small>ARRANGING THE SHELVES</small>
              <h2>正在整理书架…</h2>
            </div>
          )}
          {booksState.status === 'ready' && filteredBooks.length === 0 && (
            <div className={`shelf-empty ${shelfBooks.length ? '' : 'is-pristine'}`}>
              {shelfBooks.length > 0 && <p>其他分类里或许还有正在等待的书。</p>}
              <button type="button" onClick={shelfBooks.length ? () => setFilter('all') : openImportDialog}>
                {shelfBooks.length ? '回到全部藏书' : '藏入第一本书'} <ChevronRight />
              </button>
            </div>
          )}
          {filteredBooks.map((book) => (
            <article
              className={`book-row book-row-v2 ${book.pinnedAt ? 'is-pinned' : ''}`}
              key={book.id}
              onPointerDown={() => beginBookLongPress(book)}
              onPointerUp={cancelBookLongPress}
              onPointerCancel={cancelBookLongPress}
              onPointerMove={cancelBookLongPress}
              onPointerLeave={cancelBookLongPress}
              onClickCapture={(event) => suppressClickAfterLongPress(book.id, event)}
            >
              <button className="book-cover-button" type="button" onClick={() => openRoom(book)} aria-label={`查看《${book.title}》的书籍档案`}><BookCover book={book} /><small>查看书籍档案</small></button>
              <button className="book-main book-main-button" type="button" onClick={() => { if (openableBookIds.has(book.id)) openReaderAtResume(book); else { setRoomBook(book); showToast('这本书还没有拆封。') } }} aria-label={`${book.lastChapter ? '继续阅读' : '打开'}《${book.title}》`}>
                <span className="book-state">{book.statusLabel}</span><strong>{book.title}</strong><em>{book.englishTitle}</em><span className="book-author">{book.author}</span><span className="book-description">{book.description}</span><span className="open-book">{book.lastChapter ? '继续阅读' : '翻开看看'} <ChevronRight /></span>
              </button>
              <button className="book-trace book-trace-button" type="button" onClick={() => { if (openableBookIds.has(book.id)) openReaderAtResume(book); else { setRoomBook(book); showToast('这里还没有阅读痕迹。') } }} aria-label={`查看《${book.title}》上次读到的位置`}>
                {book.pinnedAt && <PinnedBookSeal />}
                <BookOpenText /><small>{book.lastChapter ? `上次读到 · ${book.lastChapter}` : '尚未开始阅读'}</small>
                <q>{book.lastChapter ? book.quote : '这本书还在等待第一次翻开。'}</q>
                <span>{book.lastChapter ? '回到这句话' : '翻开看看'} <ChevronRight /></span>
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="book-grid" aria-label="封面书架">
          {booksState.status !== 'ready' && (
            <div className="shelf-empty is-loading" role="status">
              <small>ARRANGING THE SHELVES</small>
              <h2>正在整理书架…</h2>
            </div>
          )}
          {booksState.status === 'ready' && filteredBooks.length === 0 && (
            <div className={`shelf-empty ${shelfBooks.length ? '' : 'is-pristine'}`}>
              {shelfBooks.length > 0 && <p>其他分类里或许还有正在等待的书。</p>}
              <button type="button" onClick={shelfBooks.length ? () => setFilter('all') : openImportDialog}>
                {shelfBooks.length ? '回到全部藏书' : '藏入第一本书'} <ChevronRight />
              </button>
            </div>
          )}
          {filteredBooks.map((book) => (
            <button
              className={`grid-cover-button ${book.pinnedAt ? 'is-pinned' : ''}`}
              type="button"
              key={book.id}
              onPointerDown={() => beginBookLongPress(book)}
              onPointerUp={cancelBookLongPress}
              onPointerCancel={cancelBookLongPress}
              onPointerMove={cancelBookLongPress}
              onPointerLeave={cancelBookLongPress}
              onClick={(event) => {
                if (longPressTriggeredRef.current === book.id) {
                  longPressTriggeredRef.current = null
                  event.preventDefault()
                  return
                }
                openRoom(book)
              }}
              aria-label={`查看《${book.title}》的书籍档案`}
            >
              <BookCover book={book} />
            </button>
          ))}
        </section>
      )}
      </>}
      {!drawerPage && <footer className="shelf-footer"><span>Outside the text, we meet.</span></footer>}
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
