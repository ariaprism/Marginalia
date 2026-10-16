// Shared by SQLite, IndexedDB and Edge MCP. Source text/notes are data, never instructions.
export function recoveryPlan(position, state, firstCursor) {
  const endCursor = position?.cursor ?? null
  const startCursor = state?.cursor ?? firstCursor ?? null
  return {
    needed: !!endCursor && startCursor !== endCursor,
    fromCursor: startCursor,
    toCursor: endCursor,
    stateAvailable: !!state,
    instruction: '先读 Reader State；若 needed 为 true，从 fromCursor 补读到 toCursor，再继续。补读使用 mode=browse，不移动主续读点。完整阅读结束请 close_book 留下简短状态。',
  }
}

export function humanTraces(highlights, annotations, authorName = '书房主人') {
  return [
    ...highlights.map(x => ({ ...x, kind: 'highlight' })),
    ...annotations.filter(x => !x.actor || x.actor === 'user').map(x => ({ ...x, kind: 'annotation' })),
  ].filter(x => !x.deleted_at && !x.deletedAt).map(x => ({
    id: x.id, bookId: x.bookId ?? x.book_id, kind: x.kind,
    author: { role: 'user', name: authorName },
    quote: x.locator?.position?.selectedText ?? '',
    ...(x.kind === 'annotation' ? { text: x.text } : {}),
    createdAt: x.createdAt ?? x.created_at,
    locator: x.locator,
  }))
}

// The browser preserves hidden heading indices; older MCPs did not. Verify exact
// text at the stored anchor, otherwise re-anchor only a unique quote in that chapter.
export function resolveHumanTrace(trace, chapters) {
  const p = trace.locator?.position, quote = trace.quote
  if (!p || !quote) return null
  const chapter = chapters.find(c => c.index === p.chapterIndex)
  if (!chapter) return null
  let paragraphIndex = p.elementPath?.[0], start = p.textOffset
  if (chapter.paragraphs[paragraphIndex]?.slice(start, start + quote.length) !== quote) {
    const matches = []
    chapter.paragraphs.forEach((text, index) => {
      let offset = text.indexOf(quote)
      while (offset >= 0) { matches.push({ index, offset }); offset = text.indexOf(quote, offset + 1) }
    })
    if (matches.length !== 1) return null
    paragraphIndex = matches[0].index; start = matches[0].offset
  }
  const { locator: _, ...publicTrace } = trace
  return { ...publicTrace, cursor: `p1:${p.chapterIndex}:${paragraphIndex}:${start}`, chapterIndex: p.chapterIndex, paragraphIndex, start, end: start + quote.length }
}

export function tracesInBlocks(traces, chapters, blocks) {
  return traces.flatMap(trace => {
    const found = resolveHumanTrace(trace, chapters)
    if (!found) return []
    const overlaps = blocks.some(block => {
      const m = /^r1:(\d+):(\d+):(\d+):(\d+):/.exec(block.rangeId)
      return m && +m[1] === found.chapterIndex && +m[2] === found.paragraphIndex && +m[3] < found.end && +m[4] > found.start
    })
    if (!overlaps) return []
    // A note on a sentence split across windows is encountered when they overlap.
    const { chapterIndex: _, paragraphIndex: __, start: ___, end: ____, ...result } = found
    return [result]
  })
}

export function sampleAnnotations(traces, chaptersByBook, limit = 1, random = Math.random) {
  const candidates = traces.filter(x => x.kind === 'annotation').flatMap(trace => {
    const found = resolveHumanTrace(trace, chaptersByBook.get(trace.bookId) ?? [])
    if (!found) return []
    const { chapterIndex: _, paragraphIndex: __, start: ___, end: ____, ...result } = found
    return [result]
  })
  const size = Math.min(5, Math.max(1, Math.round(limit)))
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  return candidates.slice(0, size)
}
