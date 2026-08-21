import { describe, expect, it } from 'vitest'
import { runSync, type SyncLocal } from './engine'
import { FakeSyncRemote } from './fakeRemote'
import { createSyncOperation, type RemoteChange, type SyncOperation } from './operations'

class MemoryReplica implements SyncLocal {
  operations: SyncOperation[] = []
  records = new Map<string, unknown>()
  failures = new Map<string, number>()
  changeCursor = 0

  enqueue(operation: SyncOperation) { this.operations.push(operation) }
  async pending() { return [...this.operations] }
  async acknowledge(ids: string[]) {
    const acknowledged = new Set(ids)
    this.operations = this.operations.filter((operation) => !acknowledged.has(operation.operationId))
  }
  async recordFailure(id: string) { this.failures.set(id, (this.failures.get(id) ?? 0) + 1) }
  async cursor() { return this.changeCursor }
  async apply(changes: RemoteChange[], cursor: number) {
    for (const change of changes) {
      const key = `${change.entityType}:${change.entityId}`
      if (change.operation === 'delete') this.records.delete(key)
      else this.records.set(key, change.payload)
    }
    this.changeCursor = cursor
  }
}

const annotation = (id: string, text: string, occurredAt: string) => createSyncOperation({
  operationId: `${id}-${text}`,
  entityType: 'annotation',
  entityId: id,
  operation: 'upsert',
  payload: { id, text },
  occurredAt,
})

describe('local-first sync state machine', () => {
  it('keeps writes during an outage, records failure, then retries successfully', async () => {
    const local = new MemoryReplica()
    const remote = new FakeSyncRemote()
    const operation = annotation('note-1', '雨声', '2026-08-21T10:00:00.000Z')
    local.enqueue(operation)
    remote.online = false

    await expect(runSync(local, remote)).rejects.toThrow('offline')
    expect(local.operations).toHaveLength(1)
    expect(local.failures.get(operation.operationId)).toBe(1)

    remote.online = true
    await expect(runSync(local, remote)).resolves.toMatchObject({ pushed: 1, pulled: 1 })
    expect(local.operations).toHaveLength(0)
    expect(local.records.get('annotation:note-1')).toEqual({ id: 'note-1', text: '雨声' })
  })

  it('accepts a repeated operation id without creating a repeated remote change', async () => {
    const remote = new FakeSyncRemote()
    const operation = annotation('note-1', '灯影', '2026-08-21T10:00:00.000Z')

    await remote.push([operation])
    await remote.push([operation])

    expect((await remote.pull(0)).changes).toHaveLength(1)
  })

  it('merges independent writes from two devices', async () => {
    const remote = new FakeSyncRemote()
    const deviceA = new MemoryReplica()
    const deviceB = new MemoryReplica()
    deviceA.enqueue(annotation('note-a', '第一章', '2026-08-21T10:00:00.000Z'))
    deviceB.enqueue(annotation('note-b', '第二章', '2026-08-21T10:03:00.000Z'))

    await runSync(deviceA, remote)
    await runSync(deviceB, remote)
    await runSync(deviceA, remote)

    expect([...deviceA.records.keys()].sort()).toEqual(['annotation:note-a', 'annotation:note-b'])
    expect([...deviceB.records.keys()].sort()).toEqual(['annotation:note-a', 'annotation:note-b'])
  })

  it('does not let an old device resurrect a deleted id', async () => {
    const remote = new FakeSyncRemote()
    const deviceA = new MemoryReplica()
    const deviceB = new MemoryReplica()
    deviceA.enqueue(annotation('note-1', '原批注', '2026-08-21T10:00:00.000Z'))
    await runSync(deviceA, remote)
    await runSync(deviceB, remote)

    deviceA.enqueue(createSyncOperation({
      operationId: 'delete-note-1', entityType: 'annotation', entityId: 'note-1',
      operation: 'delete', occurredAt: '2026-08-21T10:05:00.000Z',
    }))
    await runSync(deviceA, remote)
    deviceB.enqueue(annotation('note-1', '离线旧副本', '2026-08-21T10:06:00.000Z'))
    await runSync(deviceB, remote)

    expect(deviceB.records.has('annotation:note-1')).toBe(false)
    expect((await remote.pull(0)).changes.map((change) => change.operation)).toEqual(['upsert', 'delete'])
  })

  it('compacts overwritten operations and acknowledges the whole local chain', async () => {
    const remote = new FakeSyncRemote()
    const local = new MemoryReplica()
    local.enqueue(annotation('note-1', '旧字', '2026-08-21T10:00:00.000Z'))
    local.enqueue(annotation('note-1', '新字', '2026-08-21T10:01:00.000Z'))

    await runSync(local, remote)

    expect(local.operations).toHaveLength(0)
    expect((await remote.pull(0)).changes).toHaveLength(1)
    expect((await remote.pull(0)).changes[0].payload).toEqual({ id: 'note-1', text: '新字' })
  })
})
