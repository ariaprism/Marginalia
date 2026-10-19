import type { ReaderProgress, ReaderState, ReaderTrace, ReaderSession } from '../../domain/reader'
import { getAllByIndex, withStoresTransaction, withTransaction } from './db'
import { deleteSharedReaderRecords, notifySharedLibraryChanged } from './sharedLibrary'

type StoredReaderProgress = ReaderProgress & { id: string }
type StoredReaderState = ReaderState & { id: string }
type StoredReaderTrace = ReaderTrace & { readerBookId: string }

function cursorOf(locator: ReaderProgress['locator']): string {
  const p = locator.position
  return `p1:${p.chapterIndex}:${p.elementPath[0] ?? 0}:${p.textOffset}`
}

function readerBookId(readerId: string, bookId: string): string {
  return `${readerId}:${bookId}`
}

function withoutId<T extends { id: string }>(record: T | undefined): Omit<T, 'id'> | undefined {
  if (!record) return undefined
  const { id: _, ...value } = record
  return value
}

export async function getReaderProgress(
  readerId: string,
  bookId: string,
): Promise<ReaderProgress | undefined> {
  const record = await withTransaction<StoredReaderProgress | undefined>(
    'readerProgress',
    'readonly',
    (store) => store.get(readerBookId(readerId, bookId)),
  )
  return withoutId(record)
}

export async function getReaderState(
  readerId: string,
  bookId: string,
): Promise<ReaderState | undefined> {
  const record = await withTransaction<StoredReaderState | undefined>(
    'readerStates',
    'readonly',
    (store) => store.get(readerBookId(readerId, bookId)),
  )
  return withoutId(record)
}

/** 自动进度只更新位置，不挪动合书状态。旧状态与旧进度同时间时先补齐锚点。 */
export async function saveReaderProgress(progress: ReaderProgress): Promise<void> {
  const id = readerBookId(progress.readerId, progress.bookId)
  await withStoresTransaction(['readerProgress', 'readerStates'], 'readwrite', transaction => {
    const states = transaction.objectStore('readerStates')
    const old = transaction.objectStore('readerProgress').get(id)
    old.onsuccess = () => {
      const state = states.get(id)
      state.onsuccess = () => {
        if (state.result && !state.result.cursor && old.result?.updatedAt === state.result.updatedAt) {
          states.put({ ...state.result, cursor: old.result.cursor ?? cursorOf(old.result.locator), locator: old.result.locator })
        }
      }
    }
    transaction.objectStore('readerProgress').put({ ...progress, id } satisfies StoredReaderProgress)
  })
  notifySharedLibraryChanged()
}

/**
 * ReaderProgress 与 ReaderState 必须同进同退：这就是未来 close_book 的本地事务边界。
 * 本阶段暂不进入 Cloud Ink outbox，等多读者远端所有权语义确定后再接同步。
 */
export async function saveReaderSession(
  progress: ReaderProgress,
  state: ReaderState,
  visit?: ReaderSession,
): Promise<void> {
  if (progress.readerId !== state.readerId || progress.bookId !== state.bookId) {
    throw new Error('读者位置与读者状态不属于同一次阅读')
  }
  const id = readerBookId(progress.readerId, progress.bookId)
  await withStoresTransaction(['readerProgress', 'readerStates', 'readerSessions'], 'readwrite', (transaction) => {
    transaction.objectStore('readerProgress').put({ ...progress, id } satisfies StoredReaderProgress)
    if (visit) transaction.objectStore('readerSessions').put(visit)
    transaction.objectStore('readerStates').put({ ...state, cursor: state.cursor ?? progress.cursor ?? cursorOf(progress.locator), locator: state.locator ?? progress.locator, id } satisfies StoredReaderState)
  })
  notifySharedLibraryChanged()
}

export async function saveReaderTrace(trace: ReaderTrace): Promise<void> {
  const record: StoredReaderTrace = {
    ...trace,
    readerBookId: readerBookId(trace.readerId, trace.bookId),
  }
  await withTransaction('readerTraces', 'readwrite', (store) => store.put(record))
  notifySharedLibraryChanged()
}

export async function getReaderTraces(readerId: string, bookId: string): Promise<ReaderTrace[]> {
  const records = await getAllByIndex<StoredReaderTrace>(
    'readerTraces',
    'readerBookId',
    readerBookId(readerId, bookId),
  )
  return records
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map(({ readerBookId: _, ...trace }) => trace)
}

function deleteByBookId(store: IDBObjectStore, bookId: string): void {
  const cursor = store.index('bookId').openCursor(IDBKeyRange.only(bookId))
  cursor.onsuccess = () => {
    const item = cursor.result
    if (!item) return
    item.delete()
    item.continue()
  }
}

async function deleteReaderDataForBook(bookId: string, includeTraces: boolean): Promise<void> {
  await deleteSharedReaderRecords(bookId, includeTraces ? 'all' : 'checkpoint')
  const stores = includeTraces
    ? ['readerProgress', 'readerStates', 'readerTraces', 'readerSessions']
    : ['readerProgress', 'readerStates']
  await withStoresTransaction(stores, 'readwrite', (transaction) => {
    for (const storeName of stores) deleteByBookId(transaction.objectStore(storeName), bookId)
  })
  notifySharedLibraryChanged()
}

/** 清除共读者的位置与理解状态，但保留其划线和批注。 */
export async function resetReadersForBook(bookId: string): Promise<void> {
  await deleteReaderDataForBook(bookId, false)
}

/** 清除共读者在一本书中的位置、理解状态、划线和批注。 */
export async function clearReadersForBook(bookId: string): Promise<void> {
  await deleteReaderDataForBook(bookId, true)
}

export async function getReadingVisit(id: string): Promise<ReaderSession | undefined> {
  return withTransaction('readerSessions','readonly',store=>store.get(id))
}
export async function saveReadingVisit(visit:ReaderSession): Promise<void> {
  await withTransaction('readerSessions','readwrite',store=>store.put(visit))
  notifySharedLibraryChanged()
}
