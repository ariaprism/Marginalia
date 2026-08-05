import { ArrowLeft, MoreHorizontal, Plus } from 'lucide-react'
import { coverTitleLines } from './coverTitle'
import type { ShelfBook, ShelfView } from './viewModel'

function catalogueIndexFor(book: ShelfBook) {
  let hash = 0
  for (const char of book.id) hash = (hash * 31 + char.charCodeAt(0)) % 89
  return 1 + hash
}

export function BookCover({ book, large = false }: { book: ShelfBook; large?: boolean }) {
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

export function SidebarMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="shelf-menu-button" type="button" onClick={onOpen} aria-label="打开侧边栏" title="打开侧边栏">
      <span className="shelf-menu-mark" aria-hidden="true">
        <i className="shelf-menu-leaf" />
        <i className="shelf-menu-pull" />
      </span>
    </button>
  )
}

function ImportBookControl({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="import-book" type="button" onClick={onOpen}>
      <Plus size={18} strokeWidth={1.5} aria-hidden="true" />
      <span>藏入书籍</span>
    </button>
  )
}

export function BrandHeader({
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

export function PinnedBookSeal() {
  return (
    <span className="pinned-book-seal" aria-hidden="true">
      <span className="seal-curve seal-curve-outer" />
      <span className="seal-curve seal-curve-inner" />
      <i>M</i>
    </span>
  )
}

export function ChapterTraceMark() {
  return (
    <svg className="chapter-trace-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.1 2.8c3.6.2 7.3-.2 11.1 0 .9 0 1.5.6 1.5 1.5-.2 5.1.2 10.2 0 15.4 0 .9-.6 1.5-1.5 1.5-3.7-.2-7.4.2-11.1 0-.9 0-1.5-.6-1.5-1.5.2-5.2-.2-10.3 0-15.4 0-.9.6-1.5 1.5-1.5Z" />
      <path d="M7.7 7.1c2.1-.3 4.1.3 6.4-.1M7.5 10.5c3 .4 5.3-.4 8.8.1M7.8 13.8c1.7-.2 3.1.3 4.8 0" />
    </svg>
  )
}
