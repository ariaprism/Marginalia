import type { SupabaseClient } from '@supabase/supabase-js'
import type { Book, BookCoverTone, BookSource, BookStatus } from '../../domain/book'
import type { CompanionPronoun } from '../../domain/profile'
import type { StoredProfile } from '../local/profileStore'
import type { PushResult, SyncRemote } from '../sync/engine'
import type { RemoteChange, SyncOperation } from '../sync/operations'
import type { Database, Json, Tables } from './database.types'

type ChangeRow = Tables<'sync_changes'>
type ProfileRow = Tables<'profiles'>
type BookRow = Tables<'books'>

export interface CloudInkGateway {
  apply(operation: SyncOperation): Promise<boolean>
  listChanges(afterChangeId: number): Promise<ChangeRow[]>
  getProfile(): Promise<ProfileRow | null>
  getBooks(ids: string[]): Promise<BookRow[]>
}

function expectData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('云端没有返回预期数据')
  return data
}

/** Browser gateway: the session JWT is attached by supabase-js; RLS still checks every row. */
export function createSupabaseCloudInkGateway(
  client: SupabaseClient<Database>,
): CloudInkGateway {
  return {
    async apply(operation) {
      const { data, error } = await client.rpc('apply_profile_book_sync_operation', {
        p_operation_id: operation.operationId,
        p_entity_type: operation.entityType,
        p_entity_id: operation.entityId,
        p_operation: operation.operation,
        p_occurred_at: operation.occurredAt,
        p_payload: (operation.payload ?? {}) as Json,
      })
      return expectData(data, error)
    },
    async listChanges(afterChangeId) {
      const { data, error } = await client
        .from('sync_changes')
        .select('*')
        .gt('change_id', afterChangeId)
        .in('entity_type', ['profile', 'book'])
        .order('change_id', { ascending: true })
        .limit(200)
      return expectData(data, error)
    },
    async getProfile() {
      const { data, error } = await client.from('profiles').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    async getBooks(ids) {
      if (!ids.length) return []
      const { data, error } = await client.from('books').select('*').in('id', ids)
      return expectData(data, error)
    },
  }
}

function profilePayload(row: ProfileRow): StoredProfile {
  const pronoun = row.companion_subject as CompanionPronoun
  return {
    id: 'self',
    userName: row.user_name,
    companionName: row.companion_name,
    companionPronoun: ['她', '他', 'TA', 'name'].includes(pronoun) ? pronoun : '她',
    updatedAt: row.updated_at,
  }
}

function bookPayload(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    ...(row.english_title ? { englishTitle: row.english_title } : {}),
    author: row.author,
    ...(row.language ? { language: row.language } : {}),
    ...(row.description ? { description: row.description } : {}),
    ...(row.cover_tone ? { coverTone: row.cover_tone as BookCoverTone } : {}),
    source: row.source as BookSource,
    status: row.status as BookStatus,
    progress: 0,
    addedAt: row.added_at,
    ...(row.last_opened_at ? { lastOpenedAt: row.last_opened_at } : {}),
    ...(row.pinned_at ? { pinnedAt: row.pinned_at } : {}),
    updatedAt: row.updated_at,
  }
}

/** First real remote slice: profile and book metadata only. Unsupported outbox rows stay pending. */
export class CloudInkRemote implements SyncRemote {
  private readonly gateway: CloudInkGateway

  constructor(gateway: CloudInkGateway) {
    this.gateway = gateway
  }

  async push(operations: SyncOperation[]): Promise<PushResult[]> {
    return Promise.all(operations.map(async (operation) => {
      const supported = operation.operation === 'upsert'
        && (operation.entityType === 'profile' || operation.entityType === 'book')
      return {
        operationId: operation.operationId,
        accepted: supported ? await this.gateway.apply(operation) : false,
      }
    }))
  }

  async pull(afterChangeId: number): Promise<{ changes: RemoteChange[]; cursor: number }> {
    const rows = await this.gateway.listChanges(afterChangeId)
    const cursor = rows.at(-1)?.change_id ?? afterChangeId
    const latest = new Map<string, ChangeRow>()
    for (const row of rows) latest.set(`${row.entity_type}:${row.entity_id}`, row)

    const profileChange = [...latest.values()].find((row) => row.entity_type === 'profile')
    const bookChanges = [...latest.values()].filter((row) => row.entity_type === 'book')
    const [profile, books] = await Promise.all([
      profileChange ? this.gateway.getProfile() : Promise.resolve(null),
      this.gateway.getBooks(bookChanges.map((row) => row.entity_id)),
    ])
    const booksById = new Map(books.map((book) => [book.id, book]))
    const changes: RemoteChange[] = []

    if (profileChange && profile) {
      changes.push({
        changeId: profileChange.change_id,
        entityType: 'profile',
        entityId: 'self',
        operation: 'upsert',
        payload: profilePayload(profile),
        occurredAt: profile.updated_at,
      })
    }
    for (const change of bookChanges) {
      const book = booksById.get(change.entity_id)
      changes.push({
        changeId: change.change_id,
        entityType: 'book',
        entityId: change.entity_id,
        operation: !book || book.deleted_at ? 'delete' : 'upsert',
        ...(book && !book.deleted_at ? { payload: bookPayload(book) } : {}),
        occurredAt: book?.deleted_at ?? book?.updated_at ?? change.changed_at,
      })
    }

    return { changes: changes.sort((a, b) => a.changeId - b.changeId), cursor }
  }
}
