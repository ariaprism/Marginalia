import { useRef, useState, type ChangeEvent } from 'react'
import type { BookCoverTone } from '../../domain/book'
import { imageFileToDataUrl, prepareEpubFile, savePreparedEpub, type PreparedEpubImport } from './importEpub'
import { EMPTY_IMPORT_DRAFT, type ImportDraft } from './importDraft'

type Notify = (message: string, details?: string) => void

export function useImportBookDialog(notify: Notify, onSaved: () => void) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prepared, setPrepared] = useState<PreparedEpubImport | null>(null)
  const [draft, setDraft] = useState<ImportDraft>(EMPTY_IMPORT_DRAFT)
  const sessionRef = useRef(0)

  const openDialog = () => {
    sessionRef.current += 1
    setPrepared(null)
    setDraft(EMPTY_IMPORT_DRAFT)
    setParsing(false)
    setSaving(false)
    setOpen(true)
  }

  const closeDialog = () => {
    if (saving) return
    sessionRef.current += 1
    setOpen(false)
    setPrepared(null)
    setDraft(EMPTY_IMPORT_DRAFT)
    setParsing(false)
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const session = sessionRef.current + 1
    sessionRef.current = session
    setParsing(true)
    setPrepared(null)

    try {
      const result = await prepareEpubFile(file)
      if (sessionRef.current !== session) return
      if (result.ok) {
        setPrepared(result.prepared)
        setDraft({
          title: result.prepared.metadata.title || file.name.replace(/\.epub$/i, ''),
          englishTitle: '',
          author: result.prepared.metadata.author || '',
          description: result.prepared.metadata.description ?? '',
          tone: 'rose',
          coverUrl: result.prepared.embeddedCoverUrl,
        })
      } else {
        notify(result.message, result.details)
      }
    } catch (error) {
      notify('这本书暂时无法打开', error instanceof Error ? error.message : String(error))
    } finally {
      if (sessionRef.current === session) setParsing(false)
    }
  }

  const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('请选择一张图片作为封面。')
      return
    }
    try {
      const coverUrl = await imageFileToDataUrl(file)
      setDraft((current) => ({ ...current, coverUrl }))
    } catch (error) {
      notify('这张封面暂时无法使用', error instanceof Error ? error.message : String(error))
    }
  }

  const chooseGeneratedCover = (tone: BookCoverTone) => {
    setDraft((current) => ({ ...current, tone, coverUrl: undefined }))
  }

  const updateDraft = (patch: Partial<ImportDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const save = async () => {
    if (!prepared || !draft.title.trim() || saving) return
    setSaving(true)
    try {
      const result = await savePreparedEpub(prepared, {
        title: draft.title,
        englishTitle: draft.englishTitle,
        author: draft.author,
        description: draft.description,
        coverUrl: draft.coverUrl,
        coverTone: draft.tone,
      })
      if (result.ok) {
        sessionRef.current += 1
        setOpen(false)
        setPrepared(null)
        setDraft(EMPTY_IMPORT_DRAFT)
        onSaved()
        notify('已经藏入书架。')
      } else {
        notify(result.message, result.details)
      }
    } catch (error) {
      notify('这本书暂时无法打开', error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return {
    open, parsing, saving, prepared, draft,
    openDialog, closeDialog, handleFileChange, handleCoverFileChange,
    chooseGeneratedCover, updateDraft, save,
  }
}
