/**
 * Backup: one JSON snapshot of every table. Import checks the file first,
 * then replaces all data in a single transaction, so a bad file changes nothing.
 * (Saving/choosing the file is done by the Settings screen later.)
 */
import { DataError, nowIso, type Db, type SqlValue } from './db';
import { SCHEMA_VERSION } from './schema';

export const BACKUP_APP_ID = 'card-reminder';

/** Tables in insert order (parents before children). Columns are an allow-list. */
const TABLES = {
  people: ['id', 'name', 'created_at'],
  cards: ['id', 'name', 'statement_day', 'days_to_due', 'reminder_days_before', 'added_on', 'created_at', 'updated_at'],
  debts: ['id', 'person_id', 'direction', 'amount_cents', 'description', 'lent_on', 'due_on', 'settled_on', 'created_at', 'updated_at'],
  card_payments: ['id', 'card_id', 'statement_date', 'due_date', 'paid_on', 'created_at'],
  repayments: ['id', 'debt_id', 'amount_cents', 'paid_on', 'note', 'created_at'],
  settings: ['key', 'value'],
} as const;

type TableName = keyof typeof TABLES;
type Row = Record<string, SqlValue>;

export type Backup = {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<TableName, Row[]>;
};

/** Nudge to back up when there is data and no backup in this many days. */
export const BACKUP_NUDGE_DAYS = 30;

/** True if the database holds any cards or debts worth backing up. */
export async function hasAnyData(db: Db): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM cards) + (SELECT COUNT(*) FROM debts) AS n',
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Whether to show the backup nudge, and how to word it.
 * null = no nudge (no data, or a recent backup).
 */
export function backupNudge(
  lastBackupAt: string | null,
  hasData: boolean,
  now: Date = new Date(),
): { daysSince: number | null } | null {
  if (!hasData) return null;
  if (!lastBackupAt) return { daysSince: null };
  const days = Math.floor((now.getTime() - Date.parse(lastBackupAt)) / 86_400_000);
  return days >= BACKUP_NUDGE_DAYS ? { daysSince: days } : null;
}

export type BackupSummary = { cards: number; cardPayments: number; people: number; debts: number; repayments: number };

export async function exportBackup(db: Db): Promise<Backup> {
  const tables = {} as Record<TableName, Row[]>;
  for (const [name, cols] of Object.entries(TABLES) as [TableName, readonly string[]][]) {
    tables[name] = await db.getAllAsync<Row>(`SELECT ${cols.join(', ')} FROM ${name} ORDER BY 1`);
  }
  return { app: BACKUP_APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), tables };
}

export function summarize(backup: Backup): BackupSummary {
  const t = backup.tables;
  return {
    cards: t.cards.length,
    cardPayments: t.card_payments.length,
    people: t.people.length,
    debts: t.debts.length,
    repayments: t.repayments.length,
  };
}

/** Checks a parsed file looks like our backup. Throws BAD_BACKUP with a user-facing reason. */
export function parseBackup(data: unknown): Backup {
  const bad = (why: string): never => {
    throw new DataError('BAD_BACKUP', `This isn’t a valid backup file (${why}).`);
  };
  if (typeof data !== 'object' || data === null) bad('not a backup');
  const b = data as Partial<Backup>;
  if (b.app !== BACKUP_APP_ID) bad('made by a different app');
  if (typeof b.schemaVersion !== 'number') bad('missing version');
  if ((b.schemaVersion as number) > SCHEMA_VERSION) bad('made by a newer version of the app; update first');
  if (typeof b.tables !== 'object' || b.tables === null) bad('no data');
  const tables = {} as Record<TableName, Row[]>;
  for (const [name, cols] of Object.entries(TABLES) as [TableName, readonly string[]][]) {
    const rows = (b.tables as Record<string, unknown>)[name] ?? [];
    if (!Array.isArray(rows)) bad(`${name} is not a list`);
    tables[name] = (rows as unknown[]).map((r) => {
      if (typeof r !== 'object' || r === null) bad(`a row in ${name} is broken`);
      const row: Row = {};
      for (const c of cols) {
        const v = (r as Record<string, unknown>)[c];
        if (v !== undefined && v !== null && typeof v !== 'string' && typeof v !== 'number') {
          bad(`${name}.${c} has a wrong value`);
        }
        row[c] = (v ?? null) as SqlValue;
      }
      return row;
    });
  }
  return { app: BACKUP_APP_ID, schemaVersion: b.schemaVersion as number, exportedAt: String(b.exportedAt ?? ''), tables };
}

/** Deletes every card, debt, person and setting. Ask the user to confirm first. */
export async function clearAllData(db: Db): Promise<void> {
  const names = Object.keys(TABLES) as TableName[];
  await db.withTransactionAsync(async () => {
    for (const name of [...names].reverse()) await db.runAsync(`DELETE FROM ${name}`);
  });
}

/**
 * Replaces ALL current data with the backup. Ask the user to confirm first.
 * Any problem (including a broken link between rows) rolls everything back.
 */
export async function importBackup(db: Db, data: unknown): Promise<BackupSummary> {
  const backup = parseBackup(data);
  const names = Object.keys(TABLES) as TableName[];
  await db.withTransactionAsync(async () => {
    for (const name of [...names].reverse()) await db.runAsync(`DELETE FROM ${name}`);
    for (const name of names) {
      const cols = TABLES[name];
      const sql = `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      for (const row of backup.tables[name]) {
        try {
          await db.runAsync(sql, ...cols.map((c) => row[c]));
        } catch {
          // Missing required values, duplicates or links to missing rows
          throw new DataError('BAD_BACKUP', `This isn’t a valid backup file (a ${name} row was rejected).`);
        }
      }
    }
    const broken = await db.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (broken.length > 0) {
      throw new DataError('BAD_BACKUP', 'This isn’t a valid backup file (rows point to missing data).');
    }
  });
  return summarize(backup);
}
