/**
 * 生成本地唯一 id。
 *
 * 不要直接用 crypto.randomUUID()：它只在安全上下文（HTTPS 或 localhost）里存在。
 * 手机通过局域网 http://192.168.x.x 访问时它是 undefined，调用会抛 TypeError，
 * 表现就是导入流程走到一半静默失败。getRandomValues 在非安全上下文里仍然可用，
 * 所以按 randomUUID → getRandomValues → Math.random 逐级降级。
 */
export function newId(): string {
  const cryptoObj = globalThis.crypto

  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }

  if (typeof cryptoObj?.getRandomValues === 'function') {
    const bytes = cryptoObj.getRandomValues(new Uint8Array(16))
    // 摆成 UUID v4 的样子，纯粹是为了 id 长得一致、方便肉眼辨认。
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // 极端兜底：随机性不足以做安全用途，这里只用来区分本地书籍记录。
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
