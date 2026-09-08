import type { SupabaseClient } from '@supabase/supabase-js'
import type { Annotation } from '../../domain/annotation'
import type { Book, BookCoverTone, BookSource, BookStatus } from '../../domain/book'
import type { Highlight, HighlightColor } from '../../domain/highlight'
import type { Locator } from '../../domain/locator'
import type { Marginalia, Visibility } from '../../domain/marginalia'
import type { CompanionPronoun } from '../../domain/profile'
import type { ReadingProgress } from '../../domain/readingProgress'
import { extractChapterText } from '../../reader/chapterText'
import type { StoredChapter } from '../local/bookStore'
import type { StoredProfile } from '../local/profileStore'
import type { PushResult, SyncRemote } from '../sync/engine'
import type { RemoteChange, SyncEntityType, SyncOperation } from '../sync/operations'
import type { Database, Json, Tables } from './database.types'

type ChangeRow = Tables<'sync_changes'>
type ProfileRow = Tables<'profiles'>
type BookRow = Tables<'books'>
type ChapterRow = Tables<'book_sections'>
type ReadingPositionRow = Tables<'reading_positions'>
type BookmarkRow = Tables<'bookmarks'>
type HighlightRow = Tables<'highlights'>
type AnnotationRow = Tables<'annotations'>
type MarginaliaRow = Tables<'marginalia'>

const STRUCTURED_TYPES: SyncEntityType[] = [
  'profile', 'book', 'chapter', 'readingProgress', 'bookmark',
  'highlight', 'annotation', 'marginalia',
]

export interface CloudInkGateway {
  apply(operation: SyncOperation): Promise<boolean>
  listChanges(afterChangeId: number): Promise<ChangeRow[]>
  getProfile(): Promise<ProfileRow | null>
  getBooks(ids: string[]): Promise<BookRow[]>
  getChapters(ids: string[]): Promise<ChapterRow[]>
  getReadingPositions(bookIds: string[]): Promise<ReadingPositionRow[]>
  getBookmarks(bookIds: string[]): Promise<BookmarkRow[]>
  getHighlights(ids: string[]): Promise<HighlightRow[]>
  getAnnotations(ids: string[]): Promise<AnnotationRow[]>
  getMarginalia(ids: string[]): Promise<MarginaliaRow[]>
}

function expectData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('云端没有返回预期数据')
  return data
}

function payloadForRemote(operation: SyncOperation): Json {
  if (operation.entityType !== 'chapter' || !operation.payload
    || typeof operation.payload !== 'object') return (operation.payload ?? {}) as Json
  const chapter = operation.payload as StoredChapter
  const contentText = chapter.html
    ? extractChapterText(chapter.html, chapter.title).paragraphs.join('\n\n')
    : ''
  return { ...chapter, contentText } as Json
}

