import JSZip from 'jszip'

export type RainRoomChapter = {
  id: string
  index: number
  title: string
  kicker: string
  paragraphs: string[]
}

export const rainRoomChapters: RainRoomChapter[] = [
  {
    id: 'chapter1',
    index: 0,
    title: '雨先抵达',
    kicker: 'The rain arrived first',
    paragraphs: [
      '灯亮起来以前，书房先听见了雨。它从屋檐最北边的一片瓦开始，沿着看不见的坡度慢慢走下来，敲过窗框，最后停在门前那块颜色较深的木头上。',
      '那时城里的人都已习惯把没有说完的话留在亮着的屏幕里。只有这间书房仍旧相信，句子需要重量：一张纸的重量，一滴墨水的重量，或者一个人把书合上以后，手掌在封面上多停留片刻的重量。',
      '守书人把最后一盏灯调暗。他知道今晚会有人来，因为靠窗第三排的书，刚刚无风地向外挪了一寸。',
    ],
  },
  {
    id: 'chapter2',
    index: 1,
    title: '没有寄出的页码',
    kicker: 'Pages without an address',
    paragraphs: [
      '女孩是在十一点四十分推门进来的。她的伞骨折了一根，雨水顺着袖口落下来，在地板上留下六枚深色的圆点。',
      '“我想找一本书，”她说，“但我不知道书名。”',
      '守书人没有问作者，也没有问故事。他只是从柜台下面取出一只黄铜书签，放到她掌心：“那么，告诉我你忘不掉的那一句。”',
      '她想了很久。窗外的雨在这段沉默里换了一种下法。后来她说：“我只记得，读到它的时候，我以为有人提前知道了我的心事。”',
    ],
  },
  {
    id: 'chapter3',
    index: 2,
    title: '书页背面的房间',
    kicker: 'The room behind the page',
    paragraphs: [
      '他们沿着书架向里走。每经过一排，外面的雨声就远一点，而纸张翻动的声音就近一点。书架尽头没有墙，只有一页竖立着的、微微发亮的纸。',
      '女孩把黄铜书签贴上去，纸页便从中间打开。另一边是一间更小的房间，一张桌子，两把椅子，桌上摊着同一本书。',
      '其中一把椅子上有刚刚起身的温度。书的页边留着一行很淡的字：我没有在这里等你，我只是恰好比你早到了一会儿。',
    ],
  },
  {
    id: 'chapter4',
    index: 3,
    title: '替沉默装订',
    kicker: 'Binding the silences',
    paragraphs: [
      '女孩没有立刻坐下。她先翻过那些写了字的页边，又翻过更多什么也没有留下的空白。奇怪的是，空白并不比文字轻。',
      '有些人来到书里，是为了回答；有些人只是把同一句话读得更慢。书房从不把后一种来访算作缺席。',
      '守书人取来针线，把一小段沉默缝进书脊。线是雾粉色的，只有在灯光偏向黄昏的时候才看得见。',
    ],
  },
  {
    id: 'chapter5',
    index: 4,
    title: '天亮以后',
    kicker: 'After the lamps went out',
    paragraphs: [
      '雨在凌晨四点停下。女孩离开时没有带走那本书，只带走了夹在其中的一页。',
      '第二天早晨，城市的窗户一扇接一扇亮起来。没有人知道昨夜多出了一间书房，也没有人知道某本书的未来页上，已经提前留下了一行字。',
      '但当女孩再次翻到那里，她会看见纸页右下角有一点旧灯的颜色。那不是提醒，也不是等待回答的消息。那只是一个人曾在不同的时间，从这里经过。',
    ],
  },
]

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildChapterHtml(chapter: RainRoomChapter): string {
  const paragraphs = chapter.paragraphs
    .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
    .join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeXml(chapter.title)}</title>
  </head>
  <body>
    <section id="${chapter.id}" epub:type="chapter">
      <h1>${escapeXml(chapter.title)}</h1>
      <p class="kicker">${escapeXml(chapter.kicker)}</p>
      ${paragraphs}
    </section>
  </body>
</html>`
}

function buildTocHtml(chapters: RainRoomChapter[]): string {
  const items = chapters
    .map((chapter) => `<li><a href="${chapter.id}.xhtml">${escapeXml(chapter.title)}</a></li>`)
    .join('\n        ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>目录</title>
  </head>
  <body>
    <nav epub:type="toc">
      <ol>
        ${items}
      </ol>
    </nav>
  </body>
</html>`
}

function buildContentOpf(chapters: RainRoomChapter[]): string {
  const manifestItems = chapters
    .map((chapter) => `    <item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n')
  const spineItems = chapters
    .map((chapter) => `    <itemref idref="${chapter.id}"/>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:marginalia:rain-room</dc:identifier>
    <dc:title>雨夜书房</dc:title>
    <dc:creator>小G</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`
}

const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

export async function buildRainRoomEpub(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)

  const oebps = zip.folder('OEBPS')!
  oebps.file('content.opf', buildContentOpf(rainRoomChapters))
  oebps.file('toc.xhtml', buildTocHtml(rainRoomChapters))
  for (const chapter of rainRoomChapters) {
    oebps.file(`${chapter.id}.xhtml`, buildChapterHtml(chapter))
  }

  return zip.generateAsync({ type: 'uint8array' })
}
