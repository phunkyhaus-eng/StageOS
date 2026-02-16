'use client';

import { openDB } from 'idb';

export interface OfflineOperation {
  id?: number;
  entity: string;
  operation: 'create' | 'update' | 'delete' | 'setlistOps';
  entityId: string;
  bandId: string;
  baseVersion?: number;
  payload?: Record<string, unknown>;
  setlistOps?: Array<Record<string, unknown>>;
  updatedAt: string;
}

const DB_NAME = 'stageos-offline';
const DB_VERSION = 1;

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('ops')) {
        db.createObjectStore('ops', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('cache')) {
        const cache = db.createObjectStore('cache', { keyPath: 'key' });
        cache.createIndex('entity', 'entity');
      }

      if (!db.objectStoreNames.contains('conflicts')) {
        db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
      }
    }
  });
}

export async function queueOfflineOperation(operation: OfflineOperation) {
  const db = await getDb();
  await db.add('ops', operation);
}

export async function readOfflineOperations(limit = 200): Promise<OfflineOperation[]> {
  const db = await getDb();
  const tx = db.transaction('ops', 'readonly');
  const values = await tx.store.getAll();
  await tx.done;
  return values.slice(0, limit) as OfflineOperation[];
}

export async function removeOfflineOperations(ids: number[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  const tx = db.transaction('ops', 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function countOfflineOperations() {
  const db = await getDb();
  return db.count('ops');
}

export async function upsertCachedEntity(
  entity: string,
  id: string,
  value: Record<string, unknown>
) {
  const db = await getDb();
  await db.put('cache', {
    key: `${entity}:${id}`,
    entity,
    id,
    value,
    updatedAt: new Date().toISOString()
  });
}

export async function readCachedEntities(entity: string): Promise<Array<Record<string, unknown>>> {
  const db = await getDb();
  const tx = db.transaction('cache', 'readonly');
  const index = tx.store.index('entity');
  const values = await index.getAll(entity);
  await tx.done;

  return values.map((item) => item.value as Record<string, unknown>);
}

export async function writeConflict(conflict: Record<string, unknown>) {
  const db = await getDb();
  await db.add('conflicts', {
    ...conflict,
    createdAt: new Date().toISOString()
  });
}

export async function readConflicts() {
  const db = await getDb();
  return db.getAll('conflicts');
}

export async function clearConflicts() {
  const db = await getDb();
  const tx = db.transaction('conflicts', 'readwrite');
  await tx.store.clear();
  await tx.done;
}
