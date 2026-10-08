import { describe, expect, it } from 'vitest'
import { createLocator } from '../../domain/locator'
import type { ReaderProgress, ReaderState } from '../../domain/reader'
import {
  clearReadersForBook,
  getReaderProgress,
  getReaderState,
  getReaderTraces,
  resetReadersForBook,
  saveReaderSession,
  saveReaderTrace,
} from './readerStore'

function session(readerId: string, bookId = 'book-1', text = '雨落在窗上。') {
  const updatedAt = '2026-09-22T08:00:00.000Z'
  const progress: ReaderProgress = {
    readerId,
    bookId,
    locator: createLocator(bookId, {
      chapterIndex: 1,
      elementPath: [2],
      textOffset: 3,
      selectedText: text,
      beforeContext: '此前',
      afterContext: '此后',
    }),
    updatedAt,
  }
  const state: ReaderState = {
    readerId,
    bookId,
    understanding: '这本书在慢慢改变观看雨的方式。',
    feeling: '安静，但有一点不安。',
    questions: ['灯为什么总在雨后亮起？'],
    attention: ['窗', '雨声'],
    updatedAt,
  }
  return { progress, state }
}

describe('readerStore', () => {
  it('原子保存并读回同一个读者的一次合书状态', async () => {
    const { progress, state } = session('xiaoyu')
    await saveReaderSession(progress, state)

    await expect(getReaderProgress('xiaoyu', 'book-1')).resolves.toEqual(progress)
    await expect(getReaderState('xiaoyu', 'book-1')).resolves.toEqual(state)
  })

  it('按 readerId 隔离同一本书的位置与状态', async () => {
    const fish = session('xiaoyu')
    const fox = session('aria', 'book-1', '另一处文字。')
    await saveReaderSession(fish.progress, fish.state)
    await saveReaderSession(fox.progress, fox.state)

    expect((await getReaderProgress('xiaoyu', 'book-1'))?.locator.position.selectedText).toBe('雨落在窗上。')
    expect((await getReaderProgress('aria', 'book-1'))?.locator.position.selectedText).toBe('另一处文字。')
  })

  it('拒绝把不同读者或不同书的位置与状态拼成一次合书', async () => {
    const fish = session('xiaoyu')
    const fox = session('aria')
    await expect(saveReaderSession(fish.progress, fox.state)).rejects.toThrow('不属于同一次阅读')
    await expect(getReaderProgress('xiaoyu', 'book-1')).resolves.toBeUndefined()
  })

  it('同一本书的读者痕迹按 readerId 隔离', async () => {
    const { progress } = session('xiaoyu')
    await saveReaderTrace({
      id: 'trace-fish', readerId: 'xiaoyu', bookId: 'book-1', kind: 'annotation',
      locator: progress.locator, text: '雨声像一种提醒。', createdAt: '2026-09-22T08:01:00.000Z',
    })
    await saveReaderTrace({
      id: 'trace-fox', readerId: 'aria', bookId: 'book-1', kind: 'highlight',
      locator: progress.locator, createdAt: '2026-09-22T08:02:00.000Z',
    })

    expect((await getReaderTraces('xiaoyu', 'book-1')).map((trace) => trace.id)).toEqual(['trace-fish'])
    expect((await getReaderTraces('aria', 'book-1')).map((trace) => trace.id)).toEqual(['trace-fox'])
  })

  it('从头重读会清除本书所有共读者的位置与状态，但保留痕迹', async () => {
    const fish = session('xiaoyu')
    const g = session('xiaog')
    const other = session('xiaog', 'book-2')
    await saveReaderSession(fish.progress, fish.state)
    await saveReaderSession(g.progress, g.state)
    await saveReaderSession(other.progress, other.state)
    await saveReaderTrace({
      id: 'trace-kept', readerId: 'xiaog', bookId: 'book-1', kind: 'annotation',
      locator: g.progress.locator, text: '这一句还要留下。', createdAt: '2026-09-22T08:03:00.000Z',
    })

    await resetReadersForBook('book-1')

    await expect(getReaderProgress('xiaoyu', 'book-1')).resolves.toBeUndefined()
    await expect(getReaderState('xiaog', 'book-1')).resolves.toBeUndefined()
    await expect(getReaderTraces('xiaog', 'book-1')).resolves.toHaveLength(1)
    await expect(getReaderProgress('xiaog', 'book-2')).resolves.toEqual(other.progress)
  })

  it('全部清除会移除本书的共读者位置、状态和痕迹，不碰其他书', async () => {
    const current = session('xiaog')
    const other = session('xiaog', 'book-2')
    await saveReaderSession(current.progress, current.state)
    await saveReaderSession(other.progress, other.state)
    await saveReaderTrace({
      id: 'trace-cleared', readerId: 'xiaog', bookId: 'book-1', kind: 'highlight',
      locator: current.progress.locator, createdAt: '2026-09-22T08:04:00.000Z',
    })

    await clearReadersForBook('book-1')

    await expect(getReaderProgress('xiaog', 'book-1')).resolves.toBeUndefined()
    await expect(getReaderState('xiaog', 'book-1')).resolves.toBeUndefined()
    await expect(getReaderTraces('xiaog', 'book-1')).resolves.toEqual([])
    await expect(getReaderState('xiaog', 'book-2')).resolves.toEqual(other.state)
  })
})
