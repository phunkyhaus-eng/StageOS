export type OfflineEntity =
  | 'EVENT'
  | 'LEAD'
  | 'SETLIST'
  | 'SETLIST_ITEM'
  | 'INVOICE'
  | 'EXPENSE'
  | 'PAYOUT'
  | 'AVAILABILITY_RESPONSE';

export type OfflineOperationType = 'create' | 'update' | 'delete' | 'setlistOps';

export interface ClientOperation {
  clientId: string;
  entity: OfflineEntity;
  operation: OfflineOperationType;
  entityId: string;
  bandId: string;
  baseVersion?: number;
  payload?: Record<string, unknown>;
  setlistOps?: Array<Record<string, unknown>>;
  updatedAt: string;
}

export interface VersionedRecord {
  id: string;
  version: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

export function createClientOperation(input: Omit<ClientOperation, 'updatedAt'>): ClientOperation {
  return {
    ...input,
    updatedAt: new Date().toISOString()
  };
}

export function resolveVersionConflict(input: {
  client: VersionedRecord;
  server: VersionedRecord;
  strategy?: 'last-write-wins' | 'manual';
}) {
  const strategy = input.strategy ?? 'last-write-wins';

  if (strategy === 'manual') {
    return {
      resolved: false,
      record: input.server,
      reason: 'manual-merge-required'
    };
  }

  const clientTime = Date.parse(input.client.updatedAt);
  const serverTime = Date.parse(input.server.updatedAt);

  if (Number.isFinite(clientTime) && Number.isFinite(serverTime) && clientTime > serverTime) {
    return {
      resolved: true,
      record: {
        ...input.client,
        version: Math.max(input.client.version, input.server.version) + 1
      },
      reason: 'client-newer'
    };
  }

  return {
    resolved: true,
    record: input.server,
    reason: 'server-newer'
  };
}

export function mergePatch(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergePatch(base[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }

  return output;
}
