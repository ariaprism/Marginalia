import { createBook } from '../../domain/book'
import { parseEpub } from '../../reader/epubParser'
import { saveBook, saveChapters, saveEpubFile } from '../../data/local/bookStore'

export type ImportResult =
  | { ok: true; bookId: string }
  | { ok: false; message: string; details: string }

export async function importEpubFile(file: File): Promise<ImportResult> {
  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch (error) {
    return {
      ok: false,
      message: '这本书暂时无法打开',
      details: `读取文件失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let parsed
  try {
    parsed = await parseEpub(arrayBuffer)
  } catch (error) {
    return {
      ok: false,
      message: '这本书暂时无法打开',
      details: `解析 EPUB 失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (parsed.chapters.length === 0) {
    return {
      ok: false,
      message: '这本书暂时无法打开',
      details: '未找到可阅读的章节，请检查 EPUB 文件是否完整。',
    }
  }

  const bookId = crypto.randomUUID()
  const book = createBook({
    id: bookId,
    title: parsed.metadata.title || file.name.replace(/\.epub$/i, ''),
    author: parsed.metadata.author || '未知作者',
    language: parsed.metadata.language,
    description: parsed.metadata.description,
    source: 'marginalia',
    status: 'reading',
  })

  try {
    await saveBook(book)
    await saveEpubFile(bookId, file)
    await saveChapters(
      bookId,
      parsed.chapters.map((chapter) => ({
        id: chapter.id,
        index: chapter.index,
        title: chapter.title,
        href: chapter.href,
        html: chapter.html,
      })),
    )
  } catch (error) {
    return {
      ok: false,
      message: '这本书暂时无法打开',
      details: `保存到本地书库失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }

  return { ok: true, bookId }
}
