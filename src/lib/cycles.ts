/**
 * Credit card cycle math.
 *
 * A card is a monthly cycle, not a repeating task:
 *   statement date = the card's statement day in that month (clamped to the month's last day)
 *   due date       = statement date + daysToDue (default 20)
 *   reminder date  = due date - reminderDaysBefore (default 3)
 *
 * Dates are plain calendar days written as 'YYYY-MM-DD'. All math uses UTC day
 * numbers so time zones and daylight saving never shift a date.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

export type CardConfig = {
  id: string;
  name: string;
  /** Day of the month the statement is cut, 1-31. */
  statementDay: number;
  /** Days from statement date to due date. */
  daysToDue: number;
  /** Days before the due date to remind. */
  reminderDaysBefore: number;
  /** The day the card was added. The first tracked cycle is the first one due on or after this day. */
  addedOn: IsoDate;
  /** Statement date of the most recent cycle marked paid, if any. */
  lastPaidStatement?: IsoDate;
};

export type Cycle = {
  statement: IsoDate;
  due: IsoDate;
  reminder: IsoDate;
};

export type CycleState = 'paid' | 'upcoming' | 'dueSoon' | 'overdue';

export type CardStatus = {
  card: CardConfig;
  /** The oldest unpaid cycle: the one the user must act on next. */
  current: Cycle;
  state: CycleState;
  /** Days from today to the current cycle's due date; negative when overdue. */
  daysLeft: number;
  /** Unpaid cycles whose due date has passed (for the "2 unpaid" badge). */
  overdueCount: number;
};

const DAY_MS = 86_400_000;

export function toDayNumber(iso: IsoDate): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNumber(n: number): IsoDate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Today's date on the phone's own calendar. */
export function todayIso(now: Date = new Date()): IsoDate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, month: number): number {
  // month is 1-12; day 0 of the next month is the last day of this one
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Statement date for a given month, using the month's last day when the statement day doesn't exist. */
export function statementDateFor(year: number, month: number, statementDay: number): IsoDate {
  const day = Math.min(statementDay, daysInMonth(year, month));
  return fromDayNumber(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function cycleFor(card: CardConfig, year: number, month: number): Cycle {
  const statement = statementDateFor(year, month, card.statementDay);
  const due = addDays(statement, card.daysToDue);
  return { statement, due, reminder: addDays(due, -card.reminderDaysBefore) };
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1];
}

function prevMonth(year: number, month: number): [number, number] {
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

function yearMonth(iso: IsoDate): [number, number] {
  const [y, m] = iso.split('-').map(Number);
  return [y, m];
}

/** The oldest cycle the user still has to pay. */
export function firstUnpaidCycle(card: CardConfig): { cycle: Cycle; year: number; month: number } {
  if (card.lastPaidStatement) {
    const [y, m] = nextMonth(...yearMonth(card.lastPaidStatement));
    return { cycle: cycleFor(card, y, m), year: y, month: m };
  }
  // New card: start from the first cycle due on or after the day it was added.
  let [y, m] = prevMonth(...yearMonth(card.addedOn));
  for (;;) {
    const cycle = cycleFor(card, y, m);
    if (toDayNumber(cycle.due) >= toDayNumber(card.addedOn)) return { cycle, year: y, month: m };
    [y, m] = nextMonth(y, m);
  }
}

export function getCardStatus(card: CardConfig, today: IsoDate): CardStatus {
  const { cycle: current, year, month } = firstUnpaidCycle(card);
  const t = toDayNumber(today);
  const daysLeft = toDayNumber(current.due) - t;

  // Count every unpaid cycle whose due date has already passed.
  let overdueCount = 0;
  let [y, m] = [year, month];
  for (;;) {
    const c = cycleFor(card, y, m);
    if (toDayNumber(c.due) >= t) break;
    overdueCount += 1;
    [y, m] = nextMonth(y, m);
  }

  let state: CycleState;
  if (overdueCount > 0) state = 'overdue';
  else if (t >= toDayNumber(current.reminder)) state = 'dueSoon';
  else if (card.lastPaidStatement && t < toDayNumber(current.statement)) state = 'paid'; // paid, next statement not cut yet
  else state = 'upcoming';

  return { card, current, state, daysLeft, overdueCount };
}

/** Sort for display: overdue first, then nearest due date. */
export function sortByUrgency(statuses: CardStatus[]): CardStatus[] {
  const rank: Record<CycleState, number> = { overdue: 0, dueSoon: 1, upcoming: 2, paid: 3 };
  return [...statuses].sort(
    (a, b) => rank[a.state] - rank[b.state] || a.daysLeft - b.daysLeft,
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Nov 25' */
export function shortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** 'Due today', 'Due tomorrow', 'Due in 5 days', '2 days overdue' */
export function dueLabel(daysLeft: number): string {
  if (daysLeft < -1) return `${-daysLeft} days overdue`;
  if (daysLeft === -1) return '1 day overdue';
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  return `Due in ${daysLeft} days`;
}
