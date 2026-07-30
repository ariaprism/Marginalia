import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  getAllBooks,
  getBook,
  getChapters,
  getReadingProgress,
  saveBook,
  saveChapters,
} from './data/local/bookStore'
import { seedSampleTraces } from './data/local/seedSampleTraces'
import { createBook, type BookStatus } from './domain/book'
import { buildRainRoomEpub, rainRoomChapters } from './reader/fixtures/rain-room-epub'

async function openImportDraft(file: File) {
  fireEvent.click(screen.getByRole('button', { name: '藏入书籍' }))
  const input = screen.getByLabelText('选择 EPUB 文件') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
  await screen.findByDisplayValue('雨夜书房')
}

async function seedTestBook({
  id = 'rain-room',
  title = '雨夜书房',
  status = 'reading',
  withTraces = false,
}: {
  id?: string
  title?: string
  status?: BookStatus
  withTraces?: boolean
} = {}) {
  await saveBook(createBook({
    id,
    title,
    englishTitle: title === '雨夜书房' ? 'The Library After Rain' : undefined,
    author: '小G · 著',
    description: '一座只在雨夜出现的旧书房，替迟迟没有说出口的人，保存那些被折起来的句子。',
    coverTone: status === 'finished' ? 'green' : 'rose',
    source: 'marginalia',
    status,
  }))
  await saveChapters(id, rainRoomChapters.map((chapter) => ({
    id: `${id}-chapter-${chapter.index}`,
    index: chapter.index,
    title: chapter.title,
    href: `chapter-${chapter.index}.xhtml`,
    html: `<html><body>${chapter.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}</body></html>`,
  })))
  if (withTraces) await seedSampleTraces(true)
  return id
}

async function renderWithRainRoom(withTraces = false) {
  await seedTestBook({ withTraces })
  const result = render(<App />)
  await screen.findByRole('button', { name: /打开《雨夜书房》/ }, { timeout: 10_000 })
  return result
}

function mockPaginatedGeometry(targetText: string, targetPage: number) {
  const width = 500
  const rect = (left: number, rectWidth = 120): DOMRect => ({
    x: left,
    y: 100,
    left,
    right: left + rectWidth,
    top: 100,
    bottom: 124,
    width: rectWidth,
    height: 24,
    toJSON: () => ({}),
  })
  const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('reader-text-viewport') ? width : 0
    })
  const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('reader-flow') ? width * (targetPage + 2) : 0
    })
  const boundingRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.matches('[data-chapter-index]')) {
        return rect(Number(this.dataset.chapterIndex ?? 0) * width)
      }
      return rect(0, width)
    })
  const clientRects = vi.spyOn(HTMLElement.prototype, 'getClientRects')
    .mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('sentence-unit')) return [] as unknown as DOMRectList
      const chapter = Number(this.closest<HTMLElement>('[data-chapter-index]')?.dataset.chapterIndex ?? 0)
      const left = this.textContent?.includes(targetText) ? targetPage * width : chapter * width
      return [rect(left)] as unknown as DOMRectList
    })

  return () => {
    clientWidth.mockRestore()
    scrollWidth.mockRestore()
    boundingRect.mockRestore()
    clientRects.mockRestore()
  }
}

