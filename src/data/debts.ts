/**
 * People, debts and repayments.
 * Each loan is its own debt; a person's balance is the sum of their open debts.
 * A debt settles automatically when repayments reach its amount.
 */
import { toDayNumber, type IsoDate } from '@/lib/cycles';

import { assertIsoDate, DataError, nowIso, type Db } from './db';

export type Direction = 'owes_me' | 'i_owe';

export type Person = { id: number; name: string };

export type Debt = {
  id: number;
  personId: number;
  personName: string;
  direction: Direction;
  amountCents: number;
  repaidCents: number;
  remainingCents: number;
  description: string;
  lentOn: IsoDate;
  dueOn: IsoDate | null;
  settledOn: IsoDate | null;
};

export type Repayment = {
  id: number;
  debtId: number;
  amountCents: number;
  paidOn: IsoDate;
  note: string;
};

export type PersonBalance = {
  person: Person;
  /** Open debts where they owe you. */
  owedToMeCents: number;
  /** Open debts where you owe them. */
  iOweCents: number;
  /** owedToMe - iOwe. Positive: they owe you overall. */
  netCents: number;
  openDebtCount: number;
};

export type Totals = { owedToMeCents: number; iOweCents: number };

export type DebtInput = {
  /** Existing person's name or a new one; matched case-insensitively. */
  personName: string;
  direction: Direction;
  amountCents: number;
  description?: string;
  lentOn: IsoDate;
  dueOn?: IsoDate | null;
};

type DebtRow = {
  id: number;
  person_id: number;
  person_name: string;
  direction: Direction;
  amount_cents: number;
  repaid_cents: number;
  description: string;
  lent_on: string;
  due_on: string | null;
  settled_on: string | null;
};

const DEBT_SELECT = `
  SELECT d.id, d.person_id, p.name AS person_name, d.direction, d.amount_cents,
         COALESCE((SELECT SUM(r.amount_cents) FROM repayments r WHERE r.debt_id = d.id), 0) AS repaid_cents,
         d.description, d.lent_on, d.due_on, d.settled_on
  FROM debts d JOIN people p ON p.id = d.person_id`;

function toDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    direction: row.direction,
    amountCents: row.amount_cents,
    repaidCents: row.repaid_cents,
    remainingCents: row.amount_cents - row.repaid_cents,
    description: row.description,
    lentOn: row.lent_on,
    dueOn: row.due_on,
    settledOn: row.settled_on,
  };
}

function assertCents(cents: number, field: string): void {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new DataError('INVALID_INPUT', `${field} must be more than ₱0.`);
  }
}

function validateDebt(input: DebtInput): void {
  if (!input.personName.trim()) throw new DataError('INVALID_INPUT', 'Name is required.');
  if (input.direction !== 'owes_me' && input.direction !== 'i_owe') {
    throw new DataError('INVALID_INPUT', 'Choose "Owes me" or "I owe".');
  }
  assertCents(input.amountCents, 'Amount');
  assertIsoDate(input.lentOn, 'Date');
  if (input.dueOn) assertIsoDate(input.dueOn, 'Due date');
}

// ---------- People ----------

/** Finds a person by name (ignoring case and extra spaces) or creates them. */
export async function findOrCreatePerson(db: Db, name: string): Promise<Person> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new DataError('INVALID_INPUT', 'Name is required.');
  const existing = await db.getFirstAsync<Person>('SELECT id, name FROM people WHERE name = ?', clean);
  if (existing) return existing;
  const res = await db.runAsync('INSERT INTO people (name, created_at) VALUES (?, ?)', clean, nowIso());
  return { id: res.lastInsertRowId, name: clean };
}

export async function renamePerson(db: Db, id: number, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new DataError('INVALID_INPUT', 'Name is required.');
  const clash = await db.getFirstAsync<{ id: number }>('SELECT id FROM people WHERE name = ? AND id <> ?', clean, id);
  if (clash) throw new DataError('INVALID_INPUT', `There is already someone named ${clean}.`);
  const res = await db.runAsync('UPDATE people SET name = ? WHERE id = ?', clean, id);
  if (res.changes === 0) throw new DataError('NOT_FOUND', 'Person not found.');
}

