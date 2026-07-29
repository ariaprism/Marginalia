import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseEpub } from './epubParser'

const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function chapterXhtml(heading: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${heading}</title></head>
  <body><h1>${heading}</h1>${body}</body>
</html>`
}

async function buildEpub(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }
  return zip.generateAsync({ type: 'uint8array' })
}

describe('epubParser · 现实世界 EPUB 变体', () => {
  it('extracts an EPUB 3 cover-image from the manifest', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:cover3</dc:identifier>
    <dc:title>带封面的书</dc:title>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="cover-image" href="images/front.png" media-type="image/png" properties="cover-image"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
      'OEBPS/images/front.png': 'epub-three-cover',
      'OEBPS/c1.xhtml': chapterXhtml('正文', '<p>正文。</p>'),
    })

    const epub = await parseEpub(bytes)
    expect(epub.cover?.mediaType).toBe('image/png')
    expect(new TextDecoder().decode(epub.cover!.bytes)).toBe('epub-three-cover')
  })

  it('extracts an EPUB 2 cover referenced by metadata', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:cover2</dc:identifier>
    <dc:title>旧版封面的书</dc:title>
    <dc:language>zh</dc:language>
    <meta name="cover" content="front"/>
  </metadata>
  <manifest>
    <item id="front" href="front.jpg" media-type="image/jpeg"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
      'OEBPS/front.jpg': 'epub-two-cover',
      'OEBPS/c1.xhtml': chapterXhtml('正文', '<p>正文。</p>'),
    })

    const epub = await parseEpub(bytes)
    expect(epub.cover?.mediaType).toBe('image/jpeg')
    expect(new TextDecoder().decode(epub.cover!.bytes)).toBe('epub-two-cover')
  })

  it('manifest 里 href 写在 id 之前也能解析出章节', async () => {
    // 旧实现的正则要求 id 必须在 href 之前，这类文件会静默丢掉全部章节。
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:reversed</dc:identifier>
    <dc:title>属性顺序颠倒的书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item media-type="application/xhtml+xml" href="c1.xhtml" id="c1"/>
    <item href="c2.xhtml" media-type="application/xhtml+xml" id="c2"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`,
      'OEBPS/c1.xhtml': chapterXhtml('第一节', '<p>第一节正文。</p>'),
      'OEBPS/c2.xhtml': chapterXhtml('第二节', '<p>第二节正文。</p>'),
    })

    const epub = await parseEpub(bytes)
    expect(epub.metadata.title).toBe('属性顺序颠倒的书')
    expect(epub.chapters.map((chapter) => chapter.title)).toEqual(['第一节', '第二节'])
  })

  it('EPUB 2 只有 toc.ncx 时也能取到章节标题', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:epub2</dc:identifier>
    <dc:title>旧版格式的书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
  </spine>
</package>`,
      'OEBPS/toc.ncx': `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1" playOrder="1">
      <navLabel><text>目录里的章节名</text></navLabel>
      <content src="text/c1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
      'OEBPS/text/c1.xhtml': chapterXhtml('文件里的标题', '<p>正文。</p>'),
    })

    const epub = await parseEpub(bytes)
    // NCX 里的标题优先于文件内的 h1
    expect(epub.chapters[0].title).toBe('目录里的章节名')
    // NCX 本身不能被当成正文章节
    expect(epub.chapters).toHaveLength(1)
  })

  it('目录 href 带 #fragment、且顺序与 spine 不一致时仍能正确配对', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:fragments</dc:identifier>
    <dc:title>目录乱序的书</dc:title>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="a" href="text/a.xhtml" media-type="application/xhtml+xml"/>
    <item id="b" href="text/b.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="a"/>
    <itemref idref="b"/>
  </spine>
</package>`,
      // 目录顺序故意与 spine 相反，并且带 fragment
      'OEBPS/nav.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>目录</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="text/b.xhtml#start">乙章</a></li>
        <li><a href="text/a.xhtml#start">甲章</a></li>
      </ol>
    </nav>
  </body>
</html>`,
      'OEBPS/text/a.xhtml': chapterXhtml('A 的文件标题', '<p>甲。</p>'),
      'OEBPS/text/b.xhtml': chapterXhtml('B 的文件标题', '<p>乙。</p>'),
    })

    const epub = await parseEpub(bytes)
    // 按 spine 顺序排列，但标题来自各自对应的目录条目
    expect(epub.chapters.map((chapter) => chapter.title)).toEqual(['甲章', '乙章'])
  })

  it('跳过 spine 中非正文的 media-type，且缺失文件不致命', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:test:mixed</dc:identifier>
    <dc:title>混杂条目的书</dc:title>
    <dc:language>zh</dc:language>
  </metadata>
  <manifest>
    <item id="cover" href="cover.jpg" media-type="image/jpeg"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="missing" href="nowhere.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="c1"/>
    <itemref idref="missing"/>
    <itemref idref="c2"/>
  </spine>
</package>`,
      'OEBPS/c1.xhtml': chapterXhtml('一', '<p>一。</p>'),
      'OEBPS/c2.xhtml': chapterXhtml('二', '<p>二。</p>'),
    })

    const epub = await parseEpub(bytes)
    expect(epub.chapters.map((chapter) => chapter.title)).toEqual(['一', '二'])
    // index 连续，不因跳过的条目留空洞
    expect(epub.chapters.map((chapter) => chapter.index)).toEqual([0, 1])
  })
})
