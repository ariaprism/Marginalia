import { compactSyncOperations, type RemoteChange, type SyncOperation } from './operations'

export type PushResult = { operationId: string; accepted: boolean }

export interface SyncRemote {
  push(operations: SyncOperation[]): Promise<PushResult[]>
  pull(afterChangeId: number): Promise<{ changes: RemoteChange[]; cursor: number }>
}

export interface SyncLocal {
  pending(): Promise<SyncOperation[]>
  acknowledge(operationIds: string[]): Promise<void>
  recordFailure(operationId: string, message: string): Promise<void>
  cursor(): Promise<number>
  apply(changes: RemoteChange[], cursor: number): Promise<void>
}

export type SyncRunResult = {
  pushed: number
  pulled: number
  cursor: number
}

/**
 * 单次同步：先把本地寄出去，再取回云端变化。
 *
 * 先推可让本次拉取立即看到服务端确认后的统一顺序；失败不阻止本地继续使用，但本次
 * run 会抛错，让调度层显示“本地安全、暂时收不到云端”。
 */
export async function runSync(local: SyncLocal, remote: SyncRemote): Promise<SyncRunResult> {
  const allPending = await local.pending()
  const pending = compactSyncOperations(allPending)
  let pushed = 0
  if (pending.length) {
    try {
      const results = await remote.push(pending)
      const accepted = new Set(
        results.filter((result) => result.accepted).map((result) => result.operationId),
      )
      const acceptedEntityKeys = new Set(
        pending
          .filter((operation) => accepted.has(operation.operationId))
          .map((operation) => operation.entityKey),
      )
      // 同一对象只推最新一笔；服务端确认后，较早且已被覆盖的操作也一起出队。
      await local.acknowledge(
        allPending
          .filter((operation) => acceptedEntityKeys.has(operation.entityKey))
          .map((operation) => operation.operationId),
      )
      pushed = accepted.size
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await Promise.all(pending.map((operation) => local.recordFailure(operation.operationId, message)))
      throw error
    }
  }

  const previousCursor = await local.cursor()
  const pulled = await remote.pull(previousCursor)
  await local.apply(pulled.changes, pulled.cursor)
  return { pushed, pulled: pulled.changes.length, cursor: pulled.cursor }
}