describe('Marginalia visual prototype', () => {
  it('starts with a real empty shelf instead of bundled preview books', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: '藏入第一本书' }, { timeout: 5_000 })).toBeInTheDocument()
    expect(screen.queryByText('书房还在等第一本书')).not.toBeInTheDocument()
    expect(screen.queryByText('Marginalia · 私人共读书房')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查看《.+》的书籍档案/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '藏入第一本书' }))
    expect(screen.getByRole('dialog', { name: '藏入书籍' })).toBeInTheDocument()
  })

  it('opens a book room from the cover and continues into the reader', async () => {
    await renderWithRainRoom()

    expect(screen.getByText('在正文之外，我们相遇。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '一座只在雨夜出现的旧书房，替迟迟没有说出口的人，保存那些被折起来的句子。' }))
    expect(screen.getByRole('dialog', { name: '雨夜书房' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭完整简介' }))

    fireEvent.click(await screen.findByRole('button', { name: /从头开始读|从这里继续/ }))
    expect(screen.getByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    expect(screen.getByLabelText(/第 1 页，共/)).toBeInTheDocument()
  }, 20_000)

  it('imports a real EPUB and reads its chapters from storage', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '雨夜书房.epub', { type: 'application/epub+zip' })

    render(<App />)

    await openImportDraft(file)
    expect(screen.getByDisplayValue('小G')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '书籍预览' })).getByText('想读')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/英文名/), { target: { value: 'The Library After Rain' } })
    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: '从 EPUB 来，也可以由小狐狸修改。' } })
    fireEvent.click(screen.getByRole('button', { name: '选择雾蓝封面' }))
    expect(screen.getByRole('button', { name: '选择雾蓝封面' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '藏入书架' }))

    await waitFor(() => expect(screen.getByText('已经藏入书架。')).toBeInTheDocument())

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^打开《雨夜书房》/ })).toHaveLength(1)
    })
    const importedRows = screen.getAllByRole('button', { name: /^打开《雨夜书房》/ })
    const importedRow = importedRows[0]
    expect(importedRow.closest('article')?.querySelector('.book-cover')).toHaveClass('cover-blue')
    const [storedBeforeOpening] = await getAllBooks()
    expect(storedBeforeOpening.status).toBe('wish')

    // 只打开简介不算开始阅读；从小房间真正翻开正文时才进入“在读”。
    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    await screen.findByRole('heading', { name: '章节与痕迹' })
    expect((await getBook(storedBeforeOpening.id))?.status).toBe('wish')
    fireEvent.click(screen.getByRole('button', { name: /从头开始读|从这里继续/ }))

    // 正文来自 IndexedDB 里解析出的 XHTML，而不是内置示例数据。
    expect(await screen.findByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    await waitFor(async () => expect((await getBook(storedBeforeOpening.id))?.status).toBe('reading'))
    expect(screen.getByText(/灯亮起来以前，书房先听见了雨。/)).toBeInTheDocument()
    expect(screen.getByLabelText(/第 1 页，共/)).toBeInTheDocument()
  })

  it('starts an imported book without preloaded sample traces', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '导入的书.epub', { type: 'application/epub+zip' })

    render(<App />)

    await openImportDraft(file)
    fireEvent.click(screen.getByRole('button', { name: '藏入书架' }))
    await waitFor(() => expect(screen.getByText('已经藏入书架。')).toBeInTheDocument())

    const importedCover = await screen.findByRole('button', { name: /查看《雨夜书房》的书籍档案/ })
    fireEvent.click(importedCover)

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '章节与痕迹' })).toBeInTheDocument())
    expect(screen.queryByText('句子需要重量。')).not.toBeInTheDocument()
    expect(screen.queryByText(/有些话打在屏幕上很轻/)).not.toBeInTheDocument()
    expect(screen.getAllByText('尚无痕迹').length).toBeGreaterThan(0)

    // 页边痕迹面板同样为空，统计里的条数为 0。
    fireEvent.click(screen.getByRole('button', { name: /从头开始读|从这里继续/ }))
    expect(await screen.findByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('article'))
    fireEvent.click(screen.getByRole('button', { name: '页边痕迹' }))
    expect(screen.getByText('这本书还没有留下痕迹。')).toBeInTheDocument()
  })

  it('does not save a parsed EPUB until the import dialog is confirmed', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '暂不藏入.epub', { type: 'application/epub+zip' })
    render(<App />)

    await openImportDraft(file)
    expect(screen.getByRole('region', { name: '书籍预览' })).toBeInTheDocument()
    const cover = new File(['tiny-cover'], 'cover.png', { type: 'image/png' })
    const coverInput = screen.getByLabelText('导入封面图片') as HTMLInputElement
    Object.defineProperty(coverInput, 'files', { value: [cover], configurable: true })
    fireEvent.change(coverInput)
    await waitFor(() => expect((document.querySelector('.import-preview .cover-image') as HTMLImageElement).src).toContain('data:image/png'))
    fireEvent.click(screen.getByRole('button', { name: '选择赭黄封面' }))
    expect(document.querySelector('.import-preview .cover-image')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '暂不藏入' }))

    expect(screen.queryByRole('dialog', { name: '藏入书籍' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^打开《雨夜书房》/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '藏入第一本书' })).toBeInTheDocument()
  })

  it('keeps a highlight and its note after the app is reloaded', async () => {
    const { unmount } = await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》|继续阅读《雨夜书房》/ }))

    const sentence = await screen.findByText('灯亮起来以前，书房先听见了雨。')
    fireEvent.click(sentence)
    fireEvent.click(screen.getByRole('button', { name: '划线' }))
    await waitFor(() => expect(sentence).toHaveClass('has-user-highlight'))

    fireEvent.click(sentence)
    fireEvent.click(screen.getByRole('button', { name: '留痕' }))
    fireEvent.change(screen.getByPlaceholderText('Thoughts...'), { target: { value: '这一句要留到下次打开。' } })
    fireEvent.click(screen.getByRole('button', { name: '留下' }))
    expect(await screen.findByText('这一句要留到下次打开。')).toBeInTheDocument()

    // 关掉整个应用再打开，等价于刷新页面：痕迹只能从 IndexedDB 回来。
    unmount()
    render(<App />)

    const reloaded = await screen.findByText('灯亮起来以前，书房先听见了雨。')
    await waitFor(() => expect(reloaded).toHaveClass('has-user-highlight'))
    fireEvent.click(screen.getByRole('article'))
    fireEvent.click(screen.getByRole('button', { name: '页边痕迹' }))
    expect(screen.getByText(/这一句要留到下次打开/)).toBeInTheDocument()
  })

  it('filters the mobile-friendly shelf', async () => {
    await seedTestBook()
    await seedTestBook({ id: 'winter-greenhouse', title: '玻璃温室里的冬天', status: 'finished' })
    render(<App />)
    await screen.findByText('玻璃温室里的冬天')
    fireEvent.click(screen.getByRole('button', { name: /已读完/ }))
    expect(screen.getByText('玻璃温室里的冬天')).toBeInTheDocument()
    expect(screen.queryByText('雨夜书房')).not.toBeInTheDocument()
  })

  it('toggles between the detailed list and the three-column cover shelf', async () => {
    await renderWithRainRoom()
    expect(screen.getByText('雨夜书房')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '切换为封面书架' }))

    expect(screen.getByRole('region', { name: '封面书架' })).toBeInTheDocument()
    expect(screen.queryByText('雨夜书房')).not.toBeInTheDocument()
    expect(screen.getByText('雨夜')).toBeInTheDocument()
    expect(screen.getByText('书房')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换为列表书架' })).toBeInTheDocument()
  })

  it('keeps the calling cards in the sidebar while the title toggles the shelf', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '打开侧边栏' }))
    expect(screen.getByRole('heading', { name: '名帖' })).toBeInTheDocument()
    expect(screen.getByLabelText('我的落款')).toHaveValue('小狐狸')
    expect(screen.getByLabelText('共读者的名字')).toHaveValue('小鱼')
    expect(screen.getByRole('button', { name: /念头/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /来访/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /影子书/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /云端书房/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /影子书/ }))
    expect(screen.getByRole('heading', { name: '影子书' })).toBeInTheDocument()
    expect(screen.getByText(/微信读书带回的旧划线/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /名帖/ }))

    fireEvent.change(screen.getByLabelText('我的落款'), { target: { value: '阿狐' } })
    fireEvent.change(screen.getByLabelText('共读者的名字'), { target: { value: '小鲸' } })
    fireEvent.change(screen.getByLabelText('如何称呼共读者'), { target: { value: '他' } })
    expect(screen.getByText('他来过时，留下的文字会以这个名字落款。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭侧边栏面板' }))
    expect(screen.queryByRole('complementary', { name: '侧边栏' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开侧边栏' }))
    expect(screen.getByLabelText('我的落款')).toHaveValue('阿狐')
    expect(screen.getByLabelText('共读者的名字')).toHaveValue('小鲸')
    fireEvent.click(screen.getByRole('button', { name: '关闭侧边栏面板' }))

    fireEvent.click(screen.getByRole('button', { name: '切换为封面书架' }))
    expect(screen.getByRole('region', { name: '封面书架' })).toBeInTheDocument()
  })

  it('moves the most recently opened book to the top of the shelf', async () => {
    await seedTestBook()
    await seedTestBook({ id: 'light-index', title: '光的索引' })
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: '查看《光的索引》的书籍档案' })
    fireEvent.click(screen.getByRole('button', { name: '查看《光的索引》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))

    expect(screen.getAllByRole('button', { name: /查看《.+》的书籍档案/ })[0]).toHaveAccessibleName('查看《光的索引》的书籍档案')

    unmount()
    render(<App />)
    expect((await screen.findAllByRole('button', { name: /查看《.+》的书籍档案/ }))[0]).toHaveAccessibleName('查看《光的索引》的书籍档案')
  }, 10_000)

  it('orders pinned books by their latest reading activity and persists the order', async () => {
    await seedTestBook()
    await seedTestBook({ id: 'light-index', title: '光的索引' })
    const { unmount } = render(<App />)
    await screen.findByRole('button', { name: '查看《雨夜书房》的书籍档案' })

    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '管理这本书' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶这本书' }))
    expect(await screen.findByText('《雨夜书房》已经盖章置顶。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))

    fireEvent.click(screen.getByRole('button', { name: '查看《光的索引》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '管理这本书' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶这本书' }))
    expect(await screen.findByText('《光的索引》已经盖章置顶。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))
    expect(screen.getAllByRole('button', { name: /查看《.+》的书籍档案/ })[0]).toHaveAccessibleName('查看《光的索引》的书籍档案')

    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))
    expect(screen.getAllByRole('button', { name: /查看《.+》的书籍档案/ })[0]).toHaveAccessibleName('查看《雨夜书房》的书籍档案')
    expect((await getBook('rain-room'))?.pinnedAt).toBeDefined()
    expect((await getBook('light-index'))?.pinnedAt).toBeDefined()

    unmount()
    render(<App />)
    expect((await screen.findAllByRole('button', { name: /查看《.+》的书籍档案/ }))[0]).toHaveAccessibleName('查看《雨夜书房》的书籍档案')
  })

  it('removes an imported book and its parsed chapters from the local room', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '待移出的书.epub', { type: 'application/epub+zip' })
    render(<App />)

    await openImportDraft(file)
    fireEvent.change(screen.getByLabelText('书名'), { target: { value: '待移出的书' } })
    fireEvent.click(screen.getByRole('button', { name: '藏入书架' }))
    await screen.findByText('已经藏入书架。')
    await waitFor(() => expect(screen.getByRole('button', { name: '查看《待移出的书》的书籍档案' })).toBeInTheDocument())

    const [stored] = await getAllBooks()
    fireEvent.click(screen.getByRole('button', { name: '查看《待移出的书》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: '管理这本书' }))
    fireEvent.click(screen.getByRole('button', { name: '收起书籍操作' }))
    expect(screen.queryByRole('menuitem', { name: '移出书房' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '管理这本书' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '移出书房' }))
    expect(screen.getByRole('dialog', { name: '移出《待移出的书》？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认移出' }))

    expect(await screen.findByText('《待移出的书》已经移出书房。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '查看《待移出的书》的书籍档案' })).not.toBeInTheDocument()
    expect(await getBook(stored.id)).toBeUndefined()
    expect(await getChapters(stored.id)).toEqual([])
  })

  it('keeps a movable fold separate from temporary chapter jumps', async () => {
    const { unmount } = await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》/ }))
    await waitFor(() => expect(screen.queryByLabelText('正在打开书籍')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '在这里折页' }))
    expect(await screen.findByText('这一页已经折好。')).toBeInTheDocument()
    const firstBookmarkButton = screen.getByRole('button', { name: '打开折页' })
    expect(firstBookmarkButton).toHaveClass('has-bookmark')
    expect(firstBookmarkButton).toHaveClass('is-current')
    expect(getComputedStyle(firstBookmarkButton.querySelector('svg')!).fill).not.toBe('none')
    await waitFor(async () => {
      const progress = await getReadingProgress('rain-room')
      expect(progress?.locator.position.chapterIndex).toBe(0)
      expect(progress?.bookmark?.locator.position.chapterIndex).toBe(0)
    })

    fireEvent.click(screen.getByRole('button', { name: '目录' }))
    fireEvent.click(screen.getByRole('button', { name: /没有寄出的页码/ }))
    const bookmarkAwayFromFold = screen.getByRole('button', { name: '打开折页' })
    expect(bookmarkAwayFromFold).toHaveClass('has-bookmark')
    expect(bookmarkAwayFromFold).not.toHaveClass('is-current')

    // 目录跳转只是临时翻看，在新位置继续翻页或交互前不能覆盖自动位置。
    expect((await getReadingProgress('rain-room'))?.locator.position.chapterIndex).toBe(0)

    fireEvent.click(screen.getByRole('article'))
    fireEvent.click(screen.getByRole('button', { name: '打开折页' }))
    expect(screen.getByRole('button', { name: '回到原折' })).toBeInTheDocument()

    // 点书页空白处时，折页菜单与顶栏应作为同一层界面一起收回。
    fireEvent.click(screen.getByRole('article'))
    expect(screen.queryByRole('button', { name: '回到原折' })).not.toBeInTheDocument()
    expect(document.querySelector('.reader-topbar')).not.toHaveClass('is-visible')

    fireEvent.click(screen.getByRole('article'))
    fireEvent.click(screen.getByRole('button', { name: '打开折页' }))
    fireEvent.click(screen.getByRole('button', { name: '移折至此' }))
    expect(screen.getByRole('button', { name: '打开折页' })).toHaveClass('has-bookmark', 'is-current')

    await waitFor(async () => {
      const progress = await getReadingProgress('rain-room')
      expect(progress?.locator.position.chapterIndex).toBe(1)
      expect(progress?.bookmark?.locator.position.chapterIndex).toBe(1)
    })

    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))
    expect(await screen.findByText('上次读到 · 第 2 章')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '继续阅读《雨夜书房》' })).toBeInTheDocument()

    unmount()
    render(<App />)
    expect(await screen.findByText('上次读到 · 第 2 章')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续阅读《雨夜书房》' }))
    await waitFor(() => expect(screen.queryByLabelText('正在打开书籍')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '打开折页' })).toBeInTheDocument()
  })

  it('opens a room trace on the dynamic page containing its sentence', async () => {
    const restoreGeometry = mockPaginatedGeometry('句子需要重量', 4)
    try {
      await renderWithRainRoom(true)
      fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
      await screen.findByText(/有些话打在屏幕上很轻/)
      const traceButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.room-trace-list button'))
        .find((button) => button.textContent?.includes('句子需要重量'))
      fireEvent.click(traceButton!)

      await waitFor(() => expect(screen.getByLabelText('第 5 页，共 6 页')).toBeInTheDocument())
    } finally {
      restoreGeometry()
    }
  })

  it('opens a page-edge trace on the dynamic page containing its sentence', async () => {
    const restoreGeometry = mockPaginatedGeometry('句子需要重量', 4)
    try {
      await renderWithRainRoom(true)
      fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》/ }))
      await waitFor(() => expect(document.querySelector('.has-user-highlight')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('article'), { clientX: 250 })
      fireEvent.click(screen.getByRole('button', { name: '页边痕迹' }))
      const traceButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.trace-list button'))
        .find((button) => button.textContent?.includes('句子需要重量'))
      fireEvent.click(traceButton!)

      expect(screen.getByLabelText('第 5 页，共 6 页')).toBeInTheDocument()
    } finally {
      restoreGeometry()
    }
  })

  it('restores the reader screen after the browser remounts the page', async () => {
    const { unmount } = await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》/ }))
    await waitFor(() => expect(screen.queryByLabelText('正在打开书籍')).not.toBeInTheDocument())
    await waitFor(() => {
      expect(window.localStorage.getItem('marginalia:last-view')).toContain('"screen":"reader"')
    })

    unmount()
    render(<App />)

    expect(await screen.findByRole('button', { name: '返回书架' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText('正在打开书籍')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
  })

  it('uses the mobile-compatible copy fallback for an excerpt', async () => {
    const originalSecureContext = window.isSecureContext
    const originalExecCommand = document.execCommand
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true })

    try {
      await renderWithRainRoom()
      fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》|继续阅读《雨夜书房》/ }))
      fireEvent.click(await screen.findByText('灯亮起来以前，书房先听见了雨。'))
      fireEvent.click(screen.getByRole('button', { name: '摘录' }))

      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(await screen.findByText('已复制。')).toBeInTheDocument()
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: originalSecureContext, configurable: true })
      Object.defineProperty(document, 'execCommand', { value: originalExecCommand, configurable: true })
    }
  })

  it('applies the selected reading typeface to the paginated text', async () => {
    await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》|继续阅读《雨夜书房》/ }))
    fireEvent.click(screen.getByRole('button', { name: '排版设置' }))

    fireEvent.change(screen.getByRole('combobox', { name: '字体' }), { target: { value: 'sans' } })

    expect(screen.getByRole('article')).toHaveStyle({ '--reader-font-family': 'var(--font-reading-sans)' })
  })

  it('uses the requested reading layout defaults', async () => {
    await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》|继续阅读《雨夜书房》/ }))

    expect(screen.getByRole('article')).toHaveStyle({
      '--reader-font-size': '19px',
      '--reader-line-height': '1.8',
      '--reader-margin': '8%',
    })
  })

  it('keeps the companion-note presentation in the explicit test fixture only', async () => {
    await renderWithRainRoom(true)
    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))

    const companionNote = await screen.findByText(/也许书并不知道，只是它替那一刻保留了一个位置/)
    expect(companionNote).toHaveClass('fish-note')
    expect(within(companionNote).getByText('小鱼')).toBeInTheDocument()
  })

  it('selects and extends a contiguous sentence range', async () => {
    await renderWithRainRoom()
    fireEvent.click(screen.getByRole('button', { name: /打开《雨夜书房》|继续阅读《雨夜书房》/ }))
    const firstSentence = await screen.findByText('灯亮起来以前，书房先听见了雨。')
    const secondSentence = await screen.findByText('它从屋檐最北边的一片瓦开始，沿着看不见的坡度慢慢走下来，敲过窗框，最后停在门前那块颜色较深的木头上。')

    fireEvent.click(firstSentence)
    expect(firstSentence).toHaveClass('is-selected')
    expect(screen.getByRole('toolbar', { name: '句子操作' })).toBeInTheDocument()

    fireEvent.click(secondSentence)
    expect(firstSentence).toHaveClass('is-selected')
    expect(secondSentence).toHaveClass('is-selected')

    fireEvent.click(firstSentence)
    expect(firstSentence).not.toHaveClass('is-selected')
    expect(secondSentence).toHaveClass('is-selected')

    fireEvent.click(screen.getByRole('article'))
    expect(screen.queryByRole('toolbar', { name: '句子操作' })).not.toBeInTheDocument()

    // 从这里开始每一次写入都要落 IndexedDB 再读回来，所以断言都得等一拍。
    fireEvent.click(firstSentence)
    fireEvent.click(screen.getByRole('button', { name: '划线' }))
    await waitFor(() => expect(firstSentence).toHaveClass('has-user-highlight'))
    expect(screen.queryByRole('toolbar', { name: '句子操作' })).not.toBeInTheDocument()

    fireEvent.click(firstSentence)
    expect(screen.getByRole('button', { name: '抹去' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '留痕' }))
    expect(screen.getByRole('dialog', { name: '留痕' }).querySelector('.note-quote .trace-line-highlight')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Thoughts...'), { target: { value: '雨声把这一句托住了。' } })
    fireEvent.click(screen.getByRole('button', { name: '留下' }))
    expect(await screen.findByText('雨声把这一句托住了。')).toBeInTheDocument()
    const sentDialog = screen.getByRole('dialog', { name: '重温批注' })
    expect(sentDialog.querySelector('.sent-note time')?.textContent).toMatch(/^\d{2}\/\d{2}\/\d{2}：\d{2}$/)
    fireEvent.change(screen.getByPlaceholderText('Thoughts...'), { target: { value: '后来又想起了窗外的风。' } })
    fireEvent.click(screen.getByRole('button', { name: '留下' }))
    expect(await screen.findByText('后来又想起了窗外的风。')).toBeInTheDocument()
    expect(sentDialog.querySelectorAll('.sent-note')).toHaveLength(2)
    fireEvent.click(document.querySelector('.note-backdrop') as HTMLElement)

    fireEvent.click(firstSentence)
    fireEvent.click(screen.getByRole('button', { name: '重温' }))
    fireEvent.click(screen.getAllByRole('button', { name: /批注操作/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '修订' }))
    expect(screen.getByPlaceholderText('Thoughts...')).toHaveValue('雨声把这一句托住了。')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('dialog', { name: '重温批注' })).toBeInTheDocument()
    fireEvent.click(document.querySelector('.note-backdrop') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '页边痕迹' }))

    const matchingTraces = Array.from(document.querySelectorAll('.trace-list blockquote'))
      .filter((element) => element.textContent?.includes('灯亮起来以前，书房先听见了雨。'))
    expect(matchingTraces).toHaveLength(1)
    expect(screen.getByText(/雨声把这一句托住了/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭页边痕迹' }))
    // 取消划线只删划线，批注留着：所以实线没了、批注虚线还在。
    fireEvent.click(firstSentence)
    fireEvent.click(screen.getByRole('button', { name: '抹去' }))
    await waitFor(() => expect(firstSentence).not.toHaveClass('has-user-highlight'))
    expect(firstSentence).toHaveClass('has-annotation')

    fireEvent.click(firstSentence)
    fireEvent.click(screen.getByRole('button', { name: '划线' }))
    await waitFor(() => expect(firstSentence).toHaveClass('has-user-highlight'))

    fireEvent.click(secondSentence)
    fireEvent.click(screen.getByRole('button', { name: '留痕' }))
    expect(screen.getByRole('dialog', { name: '留痕' }).querySelector('.note-quote .trace-line-annotation')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Thoughts...'), { target: { value: '这里只留下批注虚线。' } })
    fireEvent.click(screen.getByRole('button', { name: '留下' }))
    await waitFor(() => expect(secondSentence).toHaveClass('has-annotation'))
    expect(secondSentence).not.toHaveClass('has-user-highlight')
    fireEvent.click(screen.getByRole('button', { name: /批注操作/ }))
    fireEvent.click(screen.getByRole('button', { name: '抹去文字' }))
    await waitFor(() => expect(secondSentence).not.toHaveClass('has-annotation'))
  }, 10_000)
})
