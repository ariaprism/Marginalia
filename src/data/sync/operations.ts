import { newId } from '../../shared/id'

export type SyncEntityType =
  | 'profile'
  | 'book'
  | 'epubFile'
  | 'chapter'
  | 'readingProgress'
  | 'highlight'
  | 'annotation'
  | 'marginalia'

export type SyncOperationKind = 'upsert' | 'delete' | 'upload_file'

export type SyncOperation<T = unknown> = {
  operationId: string
  entityType: SyncEntityType
  entityId: string
  entityKey: string
  operation: SyncOperationKind
  payload?: T
  occurredAt: string
  createdAt: string
  attempts: number
  lastError?: string
}

export type RemoteChange<T = unknown> = {
  changeId: number
  entityType: SyncEntityType
  entityId: string
  operation: Exclude<SyncOperationKind, 'upload_file'>
  payload?: T
  occurredAt: string
}

export type SyncState = {
  remoteUserId: string
  lastPulledChangeId: number
  lastSuccessfulSyncAt?: string
  initialSyncCompletedAt?: string
}

export function syncEntityKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`
}

export function createSyncOperation<T>(input: {
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperationKind
  payload?: T
  occurredAt?: string
  operationId?: string
  createdAt?: string
}): SyncOperation<T> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return {
    operationId: input.operationId ?? `sync-${newId()}`,
    entityType: input.entityType,
    entityId: input.entityId,
    entityKey: syncEntityKey(input.entityType, input.entityId),
    operation: input.operation,
    payload: input.payload,
    occurredAt: input.occurredAt ?? createdAt,
    createdAt,
    attempts: 0,
  }
}

/** 同一实体尚未寄出时只保留最后动作；不同实体绝不互相吞掉。 */
export function compactSyncOperations(operations: SyncOperation[]): SyncOperation[] {
  const latest = new Map<string, SyncOperation>()
  for (const operation of [...operations].sort((a, b) => (
    a.occurredAt.localeCompare(b.occurredAt) || a.createdAt.localeCompare(b.createdAt)
  ))) {
    latest.set(operation.entityKey, operation)
  }
  return [...latest.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
