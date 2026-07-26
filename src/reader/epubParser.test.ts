import { describe, expect, it } from 'vitest'
import { buildRainRoomEpub, rainRoomChapters } from './fixtures/rain-room-epub'
import { parseEpub } from './epubParser'

describe('epubParser', () => {
  it('parses the synthetic rain-room EPUB', async () => {
    const bytes = await buildRainRoomEpub()
    const epub = await parseEpub(bytes)

    expect(epub.metadata.title).toBe('雨夜书房')
    expect(epub.metadata.author).toBe('小G')
    expect(epub.metadata.language).toBe('zh-CN')

    expect(epub.toc).toHaveLength(rainRoomChapters.length)
    expect(epub.toc[0].label).toBe('雨先抵达')

    expect(epub.chapters).toHaveLength(rainRoomChapters.length)
    expect(epub.chapters[0].title).toBe('雨先抵达')
    expect(epub.chapters[0].html).toContain('灯亮起来以前，书房先听见了雨')
  })

  it('orders chapters by spine', async () => {
    const bytes = await buildRainRoomEpub()
    const epub = await parseEpub(bytes)

    const titles = epub.chapters.map((chapter) => chapter.title)
    expect(titles).toEqual(rainRoomChapters.map((chapter) => chapter.title))
  })
})
