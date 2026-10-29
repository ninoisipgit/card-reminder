/**
 * Opens the app's database on the phone (once) and brings it up to date.
 * Used by the app and by the widget, which runs in the background.
 */
import * as SQLite from 'expo-sqlite';

import type { Db } from './db';
import { migrate } from './schema';

export const DB_NAME = 'card-reminder.db';

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await migrate(db);
      return db;
    })().catch((e: unknown) => {
      dbPromise = null; // let the next call retry
      throw e;
    });
  }
  return dbPromise;
}
