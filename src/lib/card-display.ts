/** How a card's state is worded and colored, shared by the app screens. */
import { dueLabel, shortDate, type CardStatus, type CycleState } from './cycles';

export type Tone = 'danger' | 'warning' | 'success' | 'neutral';

export function cardTone(state: CycleState): Tone {
  switch (state) {
    case 'overdue':
      return 'danger';
    case 'dueSoon':
      return 'warning';
    case 'paid':
      return 'success';
    default:
      return 'neutral';
  }
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
