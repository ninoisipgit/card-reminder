/**
 * Which card reminders should exist right now (pure, no scheduling).
 *
 * PRD rules:
 * - one reminder `reminderDaysBefore` days before the due date, at REMINDER_HOUR
 * - once a cycle is overdue and unpaid: every 4 hours until marked paid
 *
 * "Until marked paid" can't be scheduled forever, so overdue repeats are planned
 * for OVERDUE_DAYS ahead. Every app open and every data change re-plans, which
 * keeps them going. They're also planned ahead of the due date, so they start
 * even if the app isn't opened.
 */
import { shortDate, type CardStatus, type IsoDate } from './cycles';

export const REMINDER_HOUR = 9; // PRD open question; 9:00 AM assumed
export const OVERDUE_EVERY_HOURS = 4;
export const OVERDUE_DAYS = 7;

export type PlannedReminder = {
  /** Stable id, so re-planning the same reminder replaces it. */
  id: string;
  cardId: string;
  kind: 'dueSoon' | 'overdue';
  at: Date;
  title: string;
  body: string;
};

function atHour(iso: IsoDate, hour: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

export function planCardReminders(statuses: CardStatus[], now: Date): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const horizon = now.getTime() + OVERDUE_DAYS * 24 * 3_600_000;

  for (const { card, current, state } of statuses) {
    const due = shortDate(current.due);

    if (state !== 'overdue') {
      const remindAt = atHour(current.reminder, REMINDER_HOUR);
      if (remindAt > now) {
        const days = card.reminderDaysBefore;
        plan.push({
          id: `card-${card.id}-${current.statement}-soon`,
          cardId: card.id,
          kind: 'dueSoon',
          at: remindAt,
          title: days === 0 ? `${card.name} is due today` : `${card.name} is due in ${days} day${days === 1 ? '' : 's'}`,
          body: `Due ${due}. Mark it paid once you've paid.`,
        });
      }
    }

    // Overdue repeats: from the morning after the due date, or from now if already overdue.
    const dayAfterDue = atHour(current.due, REMINDER_HOUR);
    dayAfterDue.setDate(dayAfterDue.getDate() + 1);
    let at = state === 'overdue' ? new Date(now.getTime() + OVERDUE_EVERY_HOURS * 3_600_000) : dayAfterDue;
    while (at.getTime() <= horizon) {
      if (at > now) {
        plan.push({
          id: `card-${card.id}-${current.statement}-late-${at.getTime()}`,
          cardId: card.id,
          kind: 'overdue',
          at,
          title: `${card.name} is overdue`,
          body: `It was due ${due}. Pay it and mark it paid to stop these reminders.`,
        });
      }
      at = new Date(at.getTime() + OVERDUE_EVERY_HOURS * 3_600_000);
    }
  }
  return plan.sort((a, b) => a.at.getTime() - b.at.getTime());
}
