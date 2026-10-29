import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  addDays,
  cycleFor,
  getCardStatus,
  sortByDueDate,
  statementDateFor,
  type CardConfig,
} from '../src/lib/cycles';

it('cycle math', () => {

const base: CardConfig = {
  id: 'bpi',
  name: 'BPI',
  statementDay: 5,
  daysToDue: 20,
  reminderDaysBefore: 3,
  addedOn: '2026-10-01',
};

// The user's own example: due Oct 20 -> remind Oct 17
{
  const c = cycleFor({ ...base, statementDay: 30 }, 2026, 9); // Sep 30 + 20 = Oct 20
  assert.equal(c.statement, '2026-09-30');
  assert.equal(c.due, '2026-10-20');
  assert.equal(c.reminder, '2026-10-17');
}

// Month-end clamping and leap years
assert.equal(statementDateFor(2026, 2, 31), '2026-02-28');
assert.equal(statementDateFor(2028, 2, 31), '2028-02-29');
assert.equal(statementDateFor(2026, 4, 31), '2026-04-30');

// Due date rolls into next month and next year
assert.equal(cycleFor({ ...base, statementDay: 20 }, 2026, 12).due, '2027-01-09');

// New card added Oct 1 with statement day 5: first cycle is Oct 5 -> due Oct 25
{
  const s = getCardStatus(base, '2026-10-10');
  assert.equal(s.current.due, '2026-10-25');
  assert.equal(s.state, 'upcoming');
  assert.equal(s.daysLeft, 15);
}
// Reminder day -> due soon
assert.equal(getCardStatus(base, '2026-10-22').state, 'dueSoon');
assert.equal(getCardStatus(base, '2026-10-25').state, 'dueSoon'); // due today
// Day after due -> overdue
{
  const s = getCardStatus(base, '2026-10-26');
  assert.equal(s.state, 'overdue');
  assert.equal(s.daysLeft, -1);
  assert.equal(s.overdueCount, 1);
}
// Two missed cycles
assert.equal(getCardStatus(base, '2026-11-26').overdueCount, 2);

// Marked paid early (before statement of next cycle) -> 'paid', next cycle shown
{
  const s = getCardStatus({ ...base, lastPaidStatement: '2026-10-05' }, '2026-10-28');
  assert.equal(s.current.statement, '2026-11-05');
  assert.equal(s.current.due, '2026-11-25');
  assert.equal(s.state, 'paid');
}
// After the next statement is cut it becomes 'upcoming' again
assert.equal(getCardStatus({ ...base, lastPaidStatement: '2026-10-05' }, '2026-11-06').state, 'upcoming');

// Paying never resurrects an old cycle (the bug users report in the to-do app)
{
  const s = getCardStatus({ ...base, lastPaidStatement: '2026-10-05' }, '2026-10-26');
  assert.notEqual(s.state, 'overdue');
}

// Card added late in a cycle: added Oct 24, statement day 5 -> Oct 5 cycle still due Oct 25
assert.equal(getCardStatus({ ...base, addedOn: '2026-10-24' }, '2026-10-24').current.due, '2026-10-25');
// Added after that due date -> starts at Nov cycle
assert.equal(getCardStatus({ ...base, addedOn: '2026-10-26' }, '2026-10-26').current.due, '2026-11-25');

assert.equal(addDays('2026-12-31', 1), '2027-01-01');


  // Sorted by due date, not by state: a paid card due sooner comes before an unpaid one due later
  {
    // Unpaid: statement day 9, 30 days to due, added Oct 10 -> current cycle Oct 9 -> due Nov 8
    const upcoming = getCardStatus({ ...base, id: 'u', name: 'Upcoming', statementDay: 9, daysToDue: 30, addedOn: '2026-10-10' }, '2026-10-10');
    // Paid for Sep 15; next statement Oct 15 -> due Nov 4
    const paid = getCardStatus({ ...base, id: 'p', name: 'Paid', statementDay: 15, addedOn: '2026-09-01', lastPaidStatement: '2026-09-15' }, '2026-10-10');
    assert.equal(upcoming.current.due, '2026-11-08');
    assert.equal(paid.state, 'paid');
    assert.equal(paid.current.due, '2026-11-04');
    assert.deepEqual(sortByDueDate([upcoming, paid]).map((s) => s.card.name), ['Paid', 'Upcoming']);
  }
});
