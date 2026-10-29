/**
 * Sample data for testing on the phone: replaces everything with cards in
 * each state and a few family debts. Dates are relative to today so the
 * states stay the same whatever day you load it.
 */
import { addDays, type IsoDate } from '@/lib/cycles';

import { clearAllData } from './backup';
import { addCard, markCurrentCyclePaid } from './cards';
import type { Db } from './db';
import { addDebt, addRepayment } from './debts';

const DAYS_TO_DUE = 20;

/** Adds a card whose first tracked cycle is due `dueInDays` from today. */
async function sampleCard(db: Db, name: string, today: IsoDate, dueInDays: number): Promise<number> {
  const statement = addDays(today, dueInDays - DAYS_TO_DUE);
  return addCard(db, { name, statementDay: Number(statement.slice(8)), daysToDue: DAYS_TO_DUE }, statement);
}

export async function loadSampleData(db: Db, today: IsoDate): Promise<void> {
  await clearAllData(db);

  await sampleCard(db, 'BPI Gold', today, -1); // 1 day overdue
  await sampleCard(db, 'Metrobank', today, 2); // due soon
  await sampleCard(db, 'RCBC Flex', today, 15); // upcoming
  const unionbank = await sampleCard(db, 'UnionBank', today, -5);
  await markCurrentCyclePaid(db, unionbank, today, addDays(today, -6)); // paid on time; next statement not out yet

  const mama = await addDebt(db, {
    personName: 'Mama', direction: 'owes_me', amountCents: 200_000,
    description: 'School supplies', lentOn: addDays(today, -20), dueOn: addDays(today, 4),
  });
  await addRepayment(db, mama, 50_000, addDays(today, -10), 'GCash');

  await addDebt(db, {
    personName: 'Kuya Ben', direction: 'i_owe', amountCents: 80_000,
    description: 'Gas for the trip', lentOn: addDays(today, -9), dueOn: addDays(today, -2),
  });
  await addDebt(db, {
    personName: 'Tita Rose', direction: 'owes_me', amountCents: 500_000,
    description: 'Phone', lentOn: addDays(today, -3), dueOn: addDays(today, 30),
  });

  const nico = await addDebt(db, {
    personName: 'Nico', direction: 'owes_me', amountCents: 30_000,
    description: 'Concert ticket', lentOn: addDays(today, -40),
  });
  await addRepayment(db, nico, 30_000, addDays(today, -25)); // fully paid -> Paid history
}
