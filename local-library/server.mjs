import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import {
  databasePath, deleteReaderRecordsForBook, getEpubFile, libraryDir, listEpubFiles, mergeSnapshot,
  openLibrary, putEpubFile, readSnapshot, replaceSnapshot,
} from './db.mjs'

const port = Number(process.env.MARGINALIA_LOCAL_PORT || 4317)
const host = process.env.MARGINALIA_LOCAL_HOST || '0.0.0.0'
const tokenPath = resolve(libraryDir, 'access-token')
if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(24).toString('base64url'), 'utf8')
const token = readFileSync(tokenPath, 'utf8').trim()
const db = openLibrary()

function json(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-marginalia-key',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  })
  response.end(JSON.stringify(value))
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const bytes = Buffer.concat(chunks)
  if (bytes.length > 50 * 1024 * 1024) throw new Error('Snapshot is too large')
  return JSON.parse(bytes.toString('utf8') || '{}')
}

async function bytes(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 150 * 1024 * 1024) throw new Error('EPUB is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {})
  if (request.url === '/health') {
    return json(response, 200, {
      ok: true,
      database: databasePath,
      fingerprint: createHash('sha256').update(token).digest('hex').slice(0, 12),
    })
  }
  if (request.headers['x-marginalia-key'] !== token) {
    return json(response, 401, { error: 'Invalid local library key' })
  }
  try {
    if (request.method === 'GET' && request.url === '/api/snapshot') {
      return json(response, 200, readSnapshot(db))
    }
    if (request.method === 'POST' && request.url === '/api/snapshot') {
      replaceSnapshot(db, await body(request))
      return json(response, 200, { ok: true })
    }
    if (request.method === 'POST' && request.url === '/api/import') {
      mergeSnapshot(db, await body(request))
      return json(response, 200, { ok: true })
    }
    if (request.method === 'GET' && request.url === '/api/epub-files') {
      return json(response, 200, listEpubFiles(db))
    }
    const readerRecordsUrl = new URL(request.url ?? '/', 'http://localhost')
    const readerRecordsMatch = readerRecordsUrl.pathname.match(/^\/api\/reader-records\/([^/]+)$/)
    if (readerRecordsMatch && request.method === 'DELETE') {
      const scope = readerRecordsUrl.searchParams.get('scope')
      if (scope !== 'checkpoint' && scope !== 'all') {
        return json(response, 400, { error: 'Invalid reader record scope' })
      }
      deleteReaderRecordsForBook(db, decodeURIComponent(readerRecordsMatch[1]), scope === 'all')
      return json(response, 200, { ok: true })
    }
    const epubMatch = request.url?.match(/^\/api\/epub\/([^/?]+)$/)
    if (epubMatch && request.method === 'PUT') {
      putEpubFile(db, decodeURIComponent(epubMatch[1]), await bytes(request), request.headers['content-type'])
      return json(response, 200, { ok: true })
    }
    if (epubMatch && request.method === 'GET') {
      const file = getEpubFile(db, decodeURIComponent(epubMatch[1]))
      if (!file) return json(response, 404, { error: 'EPUB not found' })
      response.writeHead(200, {
        'content-type': file.mime_type,
        'content-length': file.data.length,
        'access-control-allow-origin': '*',
      })
      return response.end(file.data)
    }
    return json(response, 404, { error: 'Not found' })
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(port, host, () => {
  process.stdout.write([
    'Marginalia local library: http://127.0.0.1:' + port,
    'Database: ' + databasePath,
    'Access key: ' + token,
  ].join('\n') + '\n')
})
