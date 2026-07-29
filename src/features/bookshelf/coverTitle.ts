const OPENING_PUNCTUATION = /^[，。！？：；、）》】〕〉”’…—]/
const CLOSING_PUNCTUATION = /[（《【〔〈“‘]$/
const AWKWARD_LINE_START = /^[的了着过和与及]/

function displayTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  const bracketed = normalized.match(/^《(.+)》$/)
  return bracketed?.[1] ?? normalized
}

function semanticBreaks(title: string): Set<number> {
  const breaks = new Set<number>()
  if (typeof Intl.Segmenter !== 'function') return breaks

  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  for (const segment of segmenter.segment(title)) {
    const end = segment.index + segment.segment.length
    const codePointIndex = Array.from(title.slice(0, end)).length
    if (codePointIndex > 0 && codePointIndex < Array.from(title).length) {
      breaks.add(codePointIndex)
    }
  }
  return breaks
}

function partitions(length: number, lineCount: number): number[][] {
  const result: number[][] = []
  const visit = (points: number[]) => {
    if (points.length === lineCount - 1) {
      result.push(points)
      return
    }
    const start = points.at(-1) ?? 0
    const remainingBreaks = lineCount - 1 - points.length
    for (let next = start + 1; next <= length - remainingBreaks; next += 1) {
      visit([...points, next])
    }
  }
  visit([])
  return result
}

function scorePartition(chars: string[], points: number[], wordBreaks: Set<number>): number {
  const boundaries = [0, ...points, chars.length]
  const lengths = boundaries.slice(1).map((end, index) => end - boundaries[index])
  const target = chars.length / lengths.length
  let score = lengths.reduce((sum, length) => sum + (length - target) ** 2, 0)

  for (const point of points) {
    if (!wordBreaks.has(point)) score += 9
  }
  for (let index = 0; index < lengths.length; index += 1) {
    const line = chars.slice(boundaries[index], boundaries[index + 1]).join('')
    if (lengths[index] === 1) score += 12
    if (lengths[index] > 4) score += (lengths[index] - 4) * 4
    if (OPENING_PUNCTUATION.test(line)) score += 20
    if (CLOSING_PUNCTUATION.test(line)) score += 20
    if (AWKWARD_LINE_START.test(line)) score += 18
  }
  return score
}

/**
 * 为窄书脊式封面生成稳定的横排标题行。
 *
 * 三字以内保持一行；中短标题优先两行，长标题最多三行。分词边界比机械均分
 * 权重更高，因此「温室里的冬天」会保住「里的」，而未知专名仍能退回均衡断行。
 */
export function coverTitleLines(title: string): string[] {
  const normalized = displayTitle(title)
  const chars = Array.from(normalized)
  if (chars.length <= 3) return [normalized]

  const lineCount = chars.length <= 8 ? 2 : 3
  const wordBreaks = semanticBreaks(normalized)
  const best = partitions(chars.length, lineCount)
    .map((points) => ({ points, score: scorePartition(chars, points, wordBreaks) }))
    // 同分时让前一行稍长，中文偏正短语通常比「里的／中的」另起一行更自然。
    .sort((a, b) => a.score - b.score || b.points.join(',').localeCompare(a.points.join(',')))[0]

  const boundaries = [0, ...best.points, chars.length]
  return boundaries.slice(1).map((end, index) => chars.slice(boundaries[index], end).join(''))
}
