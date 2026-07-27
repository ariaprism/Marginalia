const DB_NAME = 'marginalia'
const DB_VERSION = 1

/**
 * 连接缓存。
 *
 * 每次读写都重新 open 有两个问题：一是白读一次握手；二是并发 open 同一个还没建好的库
 * 时，几个请求会同时进 onupgradeneeded，谁先建完谁后建就成了运气——读到一半发现
 * objectStore 还不存在。缓存 Promise 之后，并发调用共用同一次 open。
 *
 * 连同 indexedDB 本身一起记下来：测试里每个用例会换一个新的 IDBFactory，
 * 换掉之后旧连接指向的是已经丢掉的那个库，必须重新开。
 */
let cached: { factory: IDBFactory; db: Promise<IDBDatabase> } | null = null

export function openMarginaliaDB(): Promise<IDBDatabase> {
  if (cached && cached.factory === indexedDB) return cached.db
  const db = openFresh()
  cached = { factory: indexedDB, db }
  // 打开失败不留下坏缓存，否则后面每次调用都拿到同一个 rejected promise。
  db.catch(() => { if (cached?.db === db) cached = null })
  return db
}

function openFresh(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('epubFiles')) {
        db.createObjectStore('epubFiles', { keyPath: 'bookId' })
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' })
        chapterStore.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains('readingProgress')) {
        db.createObjectStore('readingProgress', { keyPath: 'bookId' })
      }
      if (!db.objectStoreNames.contains('highlights')) {
        const highlightStore = db.createObjectStore('highlights', { keyPath: 'id' })
        highlightStore.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains('annotations')) {
        const annotationStore = db.createObjectStore('annotations', { keyPath: 'id' })
        annotationStore.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains('marginalia')) {
        const marginaliaStore = db.createObjectStore('marginalia', { keyPath: 'id' })
        marginaliaStore.createIndex('bookId', 'bookId', { unique: false })
      }
    }
  })
}

export async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = callback(store)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

export async function getAllByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openMarginaliaDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as T[])
  })
}
