import { createMarginalia } from '../../domain/marginalia'
import { getAnnotations, getMarginalia, saveMarginalia } from '../../data/local/bookStore'
import type { CompanionExchangeResponse } from './contract'
import { expectedInvitationId } from './contract'

export type ExchangeImportReport = {
  written: number
  seen: number
  duplicate: number
  rejected: Array<{ responseId: string; reason: string }>
}

export async function importCompanionExchangeResponse(
  response: CompanionExchangeResponse,
  expectedBookId: string,
): Promise<ExchangeImportReport> {
  if (response.bookId !== expectedBookId) throw new Error('这份回复不属于当前这本书。')

  const [annotations, existingMarginalia] = await Promise.all([
    getAnnotations(expectedBookId),
    getMarginalia(expectedBookId),
  ])
  const annotationsById = new Map(annotations.map((annotation) => [annotation.id, annotation]))
  const existingIds = new Set(existingMarginalia.map((item) => item.id))
  const report: ExchangeImportReport = { written: 0, seen: 0, duplicate: 0, rejected: [] }

  for (const item of response.responses) {
    const annotation = annotationsById.get(item.annotationId)
    if (!annotation || item.invitationId !== expectedInvitationId(item.annotationId)) {
      report.rejected.push({ responseId: item.responseId, reason: '找不到对应的原批注。' })
      continue
    }
    if (item.action === 'seen') {
      report.seen += 1
      continue
    }

    const id = `exchange:${item.idempotencyKey}`
    if (existingIds.has(id)) {
      report.duplicate += 1
      continue
    }
    await saveMarginalia(createMarginalia({
      id,
      bookId: expectedBookId,
      annotationId: annotation.id,
      locator: annotation.locator,
      text: item.text!.trim(),
      visibility: item.visibility,
    }, response.completedAt))
    existingIds.add(id)
    report.written += 1
  }
  return report
}
