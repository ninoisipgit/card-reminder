/**
 * The small slice of a SQLite database the data layer needs.
 * expo-sqlite's SQLiteDatabase matches it as-is; tests use Node's built-in SQLite.
 */
export type SqlValue = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type DataErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'OVERPAYMENT'
  | 'ALREADY_SETTLED'
  | 'AMOUNT_BELOW_REPAID'
  | 'STATEMENT_NOT_OUT'
  | 'NOTHING_TO_UNDO'
  | 'PERSON_HAS_DEBTS'
  | 'BAD_BACKUP';

/** A rule from the requirements was broken. `message` is safe to show the user. */
export class DataError extends Error {
  code: DataErrorCode;
  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = 'DataError';
    this.code = code;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DataError('INVALID_INPUT', `${field} must be a date like 2026-10-29.`);
  }
}
