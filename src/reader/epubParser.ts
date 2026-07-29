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
  cover?: {
    bytes: Uint8Array
    mediaType: string
  }
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

export type ManifestItem = {
  id: string
  href: string
  mediaType: string
  properties: string
}

/** 按 localName 取子元素，忽略命名空间前缀（dc: / opf: / 无前缀都能命中）。 */
function childrenByLocalName(root: Element | Document, localName: string): Element[] {
  return Array.from(root.getElementsByTagName('*'))
    .filter((element) => (element.localName ?? element.tagName).toLowerCase() === localName)
}

function textOfFirst(root: Element | Document, localName: string): string {
  return childrenByLocalName(root, localName)[0]?.textContent?.trim() ?? ''
}

/**
 * 解析 content.opf。
 *
 * 用 DOMParser 而不是正则：EPUB 规范不限制属性顺序，
 * `<item href=".." id=".."/>` 和 `<item id=".." href=".."/>` 都合法，
 * 靠正则匹配固定顺序会静默丢掉整批 manifest 条目。
 */
function parseContentOpf(opfXml: string) {
  const doc = new DOMParser().parseFromString(opfXml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid EPUB: content.opf is not well-formed XML')
  }

  const manifest = new Map<string, ManifestItem>()
  for (const item of childrenByLocalName(doc, 'item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      id,
      href,
      mediaType: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    })
  }

  const spine = childrenByLocalName(doc, 'itemref')
    .map((itemref) => itemref.getAttribute('idref'))
    .filter((idref): idref is string => Boolean(idref))

  const coverId = childrenByLocalName(doc, 'meta')
    .find((meta) => meta.getAttribute('name')?.toLowerCase() === 'cover')
    ?.getAttribute('content') ?? undefined

  return {
    title: textOfFirst(doc, 'title'),
    author: textOfFirst(doc, 'creator'),
    language: textOfFirst(doc, 'language') || 'und',
    identifier: textOfFirst(doc, 'identifier'),
    description: textOfFirst(doc, 'description') || undefined,
    manifest,
    spine,
    coverId,
  }
}

/** 解析 EPUB 3 的导航文档（nav[epub:type=toc] 里的 <a>）。 */
function parseNavHtml(navHtml: string): EpubTocItem[] {
  const parser = new DOMParser()
  let doc = parser.parseFromString(navHtml, 'application/xhtml+xml')
  if (doc.querySelector('parsererror') || !doc.body) {
    doc = parser.parseFromString(navHtml, 'text/html')
  }

  // 优先取标注为 toc 的那个 nav；取不到就退回整篇文档的链接。
  const navs = Array.from(doc.getElementsByTagName('nav'))
  const tocNav = navs.find((nav) =>
    (nav.getAttribute('epub:type') ?? nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type')) === 'toc')
  const scope: Element | Document = tocNav ?? doc

  return Array.from(scope.getElementsByTagName('a'))
    .map((anchor) => ({
      label: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
      href: (anchor.getAttribute('href') ?? '').trim(),
    }))
    .filter((item) => item.label && item.href)
}

/** 解析 EPUB 2 的 toc.ncx，很多旧书只有这个。 */
function parseNcx(ncxXml: string): EpubTocItem[] {
  const doc = new DOMParser().parseFromString(ncxXml, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  return childrenByLocalName(doc, 'navpoint')
    .map((navPoint) => ({
      label: (childrenByLocalName(navPoint, 'text')[0]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      href: (childrenByLocalName(navPoint, 'content')[0]?.getAttribute('src') ?? '').trim(),
    }))
    .filter((item) => item.label && item.href)
}

/** 去掉 href 上的 #fragment 与 ?query，只留文件路径。 */
function hrefPath(href: string): string {
  return decodeURIComponent(href.split('#')[0].split('?')[0])
}

/** 把相对 href 解析成 zip 内的绝对路径，处理 ./ 与 ../ */
function resolvePath(baseDir: string, href: string): string {
  const segments = `${baseDir}${hrefPath(href)}`.split('/')
  const resolved: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') resolved.pop()
    else resolved.push(segment)
  }
  return resolved.join('/')
}

/** EPUB 正文的 media-type，用来把 NCX、图片之类排除在 spine 之外。 */
const READABLE_MEDIA_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
  'application/x-dtbook+xml',
])

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

  // 目录：优先 EPUB 3 的 properties="nav"，退回 EPUB 2 的 toc.ncx。
  const navItem = [...opf.manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'))
  const ncxItem = [...opf.manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml')

  let toc: EpubTocItem[] = []
  let tocDir = opfDir
  const tocItem = navItem ?? ncxItem
  if (tocItem) {
    const tocPath = resolvePath(opfDir, tocItem.href)
    const tocFile = zip.file(tocPath)
    if (tocFile) {
      const tocSource = decodeText(await tocFile.async('uint8array'))
      toc = navItem ? parseNavHtml(tocSource) : parseNcx(tocSource)
      tocDir = tocPath.includes('/') ? tocPath.slice(0, tocPath.lastIndexOf('/') + 1) : ''
    }
  }

  // 目录条目按解析后的绝对路径建索引，而不是按下标和 spine 硬配对
  // ——目录顺序与 spine 顺序不保证一致，也可能只覆盖部分章节。
  const titleByPath = new Map<string, string>()
  for (const item of toc) {
    const path = resolvePath(tocDir, item.href)
    if (!titleByPath.has(path)) titleByPath.set(path, item.label)
  }

  const chapters: EpubChapter[] = []
  for (const idref of opf.spine) {
    const item = opf.manifest.get(idref)
    if (!item) continue
    if (item.mediaType && !READABLE_MEDIA_TYPES.has(item.mediaType)) continue

    const path = resolvePath(opfDir, item.href)
    const chapterFile = zip.file(path)
    if (!chapterFile) continue

    const html = decodeText(await chapterFile.async('uint8array'))
    const index = chapters.length
    const title = titleByPath.get(path) || parseChapterTitle(html) || `第 ${index + 1} 节`
    chapters.push({ id: idref, index, title, href: item.href, html })
  }

  const manifestItems = Array.from(opf.manifest.values())
  const coverItem = manifestItems.find((item) =>
    item.properties.split(/\s+/).includes('cover-image'))
    ?? (opf.coverId ? opf.manifest.get(opf.coverId) : undefined)
    ?? manifestItems.find((item) =>
      item.mediaType.startsWith('image/')
      && (item.id.toLowerCase() === 'cover' || /(?:^|[/_.-])cover(?:[/_.-]|$)/i.test(item.href)))

  let cover: ParsedEpub['cover']
  if (coverItem) {
    const coverFile = zip.file(resolvePath(opfDir, coverItem.href))
    if (coverFile) {
      cover = {
        bytes: await coverFile.async('uint8array'),
        mediaType: coverItem.mediaType || 'image/jpeg',
      }
    }
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
    cover,
  }
}
