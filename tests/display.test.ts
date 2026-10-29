import assert from 'node:assert/strict';
import { it } from 'node:test';

import { cardTone, toneForDaysLeft } from '../src/lib/card-display';
import { getCardStatus, type CardConfig } from '../src/lib/cycles';

it('colors by days left: red at 3 or less and overdue, yellow at 7 or less', () => {
  assert.equal(toneForDaysLeft(-2), 'danger');
  assert.equal(toneForDaysLeft(0), 'danger');
  assert.equal(toneForDaysLeft(3), 'danger');
  assert.equal(toneForDaysLeft(4), 'warning');
  assert.equal(toneForDaysLeft(7), 'warning');
  assert.equal(toneForDaysLeft(8), 'neutral');

  const card: CardConfig = { id: '1', name: 'BPI', statementDay: 5, daysToDue: 20, reminderDaysBefore: 3, addedOn: '2026-10-01' };
  assert.equal(cardTone(getCardStatus(card, '2026-10-10')), 'neutral'); // due Oct 25, 15 days
  assert.equal(cardTone(getCardStatus(card, '2026-10-19')), 'warning'); // 6 days
  assert.equal(cardTone(getCardStatus(card, '2026-10-23')), 'danger'); // 2 days
  assert.equal(cardTone(getCardStatus({ ...card, lastPaidStatement: '2026-10-05' }, '2026-10-23')), 'success');
});

it('summary counts overdue and due this week (7 days) across cards and debts', async () => {
  const { attentionSummary } = await import('../src/lib/card-display');
  const card: CardConfig = { id: '1', name: 'BPI', statementDay: 5, daysToDue: 20, reminderDaysBefore: 3, addedOn: '2026-10-01' };
  const overdue = getCardStatus(card, '2026-10-27'); // due Oct 25
  const soon = getCardStatus({ ...card, id: '2', statementDay: 15, addedOn: '2026-10-20' }, '2026-10-27'); // due Nov 4, 8 days -> not this week
  const paid = getCardStatus({ ...card, id: '3', lastPaidStatement: '2026-10-05' }, '2026-10-27');
  assert.deepEqual(attentionSummary([overdue, soon, paid], [2, 7, 10]), {
    overdue: 1,
    dueThisWeek: 2,
    text: '1 overdue · 2 due this week',
  });
  assert.equal(attentionSummary([paid]).text, 'Nothing due this week');
});
