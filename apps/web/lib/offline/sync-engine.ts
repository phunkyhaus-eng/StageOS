'use client';

import { apiFetch } from '../api-client';
import {
  countOfflineOperations,
  queueOfflineOperation,
  readOfflineOperations,
  removeOfflineOperations,
  upsertCachedEntity,
  writeConflict
} from './indexeddb';

function cursorKey(bandId: string) {
  return `stageos-sync-cursor:${bandId}`;
}

function readCursor(bandId: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(cursorKey(bandId));
}

function writeCursor(bandId: string, cursor: string | null) {
  if (typeof window === 'undefined' || !cursor) return;
  window.localStorage.setItem(cursorKey(bandId), cursor);
}

export async function queueLocalWrite(input: {
  entity: string;
  operation: 'create' | 'update' | 'delete' | 'setlistOps';
  entityId: string;
  bandId: string;
  baseVersion?: number;
  payload?: Record<string, unknown>;
  setlistOps?: Array<Record<string, unknown>>;
}) {
  await queueOfflineOperation({
    ...input,
    updatedAt: new Date().toISOString()
  });

  return countOfflineOperations();
}

export async function runSync(input: { token: string; bandId: string; deviceId: string }) {
  const pending = await readOfflineOperations();

  if (pending.length > 0) {
    const pushPayload = {
      deviceId: input.deviceId,
      bandId: input.bandId,
      platform: 'web',
      operations: pending.map((op) => ({
        entity: op.entity,
        operation: op.operation,
        clientId: String(op.id ?? `${op.entity}:${op.entityId}:${op.updatedAt}`),
        entityId: op.entityId,
        bandId: op.bandId,
        baseVersion: op.baseVersion,
        payload: op.payload,
        setlistOps: op.setlistOps,
        updatedAt: op.updatedAt
      }))
    };

    const pushResult = await apiFetch<{
      accepted: Array<{ clientId: string }>;
      conflicts: Array<Record<string, unknown>>;
    }>('/sync/push', {
      method: 'POST',
      token: input.token,
      body: pushPayload
    });

    const acceptedIds = new Set(pushResult.accepted.map((ack) => Number(ack.clientId)));
    const removeIds = pending.map((op) => op.id).filter((id): id is number => !!id && acceptedIds.has(id));
    await removeOfflineOperations(removeIds);

    for (const conflict of pushResult.conflicts) {
      await writeConflict(conflict);
    }
  }

  const pullResult = await apiFetch<{
    cursor: string | null;
    changes: Array<{
      id: string;
      entityType: string;
      entityId: string;
      action: string;
      payload: Record<string, unknown> | null;
      version: number;
      createdAt: string;
    }>;
  }>('/sync/pull', {
    method: 'POST',
    token: input.token,
    body: {
      deviceId: input.deviceId,
      bandId: input.bandId,
      cursor: readCursor(input.bandId),
      limit: 300,
      platform: 'web'
    }
  });

  for (const change of pullResult.changes) {
    await upsertCachedEntity('CHANGELOG', change.id, change as unknown as Record<string, unknown>);
  }
  writeCursor(input.bandId, pullResult.cursor);

  return {
    pulled: pullResult.changes.length,
    pending: await countOfflineOperations(),
    cursor: pullResult.cursor
  };
}
