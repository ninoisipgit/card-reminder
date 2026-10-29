import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clearAllData, exportBackup, importBackup, parseBackup } from '../src/data/backup';
import {
  addCard,
  deleteCard,
  getCardStatusById,
  listCardHistory,
  listCardStatuses,
  markCurrentCyclePaid,
  undoLastPayment,
  updateCard,
} from '../src/data/cards';
import { DataError } from '../src/data/db';
import {
  addDebt,
  addRepayment,
  deleteDebt,
  deletePerson,
  deleteRepayment,
  getDebt,
  getTotals,
  listDebtsDueSoon,
  listOpenDebts,
  listPeople,
  listPersonBalances,
  listRepayments,
  listSettledDebts,
  updateDebt,
} from '../src/data/debts';
import { loadSampleData } from '../src/data/sample';
import { migrate } from '../src/data/schema';
import { formatPeso, parsePesoToCents } from '../src/lib/money';

import { createNodeDb, freshDb } from './node-db';

const rejectsWith = (code: string) => (e: unknown) => e instanceof DataError && e.code === code;

describe('schema', () => {
  it('migrates once and is safe to run again', async () => {
    const db = createNodeDb();
    await migrate(db);
    await migrate(db);
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    assert.equal(v?.user_version, 1);
  });
});

describe('cards', () => {
  it('validates input', async () => {
    const db = await freshDb();
    await assert.rejects(addCard(db, { name: ' ', statementDay: 5 }, '2026-10-01'), rejectsWith('INVALID_INPUT'));
    await assert.rejects(addCard(db, { name: 'BPI', statementDay: 32 }, '2026-10-01'), rejectsWith('INVALID_INPUT'));
    await assert.rejects(addCard(db, { name: 'BPI', statementDay: 5, daysToDue: 0 }, '2026-10-01'), rejectsWith('INVALID_INPUT'));
  });

  it('defaults to 20 days to due and a 3-day reminder', async () => {
    const db = await freshDb();
    const id = await addCard(db, { name: 'BPI', statementDay: 30 }, '2026-09-30');
    const s = await getCardStatusById(db, id, '2026-10-01');
    assert.equal(s.current.due, '2026-10-20');
    assert.equal(s.current.reminder, '2026-10-17');
  });

  it('mark paid moves to the next cycle; undo restores it', async () => {
    const db = await freshDb();
    const id = await addCard(db, { name: 'BPI', statementDay: 5 }, '2026-10-01');
    assert.equal((await getCardStatusById(db, id, '2026-10-26')).state, 'overdue');

    const p = await markCurrentCyclePaid(db, id, '2026-10-26');
    assert.equal(p.statementDate, '2026-10-05');
    assert.equal(p.onTime, false); // paid a day late
    const after = await getCardStatusById(db, id, '2026-10-26');
    assert.equal(after.state, 'paid');
    assert.equal(after.current.due, '2026-11-25');

    await undoLastPayment(db, id);
    assert.equal((await getCardStatusById(db, id, '2026-10-26')).state, 'overdue');
    await assert.rejects(undoLastPayment(db, id), rejectsWith('NOTHING_TO_UNDO'));
  });

  it('refuses to pay a cycle whose statement is not out yet', async () => {
    const db = await freshDb();
    const id = await addCard(db, { name: 'BPI', statementDay: 5 }, '2026-10-01');
    await markCurrentCyclePaid(db, id, '2026-10-20');
    await assert.rejects(markCurrentCyclePaid(db, id, '2026-10-21'), rejectsWith('STATEMENT_NOT_OUT'));
  });

  it('two missed cycles are paid one at a time, oldest first, and history keeps both', async () => {
    const db = await freshDb();
    const id = await addCard(db, { name: 'BPI', statementDay: 5 }, '2026-10-01');
    assert.equal((await getCardStatusById(db, id, '2026-11-26')).overdueCount, 2);
    await markCurrentCyclePaid(db, id, '2026-11-26');
    const mid = await getCardStatusById(db, id, '2026-11-26');
    assert.equal(mid.overdueCount, 1);
    assert.equal(mid.current.statement, '2026-11-05');
    await markCurrentCyclePaid(db, id, '2026-11-26');
    const history = await listCardHistory(db, id);
    assert.deepEqual(history.map((h) => h.statementDate), ['2026-11-05', '2026-10-05']);
  });

  it('changing the statement day affects future cycles only', async () => {
    const db = await freshDb();
    const id = await addCard(db, { name: 'BPI', statementDay: 5 }, '2026-10-01');
    await markCurrentCyclePaid(db, id, '2026-10-20');
    await updateCard(db, id, { name: 'BPI', statementDay: 10 });
    const s = await getCardStatusById(db, id, '2026-10-21');
    assert.equal(s.current.statement, '2026-11-10');
    assert.equal((await listCardHistory(db, id))[0].statementDate, '2026-10-05');
  });

  it('lists most urgent first and deleting removes history', async () => {
    const db = await freshDb();
    const a = await addCard(db, { name: 'A later', statementDay: 20 }, '2026-10-21');
    const b = await addCard(db, { name: 'B overdue', statementDay: 5 }, '2026-10-01');
    const list = await listCardStatuses(db, '2026-10-26');
    assert.deepEqual(list.map((s) => s.card.id), [String(b), String(a)]);
    await markCurrentCyclePaid(db, b, '2026-10-26');
    await deleteCard(db, b);
    const rows = await db.getAllAsync('SELECT * FROM card_payments');
    assert.equal(rows.length, 0);
  });
});

