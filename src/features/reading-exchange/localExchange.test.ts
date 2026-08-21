import { describe, expect, it } from 'vitest'
import { saveAnnotation, getMarginalia } from '../../data/local/bookStore'
import { createAnnotation } from '../../domain/annotation'
import { createLocator } from '../../domain/locator'
import type { CompanionExchangeResponse } from './contract'
import { importCompanionExchangeResponse } from './localExchange'

describe('local reading exchange import', () => {
  it('writes replies idempotently and reports seen invitations', async () => {
    const locator = createLocator('rain-room', {
      chapterIndex: 0, elementPath: [0], textOffset: 0,
      selectedText: '灯亮起来以前', beforeContext: '', afterContext: '，书房先听见了雨。',
    })
    await saveAnnotation(createAnnotation({ id: 'note-1', bookId: 'rain-room', locator, text: '雨像一次敲门。' }))
    const response: CompanionExchangeResponse = {
      schemaVersion: '1.0', exchangeId: 'exchange-1', responseId: 'response-1', bookId: 'rain-room',
      companion: { name: '小鱼' }, completedAt: '2026-08-18T02:00:00.000Z',
      responses: [
        { responseId: 'r1', invitationId: 'invitation:note-1', annotationId: 'note-1', action: 'reply', text: '也像有人先抵达。', visibility: 'immediate', idempotencyKey: 'reply-1' },
        { responseId: 'r2', invitationId: 'invitation:note-1', annotationId: 'note-1', action: 'seen', visibility: 'immediate', idempotencyKey: 'seen-1' },
      ],
    }

    expect(await importCompanionExchangeResponse(response, 'rain-room')).toMatchObject({ written: 1, seen: 1, duplicate: 0 })
    expect(await importCompanionExchangeResponse(response, 'rain-room')).toMatchObject({ written: 0, seen: 1, duplicate: 1 })
    expect(await getMarginalia('rain-room')).toHaveLength(1)
  })
})