/** Browser gateway: supabase-js attaches the session JWT and every query remains subject to RLS. */
export function createSupabaseCloudInkGateway(client: SupabaseClient<Database>): CloudInkGateway {
  const byIds = async <T>(
    table: 'books' | 'book_sections' | 'highlights' | 'annotations' | 'marginalia',
    ids: string[],
  ): Promise<T[]> => {
    if (!ids.length) return []
    const { data, error } = await client.from(table).select('*').in('id', ids)
    return expectData(data, error) as T[]
  }
  const byBookIds = async <T>(
    table: 'reading_positions' | 'bookmarks',
    ids: string[],
  ): Promise<T[]> => {
    if (!ids.length) return []
    const { data, error } = await client.from(table).select('*').in('book_id', ids)
    return expectData(data, error) as T[]
  }

  return {
    async apply(operation) {
      const { data, error } = await client.rpc('apply_cloud_ink_sync_operation', {
        p_operation_id: operation.operationId,
        p_entity_type: operation.entityType,
        p_entity_id: operation.entityId,
        p_operation: operation.operation,
        p_occurred_at: operation.occurredAt,
        p_payload: payloadForRemote(operation),
      })
      return expectData(data, error)
    },
    async listChanges(afterChangeId) {
      const { data, error } = await client.from('sync_changes').select('*')
        .gt('change_id', afterChangeId).in('entity_type', STRUCTURED_TYPES)
        .order('change_id', { ascending: true }).limit(200)
      return expectData(data, error)
    },
    async getProfile() {
      const { data, error } = await client.from('profiles').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    getBooks: (ids) => byIds<BookRow>('books', ids),
    getChapters: (ids) => byIds<ChapterRow>('book_sections', ids),
    getReadingPositions: (ids) => byBookIds<ReadingPositionRow>('reading_positions', ids),
    getBookmarks: (ids) => byBookIds<BookmarkRow>('bookmarks', ids),
    getHighlights: (ids) => byIds<HighlightRow>('highlights', ids),
    getAnnotations: (ids) => byIds<AnnotationRow>('annotations', ids),
    getMarginalia: (ids) => byIds<MarginaliaRow>('marginalia', ids),
  }
}

export function profilePayload(row: ProfileRow): StoredProfile {
  const pronoun = row.companion_subject as CompanionPronoun
  return {
    id: 'self', userName: row.user_name, companionName: row.companion_name,
    companionPronoun: ['她', '他', 'TA', 'name'].includes(pronoun) ? pronoun : '她',
    updatedAt: row.updated_at,
  }
}

export function bookPayload(row: BookRow): Book {
  return {
    id: row.id, title: row.title,
    ...(row.english_title ? { englishTitle: row.english_title } : {}),
    author: row.author,
    ...(row.language ? { language: row.language } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.cover_tone ? { coverTone: row.cover_tone as BookCoverTone } : {}),
    source: row.source as BookSource, status: row.status as BookStatus, progress: 0,
    addedAt: row.added_at,
    ...(row.last_opened_at ? { lastOpenedAt: row.last_opened_at } : {}),
    ...(row.pinned_at ? { pinnedAt: row.pinned_at } : {}),
    updatedAt: row.updated_at,
  }
}

export function chapterPayload(row: ChapterRow): StoredChapter {
  return {
    id: row.id, bookId: row.book_id, index: row.spine_index,
    title: row.title, href: row.href, html: row.content_html,
  }
}

export function readingPayload(row: ReadingPositionRow): ReadingProgress {
  return {
    bookId: row.book_id, locator: row.locator as unknown as Locator,
    chapterProgress: row.chapter_progress, totalProgress: row.total_progress,
    updatedAt: row.read_at,
  }
}

export function bookmarkPayload(row: BookmarkRow) {
  return { bookId: row.book_id, locator: row.locator as unknown as Locator, updatedAt: row.moved_at }
}

export function highlightPayload(row: HighlightRow): Highlight {
  return {
    id: row.id, bookId: row.book_id, locator: row.locator as unknown as Locator,
    color: row.color as HighlightColor, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function annotationPayload(row: AnnotationRow): Annotation {
  return {
    id: row.id, bookId: row.book_id,
    ...(row.highlight_id ? { highlightId: row.highlight_id } : {}),
    locator: row.locator as unknown as Locator, text: row.text, actor: 'user',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function marginaliaPayload(row: MarginaliaRow): Marginalia {
  return {
    id: row.id, bookId: row.book_id, annotationId: row.annotation_id ?? '',
    locator: row.locator as unknown as Locator, text: row.text, actor: 'companion',
    visibility: row.visibility as Visibility, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function rowTime(row: { updated_at: string; deleted_at?: string | null }): string {
  return row.deleted_at ?? row.updated_at
}

function isDeleted(row: { deleted_at?: string | null } | undefined): boolean {
  return !row || Boolean(row.deleted_at)
}

const PUSH_ORDER: Record<SyncEntityType, number> = {
  profile: 0, book: 1, chapter: 2, readingProgress: 3, bookmark: 4,
  highlight: 5, annotation: 6, marginalia: 7, epubFile: 8,
}

/** Structured Cloud Ink remote. EPUB bytes deliberately remain a separate Storage stage. */
export class CloudInkRemote implements SyncRemote {
  private readonly gateway: CloudInkGateway

  constructor(gateway: CloudInkGateway) {
    this.gateway = gateway
  }

  async push(operations: SyncOperation[]): Promise<PushResult[]> {
    const accepted = new Map<string, boolean>()
    const ordered = [...operations].sort((a, b) => PUSH_ORDER[a.entityType] - PUSH_ORDER[b.entityType])
    for (const operation of ordered) {
      const supported = operation.entityType !== 'epubFile'
        && operation.operation !== 'upload_file'
        && !(operation.entityType === 'profile' && operation.operation === 'delete')
      accepted.set(operation.operationId, supported ? await this.gateway.apply(operation) : false)
    }
    return operations.map((operation) => ({
      operationId: operation.operationId,
      accepted: accepted.get(operation.operationId) ?? false,
    }))
  }

  async pull(afterChangeId: number): Promise<{ changes: RemoteChange[]; cursor: number }> {
    const rows = await this.gateway.listChanges(afterChangeId)
    const cursor = rows.at(-1)?.change_id ?? afterChangeId
    const latest = new Map<string, ChangeRow>()
    for (const row of rows) latest.set(`${row.entity_type}:${row.entity_id}`, row)
    const grouped = (type: SyncEntityType) => [...latest.values()].filter((row) => row.entity_type === type)
    const ids = (type: SyncEntityType) => grouped(type).map((row) => row.entity_id)

    const [profile, books, chapters, positions, bookmarks, highlights, annotations, marginalia] = await Promise.all([
      grouped('profile').length ? this.gateway.getProfile() : Promise.resolve(null),
      this.gateway.getBooks(ids('book')), this.gateway.getChapters(ids('chapter')),
      this.gateway.getReadingPositions(ids('readingProgress')), this.gateway.getBookmarks(ids('bookmark')),
      this.gateway.getHighlights(ids('highlight')), this.gateway.getAnnotations(ids('annotation')),
      this.gateway.getMarginalia(ids('marginalia')),
    ])
    const maps = {
      book: new Map(books.map((row) => [row.id, row])),
      chapter: new Map(chapters.map((row) => [row.id, row])),
      readingProgress: new Map(positions.map((row) => [row.book_id, row])),
      bookmark: new Map(bookmarks.map((row) => [row.book_id, row])),
      highlight: new Map(highlights.map((row) => [row.id, row])),
      annotation: new Map(annotations.map((row) => [row.id, row])),
      marginalia: new Map(marginalia.map((row) => [row.id, row])),
    }
    const payloadMappers = {
      book: bookPayload, chapter: chapterPayload, readingProgress: readingPayload,
      bookmark: bookmarkPayload, highlight: highlightPayload,
      annotation: annotationPayload, marginalia: marginaliaPayload,
    }
    const changes: RemoteChange[] = []
    const profileChange = grouped('profile').at(-1)
    if (profileChange && profile) {
      changes.push({
        changeId: profileChange.change_id, entityType: 'profile', entityId: 'self',
        operation: 'upsert', payload: profilePayload(profile), occurredAt: profile.updated_at,
      })
    }
    const entityTypes = STRUCTURED_TYPES.filter((type): type is keyof typeof maps => type in maps)
    for (const type of entityTypes) {
      for (const change of grouped(type)) {
        const row = maps[type].get(change.entity_id) as never
        changes.push({
          changeId: change.change_id, entityType: type, entityId: change.entity_id,
          operation: isDeleted(row) ? 'delete' : 'upsert',
          ...(!isDeleted(row) ? { payload: payloadMappers[type](row) } : {}),
          occurredAt: row ? rowTime(row) : change.changed_at,
        })
      }
    }
    return { changes: changes.sort((a, b) => a.changeId - b.changeId), cursor }
  }
}
