import { locatorFromSentenceRange, segmentChapters, type SegmentedChapter } from '../../reader/sentenceAnchor'
import { sampleChapters } from '../../reader/bookContent'
import { deleteBookCompletely, getAnnotations, getBook, getHighlights } from './bookStore'
import { persistHighlight, persistNote, persistReply } from './traceStore'

/**
 * 示例书《雨夜书房》的预置痕迹。
 *
 * 留着它是因为这是全项目唯一能看到「她的回信」长什么样的地方，调交互和样式需要
 * 一个参照。但不能让它继续写死在组件里：那样界面上一部分痕迹来自内存、一部分来自
 * 数据库，删除和统计就得分两条路径走。所以首次启动时播种进 IndexedDB，
 * 之后示例书和你导入的真书走完全相同的读写路径。
 *
 * 不需要参照了就把 SEED_SAMPLE_TRACES 翻成 false，再定向清掉 rain-room 的痕迹，
 * 示例书就是一本空书。不能清空整个 IndexedDB，否则用户导入书也会一起丢失。
 */
export const SEED_SAMPLE_TRACES = false

export const SAMPLE_BOOK_ID = 'rain-room'

/**
 * 正式书架不再内置示例书后，清掉旧版本曾播种的孤儿数据。
 *
 * 旧示例书从未写入 books 表，因此只在不存在同 id 书籍时执行；自动测试显式装载的
 * rain-room 测试书和任何真实入库记录都不会被误删。
 */
export async function cleanupLegacySampleData(): Promise<void> {
  if (await getBook(SAMPLE_BOOK_ID)) return
  await deleteBookCompletely(SAMPLE_BOOK_ID)
}

/**
 * 用原文定位，而不是句子序号：分段一变，写死的序号就会指到别的句子上。
 *
 * 原文本身也不在这里重抄一遍，而是取 sampleChapters[i].highlight——正文里被 mark
 * 标出来的就是那一段。抄一遍的代价是真发生过：写成「句子需要重量。」，而正文里是
 * 「句子需要重量：」，于是这条痕迹静默地播不进去。
 */
type SampleTrace = {
  chapterIndex: number
  note?: { text: string; at: string }
  reply?: { text: string; at: string }
}

/**
 * 时间刻意不带 Z。
 *
 * 真实批注存的是 UTC，显示时转成读者本地时间——那是对的。但这几条是给人看的参照，
 * 得在任何时区都显示成设计稿上那个 07/14/18：47；带 Z 的话在东八区就变成 07/15/02：47。
 * 不带时区后缀的 ISO 串按本地时间解析，所以写进去是几点，显示出来就是几点。
 */
const SAMPLE_TRACES: SampleTrace[] = [
  {
    chapterIndex: 0,
    note: { text: '有些话打在屏幕上很轻，写进书里以后却会留下来。', at: '2025-07-14T18:47:00' },
  },
  {
    chapterIndex: 1,
    note: { text: '读到这里时，好像被一本陌生的书认了出来。', at: '2025-07-15T16:42:00' },
    reply: { text: '也许书并不知道，只是它替那一刻保留了一个位置。', at: '2025-07-15T17:00:00' },
  },
  {
    chapterIndex: 3,
  },
]

/**
 * 在原文里找到这句话所在的句子区间。
 *
 * 播种时不能假设句子序号，得反过来从文字找位置，这样示例痕迹和用户真实划线
 * 遵守同一条规则：定位由原文决定。
 */
function findSentenceRange(segmented: SegmentedChapter, quote: string) {
  const exact = segmented.sentences.find((run) => run.text.trim() === quote)
  if (exact) return { start: exact.index, end: exact.index }

  // 标出来的通常是句子里的一小段，所以子串命中才是常态：取包含它的那一句。
  const partial = segmented.sentences.find((run) => run.text.includes(quote))
  return partial ? { start: partial.index, end: partial.index } : null
}

/**
 * 播种一次。
 *
 * 幂等：只要库里已经有 rain-room 的划线或批注就直接返回，所以你在示例书上
 * 删掉的痕迹不会在刷新后复活。
 */
export async function seedSampleTraces(forceForTests = false): Promise<void> {
  if (!SEED_SAMPLE_TRACES && !forceForTests) return

  const [highlights, annotations] = await Promise.all([
    getHighlights(SAMPLE_BOOK_ID),
    getAnnotations(SAMPLE_BOOK_ID),
  ])
  if (highlights.length || annotations.length) return

  const segmentedChapters = segmentChapters(sampleChapters)

  for (const sample of SAMPLE_TRACES) {
    const chapter = sampleChapters[sample.chapterIndex]
    const segmented = segmentedChapters[sample.chapterIndex]
    if (!chapter?.highlight || !segmented) continue

    const found = findSentenceRange(segmented, chapter.highlight)
    if (!found) continue

    const locator = locatorFromSentenceRange(
      SAMPLE_BOOK_ID,
      sample.chapterIndex,
      segmented,
      chapter.paragraphs,
      found.start,
      found.end,
    )
    if (!locator) continue

    await persistHighlight(locator)
    if (!sample.note) continue

    const noteId = await persistNote(
      locator,
      sample.note.text,
      `seed-note-${sample.chapterIndex}`,
      true,
      sample.note.at,
    )
    if (sample.reply) await persistReply(locator, noteId, sample.reply.text, sample.reply.at)
  }
}
