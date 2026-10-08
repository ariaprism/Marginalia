import { OUTBOX_CHANGED_EVENT } from '../sync/syncSignals'
import { openMarginaliaDB } from './db'

const KEY_STORAGE = 'marginalia.local-library.key'
export const SHARED_LIBRARY_CHANGED_EVENT = 'marginalia:shared-library-changed'
const COLLECTIONS = [
  'books', 'chapters', 'readerProgress', 'readerStates', 'readerTraces',
  'readingProgress', 'bookmarks', 'profiles', 'highlights', 'annotations', 'marginalia',
] as const
const BROWSER_OWNED_COLLECTIONS = [
  'books', 'chapters', 'readingProgress', 'bookmarks', 'profiles',
  'highlights', 'annotations', 'marginalia',
] as const

type Snapshot = Record<(typeof COLLECTIONS)[number], unknown[]>
type StoredEpub = { bookId: string; file: Blob; addedAt: string }

function connection() {
  const parameters = new URLSearchParams(window.location.search)
  const queryKey = parameters.get('local-key')
  if (queryKey) window.localStorage.setItem(KEY_STORAGE, queryKey)
  const key = queryKey ?? window.localStorage.getItem(KEY_STORAGE)
  if (!key) return null
  return {
    url: window.location.protocol + '//' + window.location.hostname + ':4317',
    key,
  }
}

async function request(path: string, init?: RequestInit) {
  const target = connection()
  if (!target) throw new Error('没有本地书房钥匙')
  const response = await fetch(target.url + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-marginalia-key': target.key,
      ...init?.headers,
    },
  })
  if (!response.ok) throw new Error('本地书房返回 ' + response.status)
  return response.json()
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  const target = connection()
  if (!target) throw new Error('没有本地书房钥匙')
  const response = await fetch(target.url + path, {
    ...init,
    headers: { 'x-marginalia-key': target.key, ...init?.headers },
  })
  if (!response.ok) throw new Error('本地书房返回 ' + response.status)
  return response
}

async function readSnapshot(
  collections: readonly (typeof COLLECTIONS)[number][] = COLLECTIONS,
): Promise<Partial<Snapshot>> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([...collections], 'readonly')
    const result = Object.fromEntries(
      collections.map((name) => [name, [] as unknown[]]),
    ) as Partial<Snapshot>
    for (const name of collections) {
      const read = transaction.objectStore(name).getAll()
      read.onsuccess = () => { result[name] = read.result }
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function replaceLocal(snapshot: Snapshot): Promise<void> {
  const db = await openMarginaliaDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([...COLLECTIONS], 'readwrite')
    for (const name of COLLECTIONS) {
      const store = transaction.objectStore(name)
      store.clear()
      for (const value of snapshot[name] ?? []) {
        const record = value as Record<string, unknown>
        if ((name === 'readerProgress' || name === 'readerStates')
          && typeof record.readerId === 'string' && typeof record.bookId === 'string') {
          store.put({ ...record, id: `${record.readerId}:${record.bookId}` })
        } else if (name === 'readerTraces'
          && typeof record.readerId === 'string' && typeof record.bookId === 'string') {
          store.put({ ...record, readerBookId: `${record.readerId}:${record.bookId}` })
        } else {
          store.put(record)
        }
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function pushSnapshot(): Promise<void> {
  await request('/api/snapshot', {
    method: 'POST',
    // MCP 专属的 reader* 三张表由 MCP 直接写固定文件。网页不回传它们，
    // 避免一个仍开着的旧页面覆盖小G刚留下的阅读状态。
    body: JSON.stringify(await readSnapshot(BROWSER_OWNED_COLLECTIONS)),
  })
}

async function readLocalEpubs(): Promise<StoredEpub[]> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('epubFiles', 'readonly')
    const read = transaction.objectStore('epubFiles').getAll()
    read.onsuccess = () => resolve(read.result as StoredEpub[])
    read.onerror = () => reject(read.error)
  })
}

async function pushEpubs(): Promise<void> {
  const remote = await request('/api/epub-files') as Array<{ book_id: string }>
  const existing = new Set(remote.map((item) => item.book_id))
  for (const item of await readLocalEpubs()) {
    if (existing.has(item.bookId)) continue
    await rawRequest('/api/epub/' + encodeURIComponent(item.bookId), {
      method: 'PUT', body: item.file,
      headers: { 'content-type': item.file.type || 'application/epub+zip' },
    })
  }
}

async function pullEpubs(): Promise<void> {
  const files = await request('/api/epub-files') as Array<{ book_id: string; added_at: string }>
  if (files.length === 0) return
  const downloaded = await Promise.all(files.map(async (item) => ({
    bookId: item.book_id,
    file: await (await rawRequest('/api/epub/' + encodeURIComponent(item.book_id))).blob(),
    addedAt: item.added_at,
  })))
  const db = await openMarginaliaDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('epubFiles', 'readwrite')
    const store = transaction.objectStore('epubFiles')
    for (const item of downloaded) store.put(item)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * 有钥匙时才启用固定本地书房：
 * - 服务器有书：先取回，解决换 IP 后空书架；
 * - 服务器为空而当前 Origin 有书：把这间旧书房首次搬入固定文件。
 */
export async function hydrateSharedLibrary(): Promise<boolean> {
  if (!connection()) return false
  const local = await readSnapshot()
  const importing = new URLSearchParams(window.location.search).get('import-local') === '1'
  if (importing && (local.books?.length ?? 0) > 0) {
    await request('/api/import', { method: 'POST', body: JSON.stringify(await readSnapshot(BROWSER_OWNED_COLLECTIONS)) })
    await pushEpubs()
  }
  const remote = await request('/api/snapshot') as Snapshot
  if ((remote.books?.length ?? 0) > 0) {
    await replaceLocal(remote)
    await pullEpubs()
  } else if ((local.books?.length ?? 0) > 0) {
    await pushSnapshot()
    await pushEpubs()
  }
  return true
}

export function watchSharedLibrary(): () => void {
  if (!connection()) return () => {}
  let timer = 0
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      void Promise.all([pushSnapshot(), pushEpubs()])
        .catch((error) => console.error('固定本地书房保存失败', error))
    }, 800)
  }
  window.addEventListener(OUTBOX_CHANGED_EVENT, schedule)
  window.addEventListener(SHARED_LIBRARY_CHANGED_EVENT, schedule)
  return () => {
    window.clearTimeout(timer)
    window.removeEventListener(OUTBOX_CHANGED_EVENT, schedule)
    window.removeEventListener(SHARED_LIBRARY_CHANGED_EVENT, schedule)
  }
}

export function notifySharedLibraryChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SHARED_LIBRARY_CHANGED_EVENT))
}

export async function deleteSharedReaderRecords(
  bookId: string,
  scope: 'checkpoint' | 'all',
): Promise<void> {
  if (!connection()) return
  await request(`/api/reader-records/${encodeURIComponent(bookId)}?scope=${scope}`, {
    method: 'DELETE',
  })
}
