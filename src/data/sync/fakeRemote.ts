import type { RemoteChange, SyncOperation } from './operations'
import type { PushResult, SyncRemote } from './engine'

type StoredRecord = {
  payload?: unknown
  occurredAt: string
  deleted: boolean
}

/** 只供自动测试使用的确定性云端。 */
export class FakeSyncRemote implements SyncRemote {
  online = true
  private processed = new Set<string>()
  private records = new Map<string, StoredRecord>()
  private changes: RemoteChange[] = []

  async push(operations: SyncOperation[]): Promise<PushResult[]> {
    if (!this.online) throw new Error('offline')
    return operations.map((operation) => {
      if (this.processed.has(operation.operationId)) {
        return { operationId: operation.operationId, accepted: true }
      }
      this.processed.add(operation.operationId)
      const current = this.records.get(operation.entityKey)

      // 删除后的同 ID 不允许由旧设备复活；真正重新创建必须使用新 ID。
      const blockedByDelete = current?.deleted && operation.operation !== 'delete'
      const isNewer = !current || operation.occurredAt >= current.occurredAt
      if (!blockedByDelete && isNewer && operation.operation !== 'upload_file') {
        const deleted = operation.operation === 'delete'
        this.records.set(operation.entityKey, {
          payload: operation.payload,
          occurredAt: operation.occurredAt,
          deleted,
        })
        this.changes.push({
          changeId: this.changes.length + 1,
          entityType: operation.entityType,
          entityId: operation.entityId,
          operation: deleted ? 'delete' : 'upsert',
          payload: operation.payload,
          occurredAt: operation.occurredAt,
        })
      }
      return { operationId: operation.operationId, accepted: true }
    })
  }

  async pull(afterChangeId: number): Promise<{ changes: RemoteChange[]; cursor: number }> {
    if (!this.online) throw new Error('offline')
    const changes = this.changes.filter((change) => change.changeId > afterChangeId)
    return { changes, cursor: this.changes.at(-1)?.changeId ?? afterChangeId }
  }
}
