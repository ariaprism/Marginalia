import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const libraryDir = resolve(process.env.MARGINALIA_LOCAL_DIR || '.marginalia-local')
export const databasePath = resolve(libraryDir, 'library.sqlite')

mkdirSync(libraryDir, { recursive: true })

export function openLibrary() {
  const db = new DatabaseSync(databasePath)
  db.exec([
    'pragma journal_mode = WAL;',
    'pragma foreign_keys = ON;',
    'create table if not exists library_records (',
    'collection text not null, record_id text not null, payload text not null,',
    'updated_at text not null, primary key (collection, record_id));',
    'create index if not exists library_records_collection_idx',
    'on library_records(collection);',
    'create table if not exists library_files (',
    'book_id text primary key, data blob not null, mime_type text not null,',
    'added_at text not null);',
  ].join(' '))
  return db
}

const allowedCollections = new Set([
  'books', 'chapters', 'readerProgress', 'readerStates', 'readerTraces',
  'readingProgress', 'bookmarks', 'profiles', 'highlights', 'annotations', 'marginalia',
])

function recordId(collection, record) {
  if (collection === 'chapters') return record.bookId + ':' + record.index
  if (collection === 'readerProgress' || collection === 'readerStates') {
    return record.readerId + ':' + record.bookId
  }
  return String(record.id ?? record.bookId)
}

export function replaceSnapshot(db, snapshot) {
  const replace = db.prepare([
    'insert into library_records(collection, record_id, payload, updated_at)',
    'values (?, ?, ?, ?)',
    'on conflict(collection, record_id) do update set',
    'payload = excluded.payload, updated_at = excluded.updated_at',
  ].join(' '))
  const clear = db.prepare('delete from library_records where collection = ?')
  const now = new Date().toISOString()
  db.exec('begin immediate')
  try {
    for (const [collection, records] of Object.entries(snapshot)) {
      if (!allowedCollections.has(collection) || !Array.isArray(records)) continue
      clear.run(collection)
      for (const record of records) {
        replace.run(collection, recordId(collection, record), JSON.stringify(record), record.updatedAt ?? record.createdAt ?? now)
      }
    }
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

export function mergeSnapshot(db, snapshot) {
  const replace = db.prepare([
    'insert into library_records(collection, record_id, payload, updated_at)',
    'values (?, ?, ?, ?)',
    'on conflict(collection, record_id) do update set',
    'payload = excluded.payload, updated_at = excluded.updated_at',
  ].join(' '))
  const now = new Date().toISOString()
  db.exec('begin immediate')
  try {
    for (const [collection, records] of Object.entries(snapshot)) {
      if (!allowedCollections.has(collection) || !Array.isArray(records)) continue
      for (const record of records) {
        replace.run(collection, recordId(collection, record), JSON.stringify(record), record.updatedAt ?? record.createdAt ?? now)
      }
    }
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}

export function putEpubFile(db, bookId, bytes, mimeType = 'application/epub+zip', addedAt = new Date().toISOString()) {
  db.prepare([
    'insert into library_files(book_id, data, mime_type, added_at) values (?, ?, ?, ?)',
    'on conflict(book_id) do update set data = excluded.data,',
    'mime_type = excluded.mime_type, added_at = excluded.added_at',
  ].join(' ')).run(bookId, bytes, mimeType, addedAt)
}

export function getEpubFile(db, bookId) {
  return db.prepare('select data, mime_type, added_at from library_files where book_id = ?').get(bookId)
}

export function listEpubFiles(db) {
  return db.prepare('select book_id, length(data) as size, mime_type, added_at from library_files order by book_id').all()
}

export function readCollection(db, collection) {
  if (!allowedCollections.has(collection)) throw new Error('Unknown collection')
  return db.prepare(
    'select payload from library_records where collection = ? order by record_id',
  ).all(collection).map((row) => JSON.parse(row.payload))
}

export function readSnapshot(db) {
  return Object.fromEntries([...allowedCollections].map((collection) => [
    collection,
    readCollection(db, collection),
  ]))
}

export function putRecord(db, collection, record) {
  if (!allowedCollections.has(collection)) throw new Error('Unknown collection')
  db.prepare([
    'insert into library_records(collection, record_id, payload, updated_at)',
    'values (?, ?, ?, ?)',
    'on conflict(collection, record_id) do update set',
    'payload = excluded.payload, updated_at = excluded.updated_at',
  ].join(' ')).run(
    collection,
    recordId(collection, record),
    JSON.stringify(record),
    record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
  )
}

export function findRecord(db, collection, id) {
  const row = db.prepare(
    'select payload from library_records where collection = ? and record_id = ?',
  ).get(collection, id)
  return row ? JSON.parse(row.payload) : undefined
}

export function deleteReaderRecordsForBook(db, bookId, includeTraces = false) {
  const collections = includeTraces
    ? ['readerProgress', 'readerStates', 'readerTraces']
    : ['readerProgress', 'readerStates']
  const remove = db.prepare([
    'delete from library_records',
    'where collection = ? and json_extract(payload, \'$.bookId\') = ?',
  ].join(' '))
  db.exec('begin immediate')
  try {
    for (const collection of collections) remove.run(collection, bookId)
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}
