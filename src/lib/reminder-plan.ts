/**
 * Which card reminders should exist right now (pure, no scheduling).
 *
 * PRD rules:
 * - one reminder `reminderDaysBefore` days before the due date, at the chosen time
 * - once a cycle is overdue and unpaid: every 4 hours until marked paid
 *
 * "Until marked paid" can't be scheduled forever, so overdue repeats are planned
 * for OVERDUE_DAYS ahead. Every app open and every data change re-plans, which
 * keeps them going. They're also planned ahead of the due date, so they start
 * even if the app isn't opened.
 */
import { shortDate, type CardStatus, type IsoDate } from './cycles';

export const OVERDUE_EVERY_HOURS = 4;
export const OVERDUE_DAYS = 7;
/** With quiet nights on, overdue repeats skip 10 PM – 7 AM. */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 7;

export type ReminderOptions = {
  /** Time of day for the "due soon" reminder and the first overdue one. */
  hour: number;
  minute: number;
  /** Skip overdue repeats at night instead of relying on Do Not Disturb. */
  quietNights: boolean;
};

export const DEFAULT_REMINDER_OPTIONS: ReminderOptions = { hour: 9, minute: 0, quietNights: false };

function isQuiet(at: Date): boolean {
  const h = at.getHours();
  return h >= QUIET_FROM_HOUR || h < QUIET_UNTIL_HOUR;
}

export type PlannedReminder = {
  /** Stable id, so re-planning the same reminder replaces it. */
  id: string;
  cardId: string;
  kind: 'dueSoon' | 'overdue';
  at: Date;
  title: string;
  body: string;
};

function atTime(iso: IsoDate, hour: number, minute: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

export function planCardReminders(
  statuses: CardStatus[],
  now: Date,
  options: ReminderOptions = DEFAULT_REMINDER_OPTIONS,
): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  const horizon = now.getTime() + OVERDUE_DAYS * 24 * 3_600_000;

  for (const { card, current, state } of statuses) {
    const due = shortDate(current.due);

    if (state !== 'overdue') {
      const remindAt = atTime(current.reminder, options.hour, options.minute);
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
    const dayAfterDue = atTime(current.due, options.hour, options.minute);
    dayAfterDue.setDate(dayAfterDue.getDate() + 1);
    let at = state === 'overdue' ? new Date(now.getTime() + OVERDUE_EVERY_HOURS * 3_600_000) : dayAfterDue;
    while (at.getTime() <= horizon) {
      if (at > now && !(options.quietNights && isQuiet(at))) {
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
