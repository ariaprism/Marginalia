import { saveBook, saveChapters, saveEpubFile } from '../../data/local/bookStore'
import { createBook, type BookCoverTone } from '../../domain/book'
import { parseEpub, type EpubChapter, type EpubMetadata } from '../../reader/epubParser'
import { newId } from '../../shared/id'

export type PreparedEpubImport = {
  file: File
  metadata: EpubMetadata
  chapters: EpubChapter[]
  embeddedCoverUrl?: string
}

export type ImportBookDetails = {
  title: string
  englishTitle?: string
  author: string
  description?: string
  coverUrl?: string
  coverTone: BookCoverTone
}

export type PrepareImportResult =
  | { ok: true; prepared: PreparedEpubImport }
  | { ok: false; message: string; details: string }

export type ImportResult =
  | { ok: true; bookId: string }
  | { ok: false; message: string; details: string }

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取封面图片'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mediaType }))
  })
}

export function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('无法读取封面图片'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

/** 只解析成可编辑草稿，不写入书库。 */
export async function prepareEpubFile(file: File): Promise<PrepareImportResult> {
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

  let embeddedCoverUrl: string | undefined
  if (parsed.cover) {
    try {
      embeddedCoverUrl = await bytesToDataUrl(parsed.cover.bytes, parsed.cover.mediaType)
    } catch {
      // 封面坏掉不应阻止藏书；弹窗会自动退回 Marginalia 内部封面。
    }
  }

  return {
    ok: true,
    prepared: {
      file,
      metadata: parsed.metadata,
      chapters: parsed.chapters,
      embeddedCoverUrl,
    },
  }
}

/** 用户确认弹窗后，才把书籍、原文件和章节一起写进本地书库。 */
export async function savePreparedEpub(
  prepared: PreparedEpubImport,
  details: ImportBookDetails,
): Promise<ImportResult> {
  const bookId = newId()
  const book = createBook({
    id: bookId,
    title: details.title.trim(),
    englishTitle: details.englishTitle?.trim() || undefined,
    author: details.author.trim() || '未知作者',
    language: prepared.metadata.language,
    description: details.description?.trim() || undefined,
    coverUrl: details.coverUrl,
    coverTone: details.coverTone,
    source: 'marginalia',
    status: 'wish',
  })

  try {
    await saveBook(book)
    await saveEpubFile(bookId, prepared.file)
    await saveChapters(
      bookId,
      prepared.chapters.map((chapter) => ({
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

/** 保留无弹窗调用路径，供底层测试和未来批量导入复用。 */
export async function importEpubFile(file: File): Promise<ImportResult> {
  const result = await prepareEpubFile(file)
  if (!result.ok) return result
  const { prepared } = result
  return savePreparedEpub(prepared, {
    title: prepared.metadata.title || file.name.replace(/\.epub$/i, ''),
    author: prepared.metadata.author || '未知作者',
    description: prepared.metadata.description,
    coverUrl: prepared.embeddedCoverUrl,
    coverTone: 'rose',
  })
}
