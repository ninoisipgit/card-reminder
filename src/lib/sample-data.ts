/**
 * PROTOTYPE ONLY. Hard-coded cards and debts, built relative to today so the
 * widget always shows one card in each state. Replaced by the real database later.
 */
import { addDays, toDayNumber, type CardConfig, type IsoDate } from './cycles';

export type DebtDirection = 'owesMe' | 'iOwe';

export type DebtDue = {
  id: string;
  person: string;
  direction: DebtDirection;
  /** Amount still unpaid, in pesos. */
  remaining: number;
  due: IsoDate;
};

/** Builds a card whose current cycle is due `dueInDays` from today. */
function sampleCard(
  id: string,
  name: string,
  today: IsoDate,
  dueInDays: number,
  paidPreviousCycle = false,
): CardConfig {
  const daysToDue = 20;
  const statement = addDays(today, dueInDays - daysToDue);
  return {
    id,
    name,
    statementDay: Number(statement.slice(8)),
    daysToDue,
    reminderDaysBefore: 3,
    addedOn: statement,
    lastPaidStatement: paidPreviousCycle ? statement : undefined,
  };
}

export function sampleCards(today: IsoDate): CardConfig[] {
  return [
    sampleCard('bpi', 'BPI Gold', today, -1), // 1 day overdue
    sampleCard('metrobank', 'Metrobank', today, 2), // due soon
    sampleCard('rcbc', 'RCBC Flex', today, 15), // upcoming
    sampleCard('unionbank', 'UnionBank', today, -5, true), // paid; next statement not cut yet
  ];
}

export function sampleDebts(today: IsoDate): DebtDue[] {
  return [
    { id: 'mama-tuition', person: 'Mama', direction: 'owesMe', remaining: 1500, due: addDays(today, 4) },
    { id: 'kuya-gas', person: 'Kuya Ben', direction: 'iOwe', remaining: 800, due: addDays(today, -2) },
    { id: 'tita-phone', person: 'Tita Rose', direction: 'owesMe', remaining: 5000, due: addDays(today, 30) },
  ];
}

/** Debts overdue or due within `windowDays` (open question in the PRD; 7 assumed). */
export function debtsForWidget(debts: DebtDue[], today: IsoDate, windowDays = 7): DebtDue[] {
  const t = toDayNumber(today);
  return debts
    .filter((d) => toDayNumber(d.due) - t <= windowDays)
    .sort((a, b) => toDayNumber(a.due) - toDayNumber(b.due));
}

/** '₱1,500' */
export function formatPeso(amount: number): string {
  const [whole, cents] = amount.toFixed(2).split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${withCommas}${cents === '00' ? '' : `.${cents}`}`;
}
