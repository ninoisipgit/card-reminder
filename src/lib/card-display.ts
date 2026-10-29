/** How a card's state is worded and colored, shared by the app screens. */
import { dueLabel, shortDate, type CardStatus } from './cycles';

export type Tone = 'danger' | 'warning' | 'success' | 'neutral';

/** Yellow from this many days before the due date. */
export const WARNING_DAYS = 7;
/** Red from this many days before the due date, and when overdue. */
export const URGENT_DAYS = 3;

/** Color by how close the due date is: red at 3 days or less (or overdue), yellow at 7 or less. */
export function toneForDaysLeft(daysLeft: number): Tone {
  if (daysLeft <= URGENT_DAYS) return 'danger';
  if (daysLeft <= WARNING_DAYS) return 'warning';
  return 'neutral';
}

/** Paid is green; otherwise colored by days left to the due date. */
export function cardTone(status: CardStatus): Tone {
  return status.state === 'paid' ? 'success' : toneForDaysLeft(status.daysLeft);
}

/** 'Paid ✓', 'Due in 2 days', '1 day overdue' */
export function cardBadgeText(status: CardStatus): string {
  return status.state === 'paid' ? 'Paid ✓' : dueLabel(status.daysLeft);
}

/** 'Statement Nov 5 · Due Nov 25' */
export function cardDatesLine(status: CardStatus): string {
  return `Statement ${shortDate(status.current.statement)} · Due ${shortDate(status.current.due)}`;
}

/** '1 overdue · 1 due soon', or 'All paid up' */
export function cardsSummary(statuses: CardStatus[]): string {
  const overdue = statuses.filter((s) => s.state === 'overdue').length;
  const dueSoon = statuses.filter((s) => s.state === 'dueSoon').length;
  if (overdue + dueSoon === 0) return 'All paid up';
  return [overdue ? `${overdue} overdue` : '', dueSoon ? `${dueSoon} due soon` : ''].filter(Boolean).join(' · ');
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
