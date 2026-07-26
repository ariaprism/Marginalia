import { describe, expect, it } from 'vitest'
import { extractChapterText } from './chapterText'

function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`
}

describe('extractChapterText', () => {
  it('按 <p> 分段', () => {
    const result = extractChapterText(xhtml('<p>第一段。</p><p>第二段。</p>'))
    expect(result.paragraphs).toEqual(['第一段。', '第二段。'])
  })

  it('保留西文单词之间的空格', () => {
    const result = extractChapterText(xhtml('<p>The little prince laughed.</p>'))
    expect(result.paragraphs).toEqual(['The little prince laughed.'])
  })

  it('去掉源码换行缩进造成的空白，但不粘连西文', () => {
    const result = extractChapterText(xhtml(`<p>
      灯亮起来以前，
      书房先听见了雨。
    </p><p>
      He said:
      "Draw me a sheep."
    </p>`))
    expect(result.paragraphs[0]).toBe('灯亮起来以前，书房先听见了雨。')
    expect(result.paragraphs[1]).toBe('He said: "Draw me a sheep."')
  })

  it('把 <br> 当作分段（很多书用 br 换行而不新开 p）', () => {
    const result = extractChapterText(xhtml('<p>第一行<br/>第二行<br/>第三行</p>'))
    expect(result.paragraphs).toEqual(['第一行', '第二行', '第三行'])
  })

  it('行内标签不打断段落', () => {
    const result = extractChapterText(xhtml('<p>他说<em>请</em>给我<strong>画</strong>一只羊。</p>'))
    expect(result.paragraphs).toEqual(['他说请给我画一只羊。'])
  })

  it('处理嵌套 div 结构而不产出空段', () => {
    const result = extractChapterText(xhtml(`
      <div class="chapter">
        <div class="inner">
          <p>甲。</p>
          <p>乙。</p>
        </div>
      </div>`))
    expect(result.paragraphs).toEqual(['甲。', '乙。'])
  })

  it('丢弃 script 与 style 的内容', () => {
    const result = extractChapterText(xhtml('<style>p{color:red}</style><p>正文。</p><script>var x=1</script>'))
    expect(result.paragraphs).toEqual(['正文。'])
  })

  it('非严格合规的 HTML 退回 HTML 解析而不是整章丢失', () => {
    // 未闭合的 <p> 与 <br>：按 XML 解析会失败
    const result = extractChapterText('<html><body><p>第一段。<p>第二段。<br>第三段。</body></html>')
    expect(result.paragraphs).toEqual(['第一段。', '第二段。', '第三段。'])
  })

  it('把标题与列表项各自成段', () => {
    const result = extractChapterText(xhtml('<h2>小标题</h2><ul><li>项一</li><li>项二</li></ul>'))
    expect(result.paragraphs).toEqual(['小标题', '项一', '项二'])
  })

  it('整章没有块级标签时也能取到文字', () => {
    const result = extractChapterText(xhtml('这本书正文没有包在任何标签里。'))
    expect(result.paragraphs).toEqual(['这本书正文没有包在任何标签里。'])
  })

  it('透传章节标签与标题', () => {
    const result = extractChapterText(xhtml('<p>正文。</p>'), '雨先抵达', '第一章')
    expect(result.title).toBe('雨先抵达')
    expect(result.chapter).toBe('第一章')
  })
})
