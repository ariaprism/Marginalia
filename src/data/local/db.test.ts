import { describe, expect, it } from 'vitest'
import { getReadingProgress } from './bookStore'
import { withTransaction } from './db'

function createVersionTwoProgress(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('marginalia', 2)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('readingProgress', { keyPath: 'bookId' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('readingProgress', 'readwrite')
      transaction.objectStore('readingProgress').put(record)
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => reject(transaction.error)
    }
  })
}

describe('IndexedDB migrations', () => {
  it('moves a v2 embedded bookmark into the v3 bookmark store', async () => {
    const locator = {
      bookId: 'legacy-book',
      position: {
        chapterIndex: 0,
        elementPath: [0],
        textOffset: 0,
        selectedText: '旧折页',
        beforeContext: '',
        afterContext: '',
      },
    }
    await createVersionTwoProgress({
      bookId: 'legacy-book',
      locator,
      bookmark: { locator, updatedAt: '2026-08-01T10:00:00.000Z' },
      chapterProgress: 10,
      totalProgress: 2,
      updatedAt: '2026-08-01T10:00:00.000Z',
    })

    expect(await getReadingProgress('legacy-book')).toMatchObject({
      bookId: 'legacy-book',
      bookmark: { locator, updatedAt: '2026-08-01T10:00:00.000Z' },
    })
    expect(await withTransaction<Record<string, unknown>>(
      'readingProgress',
      'readonly',
      (store) => store.get('legacy-book'),
    )).not.toHaveProperty('bookmark')
  })
})
