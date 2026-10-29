/**
 * Database schema, versioned with SQLite's `user_version`.
 * To change the schema later, append a migration; never edit one that has shipped.
 *
 * Money is stored as whole centavos (₱1,500.50 = 150050) so sums never drift.
 * Dates are 'YYYY-MM-DD' calendar days; *_at columns are ISO timestamps.
 */
import type { Db } from './db';

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE cards (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    statement_day        INTEGER NOT NULL CHECK (statement_day BETWEEN 1 AND 31),
    days_to_due          INTEGER NOT NULL DEFAULT 20 CHECK (days_to_due BETWEEN 1 AND 60),
    reminder_days_before INTEGER NOT NULL DEFAULT 3  CHECK (reminder_days_before BETWEEN 0 AND 30),
    added_on             TEXT    NOT NULL,
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
  );

  -- One row per cycle marked paid. Kept forever as the card's history.
  CREATE TABLE card_payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id        INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    statement_date TEXT    NOT NULL,
    due_date       TEXT    NOT NULL,
    paid_on        TEXT    NOT NULL,
    created_at     TEXT    NOT NULL,
    UNIQUE (card_id, statement_date)
  );
  CREATE INDEX card_payments_by_card ON card_payments (card_id, statement_date);

  CREATE TABLE people (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
    created_at TEXT    NOT NULL
  );

  CREATE TABLE debts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id    INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
    direction    TEXT    NOT NULL CHECK (direction IN ('owes_me', 'i_owe')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    description  TEXT    NOT NULL DEFAULT '',
    lent_on      TEXT    NOT NULL,
    due_on       TEXT,
    settled_on   TEXT,   -- set when repayments reach the amount; NULL while open
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );
  CREATE INDEX debts_by_person ON debts (person_id);
  CREATE INDEX debts_open_due ON debts (settled_on, due_on);

  CREATE TABLE repayments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id      INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    paid_on      TEXT    NOT NULL,
    note         TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL
  );
  CREATE INDEX repayments_by_debt ON repayments (debt_id, paid_on);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Brings any database up to the latest schema. Safe to call on every app start. */
export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database is from a newer app version (schema ${current}). Update the app.`);
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1};`);
    });
  }
}
