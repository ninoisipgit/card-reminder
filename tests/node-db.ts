// Test double: an in-memory SQLite database (Node's built-in) behind the app's Db interface.
import { DatabaseSync } from 'node:sqlite';

import type { Db, SqlValue } from '../src/data/db';
import { migrate } from '../src/data/schema';

export function createNodeDb(): Db {
  const d = new DatabaseSync(':memory:');
  const db: Db = {
    async execAsync(sql) {
      d.exec(sql);
    },
    async runAsync(sql, ...params: SqlValue[]) {
      const r = d.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      const row = d.prepare(sql).get(...params);
      return row ? ({ ...row } as T) : null; // plain objects, like expo-sqlite
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      return d.prepare(sql).all(...params).map((row) => ({ ...row }) as T);
    },
    // Same behaviour as expo-sqlite's withTransactionAsync
    async withTransactionAsync(task) {
      d.exec('BEGIN');
      try {
        await task();
        d.exec('COMMIT');
      } catch (e) {
        try {
          d.exec('ROLLBACK');
        } catch {
          // already rolled back
        }
        throw e;
      }
    },
  };
  return db;
}

export async function freshDb(): Promise<Db> {
  const db = createNodeDb();
  await migrate(db);
  return db;
}
