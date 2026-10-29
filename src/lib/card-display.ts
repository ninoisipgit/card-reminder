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

export type AttentionSummary = { overdue: number; dueThisWeek: number; text: string };

/**
 * '1 overdue · 2 due this week' (or 'Nothing due this week'), using the same 7-day
 * window as the yellow color. Counts unpaid cards, plus debts given as days left.
 */
export function attentionSummary(cards: CardStatus[], debtDaysLeft: number[] = []): AttentionSummary {
  const days = [...cards.filter((c) => c.state !== 'paid').map((c) => c.daysLeft), ...debtDaysLeft];
  const overdue = days.filter((d) => d < 0).length;
  const dueThisWeek = days.filter((d) => d >= 0 && d <= WARNING_DAYS).length;
  const parts = [overdue ? `${overdue} overdue` : '', dueThisWeek ? `${dueThisWeek} due this week` : ''].filter(Boolean);
  return { overdue, dueThisWeek, text: parts.length ? parts.join(' · ') : 'Nothing due this week' };
}

/** Cards tab line: same wording as the widget, cards only. */
export function cardsSummary(statuses: CardStatus[]): string {
  return attentionSummary(statuses).text;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
