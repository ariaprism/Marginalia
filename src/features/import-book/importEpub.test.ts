import { describe, expect, it, afterEach } from 'vitest'
import { importEpubFile } from './importEpub'
import { buildRainRoomEpub } from '../../reader/fixtures/rain-room-epub'

async function epubFile(name = '雨夜书房.epub') {
  const bytes = await buildRainRoomEpub()
  return new File([bytes.buffer as ArrayBuffer], name, { type: 'application/epub+zip' })
}

describe('importEpubFile', () => {
  const originalRandomUUID = crypto.randomUUID

  afterEach(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: originalRandomUUID, configurable: true })
  })

  it('imports an EPUB and returns the new book id', async () => {
    const result = await importEpubFile(await epubFile())

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bookId).toBeTruthy()
  })

  /**
   * 手机走局域网 http://192.168.x.x 时不是安全上下文，crypto.randomUUID 不存在。
   * 导入必须照常成功，而不是抛 TypeError 静默失败。
   */
  it('still imports when crypto.randomUUID is unavailable (insecure context)', async () => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })

    const result = await importEpubFile(await epubFile())

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bookId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reports a readable error instead of throwing on a non-EPUB file', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer], 'notes.txt', { type: 'text/plain' })

    const result = await importEpubFile(junk)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.details).toBeTruthy()
  })
})
