import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach } from 'vitest'

afterEach(cleanup)

/**
 * 每个用例一个空库。
 *
 * 痕迹现在真的落盘，同一个文件里的用例会互相看见对方写的划线——一个用例在某句话上
 * 划了线，后面那个用例点同一句话时看到的就不是干净状态了。db.ts 每次都重新 open，
 * 没有缓存连接，所以换掉工厂就等于换掉整个库。
 */
afterEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