describe('debts', () => {
  const lend = (overrides: Partial<Parameters<typeof addDebt>[1]> = {}) => ({
    personName: 'Mama',
    direction: 'owes_me' as const,
    amountCents: 200_000,
    lentOn: '2026-10-01',
    ...overrides,
  });

  it('matches people by name, ignoring case and spaces', async () => {
    const db = await freshDb();
    await addDebt(db, lend());
    await addDebt(db, lend({ personName: '  mama ' }));
    assert.equal((await listPeople(db)).length, 1);
  });

  it('partial repayments reduce the balance; the last one settles the debt', async () => {
    const db = await freshDb();
    const id = await addDebt(db, lend());
    await addRepayment(db, id, 50_000, '2026-10-05');
    let d = await getDebt(db, id);
    assert.equal(d.remainingCents, 150_000);
    assert.equal(d.settledOn, null);

    await addRepayment(db, id, 150_000, '2026-10-20');
    d = await getDebt(db, id);
    assert.equal(d.remainingCents, 0);
    assert.equal(d.settledOn, '2026-10-20');
    assert.equal((await listOpenDebts(db)).length, 0);
    assert.equal((await listSettledDebts(db)).length, 1);
  });

  it('rejects overpayment and payments on a settled debt', async () => {
    const db = await freshDb();
    const id = await addDebt(db, lend({ amountCents: 1_000 }));
    await assert.rejects(addRepayment(db, id, 1_001, '2026-10-02'), rejectsWith('OVERPAYMENT'));
    await addRepayment(db, id, 1_000, '2026-10-02');
    await assert.rejects(addRepayment(db, id, 1, '2026-10-03'), rejectsWith('ALREADY_SETTLED'));
    assert.equal((await listRepayments(db, id)).length, 1); // the rejected ones left nothing behind
  });

  it('deleting a repayment reopens a settled debt', async () => {
    const db = await freshDb();
    const id = await addDebt(db, lend({ amountCents: 1_000 }));
    const r = await addRepayment(db, id, 1_000, '2026-10-02');
    await deleteRepayment(db, r);
    assert.equal((await getDebt(db, id)).settledOn, null);
  });

  it('amount cannot be edited below what was repaid; raising it reopens', async () => {
    const db = await freshDb();
    const id = await addDebt(db, lend({ amountCents: 1_000 }));
    await addRepayment(db, id, 1_000, '2026-10-02');
    await assert.rejects(updateDebt(db, id, lend({ amountCents: 999 })), rejectsWith('AMOUNT_BELOW_REPAID'));
    await updateDebt(db, id, lend({ amountCents: 1_500 }));
    const d = await getDebt(db, id);
    assert.equal(d.settledOn, null);
    assert.equal(d.remainingCents, 500);
  });

  it('borrowing again is a separate debt; balances combine per person', async () => {
    const db = await freshDb();
    await addDebt(db, lend({ amountCents: 100_000 }));
    await addDebt(db, lend({ amountCents: 50_000 }));
    await addDebt(db, lend({ direction: 'i_owe', amountCents: 30_000 }));
    await addDebt(db, lend({ personName: 'Kuya Ben', direction: 'i_owe', amountCents: 80_000 }));
    const balances = await listPersonBalances(db);
    const mama = balances.find((b) => b.person.name === 'Mama')!;
    assert.equal(mama.owedToMeCents, 150_000);
    assert.equal(mama.iOweCents, 30_000);
    assert.equal(mama.netCents, 120_000);
    assert.equal(mama.openDebtCount, 3);
    assert.deepEqual(await getTotals(db), { owedToMeCents: 150_000, iOweCents: 110_000 });
  });

  it('due-soon list for the widget: overdue and next 7 days only', async () => {
    const db = await freshDb();
    await addDebt(db, lend({ dueOn: '2026-10-27' })); // overdue
    await addDebt(db, lend({ dueOn: '2026-11-05' })); // in 7 days
    await addDebt(db, lend({ dueOn: '2026-11-06' })); // in 8 days
    await addDebt(db, lend()); // no due date
    const due = await listDebtsDueSoon(db, '2026-10-29');
    assert.deepEqual(due.map((d) => d.dueOn), ['2026-10-27', '2026-11-05']);
  });

  it('paid history search and person deletion rules', async () => {
    const db = await freshDb();
    const id = await addDebt(db, lend({ amountCents: 500, description: 'Concert ticket' }));
    await addRepayment(db, id, 500, '2026-10-02');
    assert.equal((await listSettledDebts(db, { search: 'concert' })).length, 1);
    assert.equal((await listSettledDebts(db, { search: 'groceries' })).length, 0);
    const [person] = await listPeople(db);
    await assert.rejects(deletePerson(db, person.id), rejectsWith('PERSON_HAS_DEBTS'));
    await deleteDebt(db, id);
    await deletePerson(db, person.id);
    assert.equal((await db.getAllAsync('SELECT * FROM repayments')).length, 0);
  });
});