/** Only people with no debts (open or paid) can be deleted, so history is never lost by accident. */
export async function deletePerson(db: Db, id: number): Promise<void> {
  const used = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM debts WHERE person_id = ?', id);
  if (used && used.n > 0) {
    throw new DataError('PERSON_HAS_DEBTS', 'Delete or settle this person’s debts first.');
  }
  const res = await db.runAsync('DELETE FROM people WHERE id = ?', id);
  if (res.changes === 0) throw new DataError('NOT_FOUND', 'Person not found.');
}

export async function getPerson(db: Db, id: number): Promise<Person> {
  const p = await db.getFirstAsync<Person>('SELECT id, name FROM people WHERE id = ?', id);
  if (!p) throw new DataError('NOT_FOUND', 'Person not found.');
  return p;
}

export async function listPeople(db: Db): Promise<Person[]> {
  return db.getAllAsync<Person>('SELECT id, name FROM people ORDER BY name COLLATE NOCASE');
}

// ---------- Debts ----------

export async function addDebt(db: Db, input: DebtInput): Promise<number> {
  validateDebt(input);
  let id = 0;
  await db.withTransactionAsync(async () => {
    const person = await findOrCreatePerson(db, input.personName);
    const at = nowIso();
    const res = await db.runAsync(
      `INSERT INTO debts (person_id, direction, amount_cents, description, lent_on, due_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      person.id, input.direction, input.amountCents, (input.description ?? '').trim(),
      input.lentOn, input.dueOn ?? null, at, at,
    );
    id = res.lastInsertRowId;
  });
  return id;
}

export async function getDebt(db: Db, id: number): Promise<Debt> {
  const row = await db.getFirstAsync<DebtRow>(`${DEBT_SELECT} WHERE d.id = ?`, id);
  if (!row) throw new DataError('NOT_FOUND', 'Debt not found.');
  return toDebt(row);
}

/** Recomputes settled_on from repayments: settled on the date the last peso was repaid. */
async function refreshSettled(db: Db, debtId: number): Promise<void> {
  const debt = await getDebt(db, debtId);
  let settledOn: string | null = null;
  if (debt.remainingCents === 0) {
    const last = await db.getFirstAsync<{ paid_on: string }>(
      'SELECT MAX(paid_on) AS paid_on FROM repayments WHERE debt_id = ?',
      debtId,
    );
    settledOn = last?.paid_on ?? null;
  }
  if (settledOn !== debt.settledOn) {
    await db.runAsync('UPDATE debts SET settled_on = ?, updated_at = ? WHERE id = ?', settledOn, nowIso(), debtId);
  }
}

/** The amount can't go below what was already repaid. */
export async function updateDebt(db: Db, id: number, input: DebtInput): Promise<void> {
  validateDebt(input);
  await db.withTransactionAsync(async () => {
    const debt = await getDebt(db, id);
    if (input.amountCents < debt.repaidCents) {
      throw new DataError('AMOUNT_BELOW_REPAID', 'The amount can’t be less than what was already repaid.');
    }
    const person = await findOrCreatePerson(db, input.personName);
    await db.runAsync(
      `UPDATE debts SET person_id = ?, direction = ?, amount_cents = ?, description = ?, lent_on = ?, due_on = ?, updated_at = ?
       WHERE id = ?`,
      person.id, input.direction, input.amountCents, (input.description ?? '').trim(),
      input.lentOn, input.dueOn ?? null, nowIso(), id,
    );
    await refreshSettled(db, id);
  });
}

/** Deletes the debt and its repayments. Ask the user to confirm first. */
export async function deleteDebt(db: Db, id: number): Promise<void> {
  const res = await db.runAsync('DELETE FROM debts WHERE id = ?', id);
  if (res.changes === 0) throw new DataError('NOT_FOUND', 'Debt not found.');
}

/** Open debts, soonest due first (no due date last). Optionally for one person. */
export async function listOpenDebts(db: Db, personId?: number): Promise<Debt[]> {
  const rows = await db.getAllAsync<DebtRow>(
    `${DEBT_SELECT} WHERE d.settled_on IS NULL ${personId === undefined ? '' : 'AND d.person_id = ?'}
     ORDER BY d.due_on IS NULL, d.due_on, d.lent_on`,
    ...(personId === undefined ? [] : [personId]),
  );
  return rows.map(toDebt);
}

/** Paid history: settled debts, most recently settled first. Optional search on name or description. */
export async function listSettledDebts(db: Db, opts: { personId?: number; search?: string } = {}): Promise<Debt[]> {
  const where = ['d.settled_on IS NOT NULL'];
  const params: (string | number)[] = [];
  if (opts.personId !== undefined) {
    where.push('d.person_id = ?');
    params.push(opts.personId);
  }
  const search = opts.search?.trim();
  if (search) {
    where.push('(p.name LIKE ? OR d.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const rows = await db.getAllAsync<DebtRow>(
    `${DEBT_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.settled_on DESC, d.id DESC`,
    ...params,
  );
  return rows.map(toDebt);
}

/** Open debts that are overdue or due within `windowDays` — what the widget shows. */
export async function listDebtsDueSoon(db: Db, today: IsoDate, windowDays = 7): Promise<Debt[]> {
  const t = toDayNumber(today);
  const open = await listOpenDebts(db);
  return open.filter((d) => d.dueOn !== null && toDayNumber(d.dueOn) - t <= windowDays);
}

// ---------- Repayments ----------

/** Records a repayment. It can't be more than what is still owed. */
export async function addRepayment(
  db: Db,
  debtId: number,
  amountCents: number,
  paidOn: IsoDate,
  note = '',
): Promise<number> {
  assertCents(amountCents, 'Repayment');
  assertIsoDate(paidOn, 'Date');
  let id = 0;
  await db.withTransactionAsync(async () => {
    const debt = await getDebt(db, debtId);
    if (debt.remainingCents === 0) throw new DataError('ALREADY_SETTLED', 'This debt is already fully paid.');
    if (amountCents > debt.remainingCents) {
      throw new DataError('OVERPAYMENT', 'That’s more than what is still owed.');
    }
    const res = await db.runAsync(
      'INSERT INTO repayments (debt_id, amount_cents, paid_on, note, created_at) VALUES (?, ?, ?, ?, ?)',
      debtId, amountCents, paidOn, note.trim(), nowIso(),
    );
    id = res.lastInsertRowId;
    await refreshSettled(db, debtId);
  });
  return id;
}

/** Removing a repayment from a settled debt reopens it. */
export async function deleteRepayment(db: Db, repaymentId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ debt_id: number }>('SELECT debt_id FROM repayments WHERE id = ?', repaymentId);
    if (!row) throw new DataError('NOT_FOUND', 'Repayment not found.');
    await db.runAsync('DELETE FROM repayments WHERE id = ?', repaymentId);
    await refreshSettled(db, row.debt_id);
  });
}

export async function listRepayments(db: Db, debtId: number): Promise<Repayment[]> {
  return db.getAllAsync<Repayment>(
    `SELECT id, debt_id AS debtId, amount_cents AS amountCents, paid_on AS paidOn, note
     FROM repayments WHERE debt_id = ? ORDER BY paid_on DESC, id DESC`,
    debtId,
  );
}

// ---------- Balances ----------

/** Everyone with open debts, largest net balance first. */
export async function listPersonBalances(db: Db): Promise<PersonBalance[]> {
  const open = await listOpenDebts(db);
  const byPerson = new Map<number, PersonBalance>();
  for (const d of open) {
    const b = byPerson.get(d.personId) ?? {
      person: { id: d.personId, name: d.personName },
      owedToMeCents: 0,
      iOweCents: 0,
      netCents: 0,
      openDebtCount: 0,
    };
    if (d.direction === 'owes_me') b.owedToMeCents += d.remainingCents;
    else b.iOweCents += d.remainingCents;
    b.netCents = b.owedToMeCents - b.iOweCents;
    b.openDebtCount += 1;
    byPerson.set(d.personId, b);
  }
  return [...byPerson.values()].sort(
    (a, b) => Math.abs(b.netCents) - Math.abs(a.netCents) || a.person.name.localeCompare(b.person.name),
  );
}

export async function getTotals(db: Db): Promise<Totals> {
  const balances = await listPersonBalances(db);
  return balances.reduce<Totals>(
    (t, b) => ({ owedToMeCents: t.owedToMeCents + b.owedToMeCents, iOweCents: t.iOweCents + b.iOweCents }),
    { owedToMeCents: 0, iOweCents: 0 },
  );
}
