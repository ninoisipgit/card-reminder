/**
 * Credit cards and their paid-cycle history.
 * Cycle dates are calculated (see lib/cycles.ts); only "marked paid" is stored.
 */
import {
  firstUnpaidCycle,
  getCardStatus,
  sortByDueDate,
  toDayNumber,
  type CardConfig,
  type CardStatus,
  type IsoDate,
} from '@/lib/cycles';

import { assertIsoDate, DataError, nowIso, type Db } from './db';

export type CardInput = {
  name: string;
  statementDay: number;
  daysToDue?: number;
  reminderDaysBefore?: number;
};

export type CardPayment = {
  id: number;
  cardId: number;
  statementDate: IsoDate;
  dueDate: IsoDate;
  paidOn: IsoDate;
  /** Paid on or before the due date. */
  onTime: boolean;
};

type CardRow = {
  id: number;
  name: string;
  statement_day: number;
  days_to_due: number;
  reminder_days_before: number;
  added_on: string;
  last_paid_statement: string | null;
};

type PaymentRow = {
  id: number;
  card_id: number;
  statement_date: string;
  due_date: string;
  paid_on: string;
};

const CARD_SELECT = `
  SELECT c.id, c.name, c.statement_day, c.days_to_due, c.reminder_days_before, c.added_on,
         (SELECT MAX(p.statement_date) FROM card_payments p WHERE p.card_id = c.id) AS last_paid_statement
  FROM cards c`;

function toConfig(row: CardRow): CardConfig {
  return {
    id: String(row.id),
    name: row.name,
    statementDay: row.statement_day,
    daysToDue: row.days_to_due,
    reminderDaysBefore: row.reminder_days_before,
    addedOn: row.added_on,
    lastPaidStatement: row.last_paid_statement ?? undefined,
  };
}

function toPayment(row: PaymentRow): CardPayment {
  return {
    id: row.id,
    cardId: row.card_id,
    statementDate: row.statement_date,
    dueDate: row.due_date,
    paidOn: row.paid_on,
    onTime: toDayNumber(row.paid_on) <= toDayNumber(row.due_date),
  };
}

function validate(input: CardInput): Required<CardInput> {
  const name = input.name.trim();
  if (!name) throw new DataError('INVALID_INPUT', 'Card name is required.');
  const statementDay = input.statementDay;
  if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31) {
    throw new DataError('INVALID_INPUT', 'Statement day must be between 1 and 31.');
  }
  const daysToDue = input.daysToDue ?? 20;
  if (!Number.isInteger(daysToDue) || daysToDue < 1 || daysToDue > 60) {
    throw new DataError('INVALID_INPUT', 'Days to due date must be between 1 and 60.');
  }
  const reminderDaysBefore = input.reminderDaysBefore ?? 3;
  if (!Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 30) {
    throw new DataError('INVALID_INPUT', 'Reminder days must be between 0 and 30.');
  }
  return { name, statementDay, daysToDue, reminderDaysBefore };
}

export async function addCard(db: Db, input: CardInput, today: IsoDate): Promise<number> {
  const c = validate(input);
  assertIsoDate(today, 'today');
  const at = nowIso();
  const res = await db.runAsync(
    `INSERT INTO cards (name, statement_day, days_to_due, reminder_days_before, added_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    c.name, c.statementDay, c.daysToDue, c.reminderDaysBefore, today, at, at,
  );
  return res.lastInsertRowId;
}

/** Changing dates affects future cycles only; recorded history keeps its real dates. */
export async function updateCard(db: Db, id: number, input: CardInput): Promise<void> {
  const c = validate(input);
  const res = await db.runAsync(
    `UPDATE cards SET name = ?, statement_day = ?, days_to_due = ?, reminder_days_before = ?, updated_at = ?
     WHERE id = ?`,
    c.name, c.statementDay, c.daysToDue, c.reminderDaysBefore, nowIso(), id,
  );
  if (res.changes === 0) throw new DataError('NOT_FOUND', 'Card not found.');
}

/** Deletes the card and its history. Ask the user to confirm first. */
export async function deleteCard(db: Db, id: number): Promise<void> {
  const res = await db.runAsync('DELETE FROM cards WHERE id = ?', id);
  if (res.changes === 0) throw new DataError('NOT_FOUND', 'Card not found.');
}

export async function getCard(db: Db, id: number): Promise<CardConfig> {
  const row = await db.getFirstAsync<CardRow>(`${CARD_SELECT} WHERE c.id = ?`, id);
  if (!row) throw new DataError('NOT_FOUND', 'Card not found.');
  return toConfig(row);
}

export async function listCards(db: Db): Promise<CardConfig[]> {
  const rows = await db.getAllAsync<CardRow>(`${CARD_SELECT} ORDER BY c.name COLLATE NOCASE`);
  return rows.map(toConfig);
}

/** Every card with its current cycle and state, by due date (soonest first). */
export async function listCardStatuses(db: Db, today: IsoDate): Promise<CardStatus[]> {
  const cards = await listCards(db);
  return sortByDueDate(cards.map((c) => getCardStatus(c, today)));
}

export async function getCardStatusById(db: Db, id: number, today: IsoDate): Promise<CardStatus> {
  return getCardStatus(await getCard(db, id), today);
}

/**
 * Marks the oldest unpaid cycle as paid ("Marked paid" is the user's own
 * confirmation, not a check with the bank). With two unpaid cycles, call it twice.
 * Refuses to pay a cycle whose statement isn't out yet.
 */
export async function markCurrentCyclePaid(
  db: Db,
  cardId: number,
  today: IsoDate,
  paidOn: IsoDate = today,
): Promise<CardPayment> {
  assertIsoDate(paidOn, 'Paid on');
  const card = await getCard(db, cardId);
  const { cycle } = firstUnpaidCycle(card);
  if (toDayNumber(today) < toDayNumber(cycle.statement)) {
    throw new DataError('STATEMENT_NOT_OUT', 'This month is already paid. The next statement is not out yet.');
  }
  const res = await db.runAsync(
    `INSERT INTO card_payments (card_id, statement_date, due_date, paid_on, created_at) VALUES (?, ?, ?, ?, ?)`,
    cardId, cycle.statement, cycle.due, paidOn, nowIso(),
  );
  return toPayment({
    id: res.lastInsertRowId,
    card_id: cardId,
    statement_date: cycle.statement,
    due_date: cycle.due,
    paid_on: paidOn,
  });
}

/** Undo for a mistaken tap: removes the most recent paid cycle, restoring it as unpaid. */
export async function undoLastPayment(db: Db, cardId: number): Promise<CardPayment> {
  const row = await db.getFirstAsync<PaymentRow>(
    `SELECT id, card_id, statement_date, due_date, paid_on FROM card_payments
     WHERE card_id = ? ORDER BY statement_date DESC LIMIT 1`,
    cardId,
  );
  if (!row) throw new DataError('NOTHING_TO_UNDO', 'There is no payment to undo.');
  await db.runAsync('DELETE FROM card_payments WHERE id = ?', row.id);
  return toPayment(row);
}

/** Paid cycles, newest first. */
export async function listCardHistory(db: Db, cardId: number): Promise<CardPayment[]> {
  const rows = await db.getAllAsync<PaymentRow>(
    `SELECT id, card_id, statement_date, due_date, paid_on FROM card_payments
     WHERE card_id = ? ORDER BY statement_date DESC`,
    cardId,
  );
  return rows.map(toPayment);
}
