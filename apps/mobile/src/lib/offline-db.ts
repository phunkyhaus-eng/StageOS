import * as SQLite from 'expo-sqlite';
import type { ClientOperation } from '@stageos/shared';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('stageos-mobile.db');
  }
  return dbPromise;
}

export async function initOfflineDb() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL
    );
  `);
}

export async function cacheEvents(events: Array<Record<string, unknown>>) {
  const db = await getDb();
  for (const event of events) {
    await db.runAsync(
      `INSERT INTO events (id, payload, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updatedAt = excluded.updatedAt`,
      String(event.id),
      JSON.stringify(event),
      String(event.updatedAt ?? new Date().toISOString())
    );
  }
}

export async function readCachedEvents() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(`SELECT payload FROM events ORDER BY updatedAt ASC`);
  return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
}

export async function queueOperation(op: ClientOperation) {
  const db = await getDb();
  await db.runAsync('INSERT INTO ops (payload) VALUES (?)', JSON.stringify(op));
}

export async function readQueuedOperations() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; payload: string }>('SELECT id, payload FROM ops ORDER BY id ASC');
  return rows.map((row) => ({
    id: row.id,
    operation: JSON.parse(row.payload) as ClientOperation
  }));
}

export async function clearQueuedOperations(ids: number[]) {
  const db = await getDb();
  for (const id of ids) {
    await db.runAsync('DELETE FROM ops WHERE id = ?', id);
  }
}

export async function addConflicts(conflicts: Array<Record<string, unknown>>) {
  const db = await getDb();
  for (const conflict of conflicts) {
    await db.runAsync('INSERT INTO conflicts (payload) VALUES (?)', JSON.stringify(conflict));
  }
}

export async function readConflicts() {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM conflicts ORDER BY id DESC');
  return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
}

export async function countQueuedOperations() {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM ops');
  return row?.count ?? 0;
}

export async function countConflicts() {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM conflicts');
  return row?.count ?? 0;
}