describe('backup', () => {
  it('round-trips everything, including history', async () => {
    const a = await freshDb();
    await loadSampleData(a, '2026-10-29');
    const file = JSON.parse(JSON.stringify(await exportBackup(a)));

    const b = await freshDb();
    const summary = await importBackup(b, file);
    assert.deepEqual(summary, { cards: 4, cardPayments: 1, people: 4, debts: 4, repayments: 2 });
    assert.deepEqual(await exportBackup(b).then((x) => x.tables), file.tables);
    assert.deepEqual(
      (await listCardStatuses(b, '2026-10-29')).map((s) => s.state),
      (await listCardStatuses(a, '2026-10-29')).map((s) => s.state),
    );
  });

  it('a bad file changes nothing', async () => {
    const db = await freshDb();
    await loadSampleData(db, '2026-10-29');
    const before = await exportBackup(db);
    const broken = JSON.parse(JSON.stringify(before));
    broken.tables.debts[0].person_id = 999; // points to nobody
    await assert.rejects(importBackup(db, broken), rejectsWith('BAD_BACKUP'));
    assert.deepEqual((await exportBackup(db)).tables, before.tables);

    assert.throws(() => parseBackup({ app: 'other' }), rejectsWith('BAD_BACKUP'));
    assert.throws(() => parseBackup({ ...before, schemaVersion: 99 }), rejectsWith('BAD_BACKUP'));
  });

  it('clearAllData empties every table', async () => {
    const db = await freshDb();
    await loadSampleData(db, '2026-10-29');
    await clearAllData(db);
    const t = (await exportBackup(db)).tables;
    assert.ok(Object.values(t).every((rows) => rows.length === 0));
  });
});

describe('sample data', () => {
  it('has one card in each state and the expected widget debts', async () => {
    const db = await freshDb();
    await loadSampleData(db, '2026-10-29');
    const states = (await listCardStatuses(db, '2026-10-29')).map((s) => `${s.card.name}:${s.state}`);
    assert.deepEqual(states, ['BPI Gold:overdue', 'Metrobank:dueSoon', 'RCBC Flex:upcoming', 'UnionBank:paid']);
    const due = await listDebtsDueSoon(db, '2026-10-29');
    assert.deepEqual(due.map((d) => `${d.personName}:${d.remainingCents}`), ['Kuya Ben:80000', 'Mama:150000']);
  });
});

describe('money', () => {
  it('formats and parses pesos', () => {
    assert.equal(formatPeso(150_000), '₱1,500');
    assert.equal(formatPeso(150_050), '₱1,500.50');
    assert.equal(formatPeso(5), '₱0.05');
    assert.equal(parsePesoToCents('1,500.5'), 150_050);
    assert.equal(parsePesoToCents('₱ 2000'), 200_000);
    assert.equal(parsePesoToCents('0'), null);
    assert.equal(parsePesoToCents('12.345'), null);
    assert.equal(parsePesoToCents('abc'), null);
  });
});
