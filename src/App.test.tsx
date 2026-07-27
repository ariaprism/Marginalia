import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import { buildRainRoomEpub } from './reader/fixtures/rain-room-epub'

describe('Marginalia visual prototype', () => {
  it('opens a book room from the cover and continues into the reader', async () => {
    render(<App />)

    expect(screen.getByText('在正文之外，我们相遇。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看《雨夜书房》的书籍档案' }))
    fireEvent.click(screen.getByRole('button', { name: /一座只在雨夜出现的旧书房.*展开/ }))
    expect(screen.getByRole('dialog', { name: '雨夜书房' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭完整简介' }))

    fireEvent.click(await screen.findByRole('button', { name: /从这里继续/ }))
    expect(screen.getByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    expect(screen.getByLabelText(/第 1 页，共/)).toBeInTheDocument()
  })

  it('imports a real EPUB and reads its chapters from storage', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '雨夜书房.epub', { type: 'application/epub+zip' })

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(screen.getByText('已经藏入书架。')).toBeInTheDocument())

    // 导入后书架增加一条真书条目（进度0，aria-label 以「打开」开头）。
    const importedRow = await screen.findByRole('button', { name: /^打开《雨夜书房》/ })
    fireEvent.click(importedRow)

    // 正文来自 IndexedDB 里解析出的 XHTML，而不是内置示例数据。
    expect(await screen.findByRole('heading', { name: '雨先抵达' })).toBeInTheDocument()
    expect(screen.getByText(/灯亮起来以前，书房先听见了雨。/)).toBeInTheDocument()
    expect(screen.getByLabelText(/第 1 页，共/)).toBeInTheDocument()
  })

  it('keeps the sample book traces out of an imported book', async () => {
    const bytes = await buildRainRoomEpub()
    const file = new File([bytes.buffer as ArrayBuffer], '导入的书.epub', { type: 'application/epub+zip' })

    render(<App />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(screen.getByText('已经藏入书架。')).toBeInTheDocument())

    // 进入导入书的书房：示例书排在前面，导入的那本在后面。
    // 「藏入书架」的提示比书架重新载完早一步，所以要等到两本都在了再点第二本。
    await waitFor(async () => {
      expect(await screen.findAllByRole('button', { name: /查看《雨夜书房》的书籍档案/ })).toHaveLength(2)
    })
    const importedCover = screen.getAllByRole('button', { name: /查看《雨夜书房》的书籍档案/ })[1]
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

  it('keeps a highlight and its note after the app is reloaded', async () => {
    const { unmount } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续阅读《雨夜书房》/ }))

    const sentence = screen.getByText('灯亮起来以前，书房先听见了雨。')
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
    fireEvent.click(screen.getByRole('button', { name: /继续阅读《雨夜书房》/ }))

    const reloaded = await screen.findByText('灯亮起来以前，书房先听见了雨。')
    await waitFor(() => expect(reloaded).toHaveClass('has-user-highlight'))
    fireEvent.click(screen.getByRole('article'))
    fireEvent.click(screen.getByRole('button', { name: '页边痕迹' }))
    expect(screen.getByText(/这一句要留到下次打开/)).toBeInTheDocument()
  })

  it('filters the mobile-friendly shelf', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /已读完/ }))
    expect(screen.getAllByText('玻璃温室里的冬天')).toHaveLength(2)
    expect(screen.queryByText('雨夜书房')).not.toBeInTheDocument()
  })

  it('toggles between the detailed list and the three-column cover shelf', () => {
    render(<App />)
    expect(screen.getAllByText('雨夜书房')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '切换为封面书架' }))

    expect(screen.getByRole('region', { name: '封面书架' })).toBeInTheDocument()
    expect(screen.getAllByText('雨夜书房')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '切换为列表书架' })).toBeInTheDocument()
  })

  it('applies the selected reading typeface to the paginated text', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续阅读《雨夜书房》/ }))
    fireEvent.click(screen.getByRole('button', { name: '排版设置' }))

    fireEvent.change(screen.getByRole('combobox', { name: '字体' }), { target: { value: 'sans' } })

    expect(screen.getByRole('article')).toHaveStyle({ '--reader-font-family': 'var(--font-reading-sans)' })
  })

  it('shows a quiet trace card without chapter chrome or footer actions', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续阅读《雨夜书房》/ }))
    // 预置痕迹是启动时播种进 IndexedDB 的，要等它读回来才有批注可看。
    await waitFor(() => expect(document.querySelector('.has-user-highlight')).toBeInTheDocument())
    fireEvent.click(screen.getByText('句子需要重量'))

    const dialog = screen.getByRole('dialog', { name: '划线详情' })
    expect(dialog).toHaveStyle({ '--trace-font-family': 'var(--font-reading-serif)' })
    expect(dialog.querySelector('.trace-line-highlight')).toBeInTheDocument()
    expect(within(dialog).getByText('07/14/18：47')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '关闭划线详情' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '更换颜色' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /批注操作/ }))
    expect(within(dialog).getByRole('button', { name: '修订' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: '修订' }))
    const reviseDialog = screen.getByRole('dialog', { name: '重温批注' })
    expect(reviseDialog).toHaveStyle({ '--trace-font-family': 'var(--font-reading-serif)' })
    expect(reviseDialog.querySelector('.note-quote .trace-line-highlight')).toBeInTheDocument()
    fireEvent.click(document.querySelector('.note-backdrop') as HTMLElement)
    expect(screen.queryByRole('dialog', { name: '重温批注' })).not.toBeInTheDocument()
  })

  it('selects and extends a contiguous sentence range', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /继续阅读《雨夜书房》/ }))
    const firstSentence = screen.getByText('灯亮起来以前，书房先听见了雨。')
    const secondSentence = screen.getByText('它从屋檐最北边的一片瓦开始，沿着看不见的坡度慢慢走下来，敲过窗框，最后停在门前那块颜色较深的木头上。')

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
  })
})
