import { ImagePlus, Plus, Upload, X } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { BookCoverTone } from '../../domain/book'
import { BookCover } from '../bookshelf/components'
import type { PreparedEpubImport } from './importEpub'
import type { ImportDraft } from './importDraft'

const COVER_TONES: { id: BookCoverTone; label: string }[] = [
  { id: 'rose', label: '棕红' },
  { id: 'blue', label: '雾蓝' },
  { id: 'green', label: '苔绿' },
  { id: 'ochre', label: '赭黄' },
]

type Props = {
  prepared: PreparedEpubImport | null
  draft: ImportDraft
  parsing: boolean
  saving: boolean
  onClose: () => void
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCoverFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onDraftChange: (patch: Partial<ImportDraft>) => void
  onChooseGeneratedCover: (tone: BookCoverTone) => void
  onSave: () => void
}

export function ImportBookDialog({
  prepared,
  draft,
  parsing,
  saving,
  onClose,
  onFileChange,
  onCoverFileChange,
  onDraftChange,
  onChooseGeneratedCover,
  onSave,
}: Props) {
  return (
    <div className="import-dialog-backdrop" onClick={onClose}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="import-dialog-heading">
          <div><small>ADD TO THE LIBRARY</small><h2 id="import-dialog-title">藏入书籍</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭藏书弹窗"><X /></button>
        </header>

        <label className={`import-file-drop ${prepared ? 'has-file' : ''}`}>
          <span className="import-file-plus">{parsing ? <span className="import-spinner" /> : <Plus />}</span>
          <span>
            <b>{parsing ? '正在拆封…' : prepared ? prepared.file.name : '选择一本 EPUB'}</b>
            <small>{prepared ? `${prepared.chapters.length} 个章节 · 点击可换一本` : '书名、作者与简介会自动带入'}</small>
          </span>
          <input type="file" accept=".epub,application/epub+zip" aria-label="选择 EPUB 文件" onChange={onFileChange} disabled={parsing || saving} />
        </label>

        <div className={`import-editor ${prepared ? 'is-ready' : ''}`}>
          <div className="import-fields">
            <label><span>书名</span><input value={draft.title} disabled={!prepared} onChange={(event) => onDraftChange({ title: event.target.value })} /></label>
            <label><span>英文名 <small>可留空</small></span><input value={draft.englishTitle} disabled={!prepared} onChange={(event) => onDraftChange({ englishTitle: event.target.value })} /></label>
            <label><span>作者</span><input value={draft.author} disabled={!prepared} onChange={(event) => onDraftChange({ author: event.target.value })} /></label>
            <label className="import-description-field"><span>简介 <small>可留空</small></span><textarea value={draft.description} disabled={!prepared} onChange={(event) => onDraftChange({ description: event.target.value })} /></label>
          </div>

          <section className="import-cover-controls" aria-labelledby="import-cover-title">
            <div className="import-section-heading"><span id="import-cover-title">书籍封面</span><small>可随时替换</small></div>
            <div className="import-cover-actions">
              <label className="import-image-button">
                <ImagePlus /><span>导入图片</span>
                <input type="file" accept="image/*" aria-label="导入封面图片" onChange={onCoverFileChange} disabled={!prepared || saving} />
              </label>
              {prepared?.embeddedCoverUrl && (
                <button type="button" onClick={() => onDraftChange({ coverUrl: prepared.embeddedCoverUrl })}>
                  <Upload />书内封面
                </button>
              )}
            </div>
            <div className="import-tone-row" aria-label="Marginalia 内部封面颜色">
              <small>MG 内部封面</small>
              <div>
                {COVER_TONES.map((tone) => (
                  <button
                    type="button"
                    key={tone.id}
                    className={`tone-${tone.id} ${!draft.coverUrl && draft.tone === tone.id ? 'is-selected' : ''}`}
                    onClick={() => onChooseGeneratedCover(tone.id)}
                    aria-label={`选择${tone.label}封面`}
                    aria-pressed={!draft.coverUrl && draft.tone === tone.id}
                    disabled={!prepared}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="import-preview" aria-label="书籍预览">
          <small>PREVIEW</small>
          <div className="import-preview-book">
            <BookCover book={{
              id: 'import-preview', title: draft.title || '未题名', englishTitle: draft.englishTitle,
              author: draft.author || '未知作者', description: draft.description, status: 'wish', statusLabel: '想读',
              progress: 0, quote: '', tone: draft.tone, coverUrl: draft.coverUrl,
            }} />
            <div>
              <span>想读</span><strong>{draft.title || '等待一本书'}</strong>
              {draft.englishTitle && <em>{draft.englishTitle}</em>}
              <small>{draft.author || '作者会出现在这里'}</small>
              <p>{draft.description || '简介会和这本书一起留在书架。'}</p>
            </div>
          </div>
        </section>

        <footer className="import-dialog-actions">
          <button type="button" onClick={onClose} disabled={saving}>暂不藏入</button>
          <button className="save-import" type="button" onClick={onSave} disabled={!prepared || !draft.title.trim() || parsing || saving}>
            {saving ? '正在藏入…' : '藏入书架'}
          </button>
        </footer>
      </section>
    </div>
  )
}
