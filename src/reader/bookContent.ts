import { getChapters } from '../data/local/bookStore'
import { extractChapterText, type ChapterText } from './chapterText'

export type { ChapterText }
import { rainRoomChapters } from './fixtures/rain-room-epub'

const sampleBookId = 'rain-room'

const ordinal = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function chapterLabel(index: number): string {
  if (index < ordinal.length) return `第${ordinal[index]}章`
  return `第${index + 1}章`
}

export const sampleChapters: ChapterText[] = rainRoomChapters.map((chapter) => ({
  chapter: chapter.label ?? chapterLabel(chapter.index),
  title: chapter.title,
  kicker: chapter.kicker,
  paragraphs: chapter.paragraphs,
  highlight: chapter.highlight,
}))

export async function loadBookChapters(bookId: string): Promise<ChapterText[]> {
  if (bookId === sampleBookId) return sampleChapters

  const chapters = await getChapters(bookId)
  if (chapters.length === 0) return []

  return chapters.map((chapter) => {
    const extracted = extractChapterText(chapter.html ?? '', chapter.title)
    return {
      chapter: chapterLabel(chapter.index),
      title: chapter.title,
      kicker: '',
      paragraphs: extracted.paragraphs,
    }
  })
}
