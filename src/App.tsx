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
  Underline,
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
import './App.css'

type ShelfFilter = 'all' | 'reading' | 'wish' | 'finished'
type ReaderPanel = 'toc' | 'traces' | 'stats' | 'type' | null
type ReaderTheme = 'day' | 'night'
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
  chapterIndex: number
  chapter: string
  quote: string
  fox?: string
  fish?: string
}

type ReflowAnchor = { chapterIndex: number; ratio: number }

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

const chapters = [
  {
    chapter: '第一章',
    title: '雨先抵达',
    kicker: 'The rain arrived first',
    paragraphs: [
      '灯亮起来以前，书房先听见了雨。它从屋檐最北边的一片瓦开始，沿着看不见的坡度慢慢走下来，敲过窗框，最后停在门前那块颜色较深的木头上。',
      '那时城里的人都已习惯把没有说完的话留在亮着的屏幕里。只有这间书房仍旧相信，句子需要重量：一张纸的重量，一滴墨水的重量，或者一个人把书合上以后，手掌在封面上多停留片刻的重量。',
      '守书人把最后一盏灯调暗。他知道今晚会有人来，因为靠窗第三排的书，刚刚无风地向外挪了一寸。',
    ],
    highlight: '句子需要重量',
  },
  {
    chapter: '第二章',
    title: '没有寄出的页码',
    kicker: 'Pages without an address',
    paragraphs: [
      '女孩是在十一点四十分推门进来的。她的伞骨折了一根，雨水顺着袖口落下来，在地板上留下六枚深色的圆点。',
      '“我想找一本书，”她说，“但我不知道书名。”',
      '守书人没有问作者，也没有问故事。他只是从柜台下面取出一只黄铜书签，放到她掌心：“那么，告诉我你忘不掉的那一句。”',
      '她想了很久。窗外的雨在这段沉默里换了一种下法。后来她说：“我只记得，读到它的时候，我以为有人提前知道了我的心事。”',
    ],
    highlight: '有人提前知道了我的心事',
  },
  {
    chapter: '第三章',
    title: '书页背面的房间',
    kicker: 'The room behind the page',
    paragraphs: [
      '他们沿着书架向里走。每经过一排，外面的雨声就远一点，而纸张翻动的声音就近一点。书架尽头没有墙，只有一页竖立着的、微微发亮的纸。',
      '女孩把黄铜书签贴上去，纸页便从中间打开。另一边是一间更小的房间，一张桌子，两把椅子，桌上摊着同一本书。',
      '其中一把椅子上有刚刚起身的温度。书的页边留着一行很淡的字：我没有在这里等你，我只是恰好比你早到了一会儿。',
    ],
    highlight: '恰好比你早到了一会儿',
  },
  {
    chapter: '第四章',
    title: '替沉默装订',
    kicker: 'Binding the silences',
    paragraphs: [
      '女孩没有立刻坐下。她先翻过那些写了字的页边，又翻过更多什么也没有留下的空白。奇怪的是，空白并不比文字轻。',
      '有些人来到书里，是为了回答；有些人只是把同一句话读得更慢。书房从不把后一种来访算作缺席。',
      '守书人取来针线，把一小段沉默缝进书脊。线是雾粉色的，只有在灯光偏向黄昏的时候才看得见。',
    ],
    highlight: '空白并不比文字轻',
  },
  {
    chapter: '尾声',
    title: '天亮以后',
    kicker: 'After the lamps went out',
    paragraphs: [
      '雨在凌晨四点停下。女孩离开时没有带走那本书，只带走了夹在其中的一页。',
      '第二天早晨，城市的窗户一扇接一扇亮起来。没有人知道昨夜多出了一间书房，也没有人知道某本书的未来页上，已经提前留下了一行字。',
      '但当女孩再次翻到那里，她会看见纸页右下角有一点旧灯的颜色。那不是提醒，也不是等待回答的消息。那只是一个人曾在不同的时间，从这里经过。',
    ],
    highlight: '一个人曾在不同的时间，从这里经过',
  },
]

