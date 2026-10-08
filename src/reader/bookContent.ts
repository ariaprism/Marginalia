import { getChapters, getEpubFile, saveChapters } from '../data/local/bookStore'
import { extractChapterText, type ChapterText } from './chapterText'
import { parseEpub } from './epubParser'

export type { ChapterText }
import { rainRoomChapters } from './fixtures/rain-room-epub'

const ordinal = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function chapterLabel(index: number): string {
  if (index < ordinal.length) return `第${ordinal[index]}章`
  return `第${index + 1}章`
}

/** 只供自动测试与开发夹具使用，不再进入正式书架。 */
export const sampleChapters: ChapterText[] = rainRoomChapters.map((chapter) => ({
  chapter: chapter.label ?? chapterLabel(chapter.index),
  title: chapter.title,
  kicker: chapter.kicker,
  paragraphs: chapter.paragraphs,
  openingParagraphIndex: 0,
  highlight: chapter.highlight,
}))

export async function loadBookChapters(bookId: string): Promise<ChapterText[]> {
  let chapters = await getChapters(bookId)
  if (chapters.length === 0) return []

  // 旧入库记录没有 toc/spine 区分。若原 EPUB 仍在，就地重解析一次并按稳定
  // spine 下标补齐语义；不改章节 id，也不影响已有 Locator、折页或痕迹。
  if (chapters.some((chapter) => chapter.inToc === undefined)) {
    try {
      const epubFile = await getEpubFile(bookId)
      if (epubFile) {
        const reparsed = await parseEpub(await epubFile.arrayBuffer())
        if (reparsed.chapters.length === chapters.length) {
          chapters = chapters.map((chapter, index) => ({
            ...chapter,
            inToc: reparsed.chapters[index].inToc,
            html: reparsed.chapters[index].html,
          }))
          await saveChapters(bookId, chapters)
        }
      }
    } catch {
      // 旧书仍保持可读；只有目录语义暂时沿用兼容行为。
    }
  }

  return chapters.map((chapter) => {
    const label = ''
    const extracted = extractChapterText(chapter.html ?? '', chapter.title, label)
    return {
      chapter: label,
      title: chapter.title,
      inToc: chapter.inToc ?? true,
      kicker: '',
      paragraphs: extracted.paragraphs,
      hiddenParagraphIndexes: extracted.hiddenParagraphIndexes,
      openingParagraphIndex: extracted.openingParagraphIndex,
    }
  })
}
