import JSZip from 'jszip'

export type EpubMetadata = {
  title: string
  author: string
  language: string
  identifier: string
  description?: string
}

export type EpubTocItem = {
  label: string
  href: string
}

export type EpubChapter = {
  id: string
  index: number
  title: string
  href: string
  /** 章节 XHTML 原始字符串。 */
  html: string
}

export type ParsedEpub = {
  metadata: EpubMetadata
  toc: EpubTocItem[]
  chapters: EpubChapter[]
}

function decodeText(bytes: Uint8Array): string {
  // 简单做法：先尝试 UTF-8；绝大多数 EPUB 使用 UTF-8。
  // 后续如果遇见非 UTF-8 编码，再用 content.opf 中的 charset 声明处理。
  const decoder = new TextDecoder('utf-8', { fatal: false })
  return decoder.decode(bytes)
}

function findOpfPath(containerXml: string): string | undefined {
  const match = containerXml.match(/full-path=["']([^"']+)["']/)
  return match?.[1]
}

function parseContentOpf(opfXml: string) {
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/i)
  const creatorMatch = opfXml.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/i)
  const languageMatch = opfXml.match(/<dc:language[^>]*>([^<]*)<\/dc:language>/i)
  const identifierMatch = opfXml.match(/<dc:identifier[^>]*>([^<]*)<\/dc:identifier>/i)
  const descriptionMatch = opfXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i)

  const manifest = new Map<string, string>()
  const manifestRegex = /<item[^>]*id=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi
  let manifestMatch: RegExpExecArray | null
  while ((manifestMatch = manifestRegex.exec(opfXml)) !== null) {
    manifest.set(manifestMatch[1], manifestMatch[2])
  }

  const spine: string[] = []
  const spineRegex = /<itemref[^>]*idref=["']([^"']+)["'][^>]*\/?>/gi
  let spineMatch: RegExpExecArray | null
  while ((spineMatch = spineRegex.exec(opfXml)) !== null) {
    spine.push(spineMatch[1])
  }

  return {
    title: titleMatch?.[1].trim() ?? '',
    author: creatorMatch?.[1].trim() ?? '',
    language: languageMatch?.[1].trim() ?? 'und',
    identifier: identifierMatch?.[1].trim() ?? '',
    description: descriptionMatch?.[1].trim(),
    manifest,
    spine,
  }
}

function parseNavHtml(navHtml: string): EpubTocItem[] {
  const items: EpubTocItem[] = []
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = anchorRegex.exec(navHtml)) !== null) {
    const href = match[1].trim()
    const label = match[2].replace(/<[^>]+>/g, '').trim()
    if (label) items.push({ label, href })
  }
  return items
}

function parseChapterTitle(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1Match) return h1Match[1].replace(/<[^>]+>/g, '').trim()
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return titleMatch?.[1].trim() ?? ''
}

export async function parseEpub(input: ArrayBuffer | Uint8Array): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(input)

  const containerFile = zip.file('META-INF/container.xml')
  if (!containerFile) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml')
  }
  const containerXml = await containerFile.async('uint8array')
  const opfPath = findOpfPath(decodeText(containerXml))
  if (!opfPath) {
    throw new Error('Invalid EPUB: cannot find content.opf path')
  }

  const opfFile = zip.file(opfPath)
  if (!opfFile) {
    throw new Error(`Invalid EPUB: missing ${opfPath}`)
  }
  const opfXml = decodeText(await opfFile.async('uint8array'))
  const opf = parseContentOpf(opfXml)
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const tocHref = opf.manifest.get('toc') ?? opf.manifest.get('nav')
  let toc: EpubTocItem[] = []
  if (tocHref) {
    const tocFile = zip.file(`${opfDir}${tocHref}`)
    if (tocFile) {
      const tocHtml = decodeText(await tocFile.async('uint8array'))
      toc = parseNavHtml(tocHtml)
    }
  }

  const chapters: EpubChapter[] = []
  for (const [index, idref] of opf.spine.entries()) {
    const href = opf.manifest.get(idref)
    if (!href) continue

    const chapterFile = zip.file(`${opfDir}${href}`)
    if (!chapterFile) continue

    const html = decodeText(await chapterFile.async('uint8array'))
    const title = toc[index]?.label ?? parseChapterTitle(html) ?? idref
    chapters.push({ id: idref, index, title, href, html })
  }

  return {
    metadata: {
      title: opf.title,
      author: opf.author,
      language: opf.language,
      identifier: opf.identifier,
      description: opf.description,
    },
    toc,
    chapters,
  }
}