const initialTraces: Trace[] = [
  {
    id: 'trace-1',
    chapterIndex: 0,
    chapter: '第一章 · 雨先抵达',
    quote: '句子需要重量。',
    fox: '有些话打在屏幕上很轻，写进书里以后却会留下来。',
  },
  {
    id: 'trace-2',
    chapterIndex: 1,
    chapter: '第二章 · 没有寄出的页码',
    quote: '我以为有人提前知道了我的心事。',
    fox: '读到这里时，好像被一本陌生的书认了出来。',
    fish: '也许书并不知道，只是它替那一刻保留了一个位置。',
  },
  {
    id: 'trace-3',
    chapterIndex: 3,
    chapter: '第四章 · 替沉默装订',
    quote: '空白并不比文字轻。',
  },
]

const filters: { id: ShelfFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'reading', label: '在读' },
  { id: 'wish', label: '想读' },
  { id: 'finished', label: '已读完' },
]

function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  const catalogueNumber = String(books.findIndex((item) => item.id === book.id) + 1).padStart(2, '0')
  return (
    <span className={`book-cover cover-${book.tone} ${large ? 'is-large' : ''}`} aria-hidden="true">
      <span className="cover-index">MARGINALIA · {catalogueNumber}</span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-english">{book.englishTitle}</span>
    </span>
  )
}

