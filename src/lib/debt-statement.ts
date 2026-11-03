/**
 * What goes on the shareable "unpaid list" image for one person (pure, no UI).
 * Oldest debts first, split by direction, with totals.
 */
import type { Debt, Direction } from '@/data/debts';

import type { IsoDate } from './cycles';

export type StatementRow = {
  id: number;
  lentOn: IsoDate;
  dueOn: IsoDate | null;
  description: string;
  amountCents: number;
  repaidCents: number;
  remainingCents: number;
};

export type StatementSection = {
  direction: Direction;
  /** 'Mama owes' / 'I owe Mama' */
  title: string;
  rows: StatementRow[];
  totalCents: number;
};

export type Statement = {
  personName: string;
  asOf: IsoDate;
  sections: StatementSection[];
  itemCount: number;
  /** Partial repayments already made on these open debts. */
  paidSoFarCents: number;
  /** owes_me total - i_owe total, only meaningful when both sections exist. */
  netCents: number;
};

export function buildStatement(personName: string, open: Debt[], asOf: IsoDate): Statement {
  const oldestFirst = [...open]
    .filter((d) => d.remainingCents > 0)
    .sort((a, b) => (a.lentOn === b.lentOn ? a.id - b.id : a.lentOn < b.lentOn ? -1 : 1));
  const sections: StatementSection[] = [];
  for (const direction of ['owes_me', 'i_owe'] as const) {
    const debts = oldestFirst.filter((d) => d.direction === direction);
    if (debts.length === 0) continue;
    sections.push({
      direction,
      title: direction === 'owes_me' ? `${personName} owes` : `I owe ${personName}`,
      rows: debts.map((d) => ({
        id: d.id,
        lentOn: d.lentOn,
        dueOn: d.dueOn,
        description: d.description || (direction === 'owes_me' ? 'Money lent' : 'Money borrowed'),
        amountCents: d.amountCents,
        repaidCents: d.repaidCents,
        remainingCents: d.remainingCents,
      })),
      totalCents: debts.reduce((t, d) => t + d.remainingCents, 0),
    });
  }
  const total = (dir: Direction) => sections.find((s) => s.direction === dir)?.totalCents ?? 0;
  return {
    personName,
    asOf,
    sections,
    itemCount: oldestFirst.length,
    paidSoFarCents: oldestFirst.reduce((t, d) => t + d.repaidCents, 0),
    netCents: total('owes_me') - total('i_owe'),
  };
}
