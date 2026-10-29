/** How debts are worded and colored, shared by the Debts screens. */
import type { Debt } from '@/data/debts';

import type { Tone } from './card-display';
import { dueLabel, shortDate, toDayNumber, type IsoDate } from './cycles';
import { formatPeso } from './money';

/** Debts due within this many days count as "due soon" (same window as the widget). */
export const DEBT_DUE_SOON_DAYS = 7;

export type DebtDueState = 'settled' | 'overdue' | 'dueSoon' | 'later' | 'noDueDate';

export function debtDueState(debt: Debt, today: IsoDate): DebtDueState {
  if (debt.settledOn) return 'settled';
  if (!debt.dueOn) return 'noDueDate';
  const days = toDayNumber(debt.dueOn) - toDayNumber(today);
  if (days < 0) return 'overdue';
  if (days <= DEBT_DUE_SOON_DAYS) return 'dueSoon';
  return 'later';
}

/** Badge for a debt, or null when nothing needs attention. */
export function debtBadge(debt: Debt, today: IsoDate): { text: string; tone: Tone } | null {
  const state = debtDueState(debt, today);
  if (state === 'settled') return { text: 'Paid ✓', tone: 'success' };
  if (!debt.dueOn || (state !== 'overdue' && state !== 'dueSoon')) return null;
  return {
    text: dueLabel(toDayNumber(debt.dueOn) - toDayNumber(today)),
    tone: state === 'overdue' ? 'danger' : 'warning',
  };
}

/** 'Mama owes you' / 'You owe Kuya Ben' */
export function whoOwes(debt: Pick<Debt, 'direction' | 'personName'>): string {
  return debt.direction === 'owes_me' ? `${debt.personName} owes you` : `You owe ${debt.personName}`;
}

/** '₱1,500 left of ₱2,000 · Due Nov 2' */
export function debtAmountLine(debt: Debt): string {
  const amount =
    debt.settledOn
      ? `${formatPeso(debt.amountCents)} · Paid in full ${shortDate(debt.settledOn)}`
      : debt.repaidCents > 0
        ? `${formatPeso(debt.remainingCents)} left of ${formatPeso(debt.amountCents)}`
        : formatPeso(debt.amountCents);
  return !debt.settledOn && debt.dueOn ? `${amount} · Due ${shortDate(debt.dueOn)}` : amount;
}

/** Title for a debt: its description, or a fallback. */
export function debtTitle(debt: Debt): string {
  return debt.description || (debt.direction === 'owes_me' ? 'Money lent' : 'Money borrowed');
}