function BrandHeader({ onBack }: { onBack?: () => void }) {
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
      <div className="brand-lockup">
        <span className="brand-flourish" aria-hidden="true"><i>M</i></span>
        <div><p className="brand-name">Marginalia</p><p className="brand-subtitle">在正文之外，我们相遇。</p></div>
      </div>
      <button className="import-book" type="button" aria-label="藏入一本书"><Upload size={18} strokeWidth={1.5} /><span>藏入一本书</span></button>
    </header>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>('shelf')
  const [roomBook, setRoomBook] = useState<Book>(books[0])
  const [filter, setFilter] = useState<ShelfFilter>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const [totalPages, setTotalPages] = useState(chapters.length)
  const [chapterStarts, setChapterStarts] = useState(chapters.map((_, index) => index))
  const [chromeVisible, setChromeVisible] = useState(false)
  const [panel, setPanel] = useState<ReaderPanel>(null)
  const [theme, setTheme] = useState<ReaderTheme>('day')
  const [fontSize, setFontSize] = useState(19)
  const [lineHeight, setLineHeight] = useState(1.95)
  const [pageMargin, setPageMargin] = useState(12)
  const [selectedText, setSelectedText] = useState('')
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [traces, setTraces] = useState<Trace[]>(initialTraces)
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null)
  const [returnPage, setReturnPage] = useState<number | null>(null)
  const [pendingChapter, setPendingChapter] = useState<number | null>(null)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [toast, setToast] = useState('')

  const viewportRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const reflowAnchorRef = useRef<ReflowAnchor | null>(null)

  const filteredBooks = useMemo(
    () => books.filter((book) => filter === 'all' || book.status === filter),
    [filter],
  )

  const currentChapterIndex = useMemo(() => {
    let active = 0
    chapterStarts.forEach((start, index) => { if (start <= pageIndex) active = index })
    return active
  }, [chapterStarts, pageIndex])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
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
  }, [screen, fontSize, lineHeight, pageMargin, recalculatePagination])

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
    setSelectedText('')
  }

  const openReaderAtChapter = (chapterIndex: number) => {
    if (roomBook.id !== 'rain-room') {
      showToast('这本书还没有拆封，先读《雨夜书房》吧。')
      return
    }
    setPendingChapter(chapterIndex)
    setScreen('reader')
    setChromeVisible(false)
    setPanel(null)
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
    if (window.getSelection()?.toString().trim()) return
    const rect = event.currentTarget.getBoundingClientRect()
    const position = (event.clientX - rect.left) / rect.width
    if (position < 0.4) turnToPage(pageIndex - 1)
    else if (position > 0.6) turnToPage(pageIndex + 1)
    else { setChromeVisible((visible) => !visible); setPanel(null) }
  }

  const handleTextSelection = () => {
    window.setTimeout(() => {
      const text = window.getSelection()?.toString().trim() ?? ''
      if (text.length > 1) {
        setSelectedText(text.slice(0, 180))
        setChromeVisible(false)
        setPanel(null)
        setActiveTrace(null)
      }
    }, 0)
  }

  const saveHighlight = () => {
    if (!selectedText) return
    setTraces((current) => [...current, {
      id: `trace-${Date.now()}`,
      chapterIndex: currentChapterIndex,
      chapter: `${chapters[currentChapterIndex].chapter} · ${chapters[currentChapterIndex].title}`,
      quote: selectedText,
    }])
    clearSelection()
    showToast('这句话已经留在页边。')
  }

  const saveNote = () => {
    if (!selectedText || !noteDraft.trim()) return
    setTraces((current) => [...current, {
      id: `trace-${Date.now()}`,
      chapterIndex: currentChapterIndex,
      chapter: `${chapters[currentChapterIndex].chapter} · ${chapters[currentChapterIndex].title}`,
      quote: selectedText,
      fox: noteDraft.trim(),
    }])
    setNoteDraft('')
    setNoteComposerOpen(false)
    clearSelection()
    showToast('批注已经夹进这一页。')
  }

  const jumpToChapter = (chapterIndex: number) => {
    if (returnPage === null) setReturnPage(pageIndex)
    setPageIndex(chapterStarts[chapterIndex] ?? 0)
    setPanel(null)
    setChromeVisible(false)
    setActiveTrace(null)
  }

  const openExistingTrace = (chapterIndex: number, quote: string) => {
    const trace = traces.find((item) => item.chapterIndex === chapterIndex)
    setActiveTrace(trace ?? {
      id: `preview-${chapterIndex}`,
      chapterIndex,
      chapter: `${chapters[chapterIndex].chapter} · ${chapters[chapterIndex].title}`,
      quote,
    })
    setPanel(null)
    setChromeVisible(false)
  }

  if (screen === 'room') {
    const isSample = roomBook.id === 'rain-room'
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
          <button className="room-recent" type="button" onClick={() => isSample && openReaderAtChapter(0)}>
            <BookOpenText /><small>{roomBook.lastChapter ? `最近停留 · ${roomBook.lastChapter} · ${roomBook.statusLabel} ${roomBook.progress}%` : '尚未开始阅读'}</small>
            <q>{roomBook.lastChapter ? roomBook.quote : '这本书还在等待第一次翻开。'}</q>
            <span>{isSample ? '从这里继续' : '尚无阅读位置'} <ChevronRight /></span>
          </button>
        </section>
        {isSample && (
          <section className="room-chapters">
            <div className="room-section-title"><h2>章节与痕迹</h2></div>
            {chapters.map((chapter, index) => {
              const chapterTraces = traces.filter((trace) => trace.chapterIndex === index)
              return (
                <div className="room-chapter-group" key={chapter.title}>
                  <button className="room-chapter-heading" type="button" onClick={() => openReaderAtChapter(index)}>
                    <span>{chapter.chapter}</span><strong>{chapter.title}</strong><small>{chapterTraces.length ? `${chapterTraces.length} 条痕迹` : '尚无痕迹'}</small><ChevronRight />
                  </button>
                  {chapterTraces.length > 0 && (
                    <div className="room-trace-list">
                      {chapterTraces.map((trace) => (
                        <button type="button" key={trace.id} onClick={() => openReaderAtChapter(index)}>
                          <q>{trace.quote}</q>
                          {trace.fox && <p><b>小狐狸</b>：{trace.fox}</p>}
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
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    )
  }

  if (screen === 'reader') {
    const currentChapter = chapters[currentChapterIndex]
    return (
      <main className={`reader-shell reader-${theme}`}>
        <header className={`reader-topbar ${chromeVisible ? 'is-visible' : ''}`}>
          <button className="icon-button back-button" type="button" onClick={() => setScreen('shelf')} aria-label="返回书架"><ArrowLeft size={19} /><span>书架</span></button>
          <div className="reader-location"><span>雨夜书房</span></div>
          <span className="reader-progress">{Math.round(((pageIndex + 1) / totalPages) * 100)}%</span>
        </header>

        <article
          className="reader-page reader-page-v2"
          onClick={handleReaderClick}
          onMouseUp={handleTextSelection}
          style={{ '--reader-font-size': `${fontSize}px`, '--reader-line-height': lineHeight, '--reader-margin': `${pageMargin}%` } as React.CSSProperties}
        >
          <div className="page-grain" aria-hidden="true" />
          <div className="running-header">{currentChapter.chapter} · {currentChapter.title}</div>
          <div className="reader-text-viewport" ref={viewportRef}>
            <div className="reader-flow" ref={flowRef} style={{ transform: `translateX(-${pageIndex * 100}%)` }}>
              {chapters.map((chapter, chapterIndex) => (
                <section className="chapter-section" data-chapter-index={chapterIndex} key={chapter.title}>
                  <div className="chapter-heading">
                    <span>{chapter.chapter}</span><h1>{chapter.title}</h1><p>{chapter.kicker}</p>
                  </div>
                  {chapter.paragraphs.map((paragraph, paragraphIndex) => {
                    const parts = paragraph.split(chapter.highlight)
                    return (
                      <p key={paragraph} className={paragraphIndex === 0 ? 'opening-paragraph' : ''}>
                        {parts.length === 1 ? paragraph : <>{parts[0]}<mark onClick={() => openExistingTrace(chapterIndex, chapter.highlight)}>{chapter.highlight}</mark>{parts[1]}</>}
                      </p>
                    )
                  })}
                </section>
              ))}
            </div>
          </div>
          <div className="page-number" aria-label={`第 ${pageIndex + 1} 页，共 ${totalPages} 页`}>{String(pageIndex + 1).padStart(2, '0')}<span />{String(totalPages).padStart(2, '0')}</div>
        </article>

        {returnPage !== null && <button className="return-slip" type="button" onClick={() => { setPageIndex(returnPage); setReturnPage(null) }}><CornerUpLeft />回到刚才的位置</button>}

        {activeTrace && (
          <section className="trace-detail-sheet" aria-label="划线详情">
            <div className="trace-detail-heading"><small>{activeTrace.chapter}</small><button type="button" onClick={() => setActiveTrace(null)} aria-label="关闭划线详情"><X /></button></div>
            <blockquote>“{activeTrace.quote}”</blockquote>
            {activeTrace.fox ? <p><b>小狐狸</b>{activeTrace.fox}</p> : <button className="empty-note" type="button" onClick={() => { setSelectedText(activeTrace.quote); setActiveTrace(null); setNoteComposerOpen(true) }}>这里还没有文字。写一条批注</button>}
            {activeTrace.fish && <p className="fish-detail"><b>小鱼</b>{activeTrace.fish}</p>}
            <div className="trace-detail-actions"><button type="button" onClick={() => showToast('颜色选择会在下一轮继续细化。')}>更换颜色</button><button type="button" onClick={() => showToast('原型暂不删除真实痕迹。')}>删除划线</button></div>
          </section>
        )}

        {selectedText && !noteComposerOpen && (
          <div className="selection-menu" role="toolbar" aria-label="文字操作">
            <span className="selected-preview">“{selectedText}”</span>
            <div><button type="button" onClick={() => { void navigator.clipboard?.writeText(selectedText); showToast('已复制。') }}><Copy />复制</button><button type="button" onClick={saveHighlight}><Highlighter />划线</button><button type="button" onClick={() => setNoteComposerOpen(true)}><MessageSquareText />写批注</button><button className="selection-close" type="button" onClick={clearSelection} aria-label="关闭"><X /></button></div>
            <div className="mark-options"><Underline /><span className="line-choice" /><span className="line-choice is-wavy" /><i className="color-dot rose" /><i className="color-dot gold" /><i className="color-dot mint" /></div>
          </div>
        )}

        {noteComposerOpen && (
          <section className="note-composer" aria-label="写批注">
            <div className="note-quote">“{selectedText}”</div><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="写下此刻想到的事……" autoFocus />
            <div className="composer-actions"><button type="button" onClick={() => { setNoteComposerOpen(false); setNoteDraft('') }}>取消</button><button className="save-note" type="button" onClick={saveNote}><Check />留下</button></div>
          </section>
        )}

        {panel && (
          <section className="reader-panel">
            <div className="panel-handle" />
            {panel === 'toc' && <><PanelHeading eyebrow="CONTENTS" title="目录" close={() => setPanel(null)} /><div className="toc-list">{chapters.map((chapter, index) => <button className={index === currentChapterIndex ? 'is-current' : ''} type="button" key={chapter.title} onClick={() => jumpToChapter(index)}><span>{chapter.chapter}</span><strong>{chapter.title}</strong><small>{String((chapterStarts[index] ?? 0) + 1).padStart(2, '0')}</small></button>)}</div></>}
            {panel === 'traces' && <><PanelHeading eyebrow="MARGINALIA" title="页边痕迹" close={() => setPanel(null)} /><div className="trace-list">{[...traces].reverse().map((trace) => <button type="button" key={trace.id} onClick={() => jumpToChapter(trace.chapterIndex)}><small>{trace.chapter}</small><blockquote>“{trace.quote}”</blockquote>{trace.fox && <p><b>小狐狸</b>：{trace.fox}</p>}{trace.fish && <p className="fish-note"><b>小鱼</b>：{trace.fish}</p>}</button>)}</div></>}
            {panel === 'stats' && <><PanelHeading eyebrow="READING LIFE" title="阅读统计" close={() => setPanel(null)} /><div className="stats-grid stats-grid-v2"><div><strong>38<sup>%</sup></strong><small>约一小时后读完</small></div><div><strong>4 小时 12 分</strong><small>累计阅读</small></div><div><strong>{traces.length} 条</strong><small>笔记与划线</small></div></div></>}
            {panel === 'type' && <><PanelHeading eyebrow="TYPESETTING" title="排版" close={() => setPanel(null)} /><div className="type-settings">
              <label><span>字号 <small>{fontSize}px</small></span><input type="range" min="16" max="25" value={fontSize} onChange={(event) => { rememberReflowAnchor(); setFontSize(Number(event.target.value)) }} /></label>
              <label><span>行距 <small>{lineHeight.toFixed(1)}</small></span><input type="range" min="1.5" max="2.3" step="0.1" value={lineHeight} onChange={(event) => { rememberReflowAnchor(); setLineHeight(Number(event.target.value)) }} /></label>
              <label><span>页边距 <small>{pageMargin}%</small></span><input type="range" min="7" max="18" value={pageMargin} onChange={(event) => { rememberReflowAnchor(); setPageMargin(Number(event.target.value)) }} /></label>
              <label><span>字体</span><select defaultValue="serif"><option value="serif">书页宋体</option><option value="song">传统宋体</option><option value="sans">清晰黑体</option></select></label>
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
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    )
  }

  return (
    <main className="shelf-shell shelf-shell-v2">
      <BrandHeader />
      <nav className="shelf-filters" aria-label="书架分类">
        {filters.map((item) => {
          const count = item.id === 'all' ? books.length : books.filter((book) => book.status === item.id).length
          return <button type="button" key={item.id} className={filter === item.id ? 'is-active' : ''} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}><span>{item.label}</span><small>{String(count).padStart(2, '0')}</small></button>
        })}
      </nav>
      <section className="book-list" aria-label="书籍列表">
        {filteredBooks.map((book) => (
          <article className="book-row book-row-v2" key={book.id}>
            <button className="book-cover-button" type="button" onClick={() => { setRoomBook(book); setScreen('room') }} aria-label={`查看《${book.title}》的书籍档案`}><BookCover book={book} /><small>查看书籍档案</small></button>
            <button className="book-main book-main-button" type="button" onClick={() => { setRoomBook(book); if (book.id === 'rain-room') openReaderAtChapter(0); else showToast('这本书还没有拆封。') }} aria-label={`${book.progress ? '继续阅读' : '打开'}《${book.title}》`}>
              <span className="book-state">{book.statusLabel} {book.progress > 0 && `· ${book.progress}%`}</span><strong>{book.title}</strong><em>{book.englishTitle}</em><span className="book-author">{book.author}</span><span className="book-description">{book.description}</span><span className="open-book">{book.progress ? '继续阅读' : '翻开看看'} <ChevronRight /></span>
            </button>
            <button className="book-trace book-trace-button" type="button" onClick={() => { setRoomBook(book); if (book.id === 'rain-room') openReaderAtChapter(0); else showToast('这里还没有阅读痕迹。') }} aria-label={`查看《${book.title}》最近停留的位置`}>
              <BookOpenText /><small>{book.lastChapter ? `最近停留 · ${book.lastChapter}` : '尚未开始阅读'}</small>
              <q>{book.lastChapter ? book.quote : '这本书还在等待第一次翻开。'}</q>
              <span>{book.lastChapter ? '回到这句话' : '翻开看看'} <ChevronRight /></span>
            </button>
          </article>
        ))}
      </section>
      <footer className="shelf-footer"><span>Marginalia · 私人共读书房</span><span>昨夜的灯尚未亮起</span></footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}

function PanelHeading({ eyebrow, title, close }: { eyebrow: string; title: string; close: () => void }) {
  return <div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={close} aria-label={`关闭${title}`}><X /></button></div>
}

export default App
