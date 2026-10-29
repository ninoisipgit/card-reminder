import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getCardStatus, type CardConfig } from '../src/lib/cycles';
import { OVERDUE_DAYS, OVERDUE_EVERY_HOURS, planCardReminders } from '../src/lib/reminder-plan';

const card: CardConfig = {
  id: '1',
  name: 'BPI',
  statementDay: 30,
  daysToDue: 20,
  reminderDaysBefore: 3,
  addedOn: '2026-09-30',
};
const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);

describe('reminder plan', () => {
  it('due Oct 20 -> reminder Oct 17 at 9:00, then overdue repeats from Oct 21 9:00 every 4h', () => {
    const now = local(2026, 10, 15, 12);
    const plan = planCardReminders([getCardStatus(card, '2026-10-15')], now);
    const soon = plan.filter((p) => p.kind === 'dueSoon');
    assert.equal(soon.length, 1);
    assert.equal(soon[0].at.getTime(), local(2026, 10, 17, 9).getTime());
    assert.equal(soon[0].title, 'BPI is due in 3 days');

    const late = plan.filter((p) => p.kind === 'overdue');
    assert.equal(late[0].at.getTime(), local(2026, 10, 21, 9).getTime());
    assert.equal(late[1].at.getTime(), local(2026, 10, 21, 13).getTime());
    // nothing beyond the planning horizon
    const horizon = now.getTime() + OVERDUE_DAYS * 86_400_000;
    assert.ok(late.every((p) => p.at.getTime() <= horizon));
  });

  it('no past reminders; ids are unique and stable', () => {
    const now = local(2026, 10, 18, 10); // after the Oct 17 reminder
    const status = getCardStatus(card, '2026-10-18');
    const a = planCardReminders([status], now);
    assert.ok(a.every((p) => p.at > now));
    assert.equal(a.filter((p) => p.kind === 'dueSoon').length, 0);
    assert.equal(new Set(a.map((p) => p.id)).size, a.length);
    assert.deepEqual(planCardReminders([status], now).map((p) => p.id), a.map((p) => p.id));
  });

  it('already overdue: every 4 hours starting 4 hours from now, for 7 days', () => {
    const now = local(2026, 10, 22, 10);
    const plan = planCardReminders([getCardStatus(card, '2026-10-22')], now);
    assert.ok(plan.every((p) => p.kind === 'overdue'));
    assert.equal(plan[0].at.getTime(), local(2026, 10, 22, 14).getTime());
    assert.equal(plan.length, (OVERDUE_DAYS * 24) / OVERDUE_EVERY_HOURS);
  });

  it('uses the chosen time, and quiet nights skip 10 PM - 7 AM repeats', () => {
    const now = local(2026, 10, 22, 10);
    const status = getCardStatus(card, '2026-10-22'); // overdue since Oct 21
    const loud = planCardReminders([status], now, { hour: 9, minute: 0, quietNights: false });
    const quiet = planCardReminders([status], now, { hour: 9, minute: 0, quietNights: true });
    assert.ok(loud.some((p) => p.at.getHours() === 2)); // 2 AM is in the loud plan
    assert.ok(quiet.length < loud.length);
    assert.ok(quiet.every((p) => p.at.getHours() >= 7 && p.at.getHours() < 22));

    const upcoming = getCardStatus(card, '2026-10-15');
    const at730 = planCardReminders([upcoming], local(2026, 10, 15, 12), { hour: 7, minute: 30, quietNights: false });
    const soon = at730.find((p) => p.kind === 'dueSoon')!;
    assert.equal(soon.at.getTime(), local(2026, 10, 17, 7).getTime() + 30 * 60_000);
  });

  it('marked paid: plans the next cycle instead', () => {
    const paid = { ...card, lastPaidStatement: '2026-09-30' };
    const plan = planCardReminders([getCardStatus(paid, '2026-10-22')], local(2026, 10, 22, 10));
    // next cycle: statement Oct 30, due Nov 19, reminder Nov 16 — beyond overdue horizon
    assert.deepEqual(plan.map((p) => p.kind), ['dueSoon']);
    assert.equal(plan[0].at.getTime(), local(2026, 11, 16, 9).getTime());
  });
});
