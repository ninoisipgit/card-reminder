import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { exportBackup, importBackup } from '../src/data/backup';
import { DataError } from '../src/data/db';
import { DEFAULT_SETTINGS, formatTime, getSettings, reminderOptionsFrom, updateSettings } from '../src/data/settings';

import { freshDb } from './node-db';

describe('settings', () => {
  it('starts with defaults and saves changes', async () => {
    const db = await freshDb();
    assert.deepEqual(await getSettings(db), DEFAULT_SETTINGS);
    const s = await updateSettings(db, { reminderHour: 7, reminderMinute: 30, quietNights: true, theme: 'dark' });
    assert.equal(s.reminderHour, 7);
    assert.equal(s.theme, 'dark');
    assert.deepEqual(reminderOptionsFrom(s), { hour: 7, minute: 30, quietNights: true });
    // overwrite one key
    assert.equal((await updateSettings(db, { theme: 'light' })).theme, 'light');
    assert.equal((await getSettings(db)).reminderHour, 7);
  });

  it('rejects bad values and ignores broken stored ones', async () => {
    const db = await freshDb();
    await assert.rejects(updateSettings(db, { reminderHour: 24 }), (e) => e instanceof DataError);
    await assert.rejects(updateSettings(db, { theme: 'blue' as never }), (e) => e instanceof DataError);
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('reminderHour', 'not json')");
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('somethingElse', '1')");
    assert.equal((await getSettings(db)).reminderHour, 9);
  });

  it('travels with backups', async () => {
    const a = await freshDb();
    await updateSettings(a, { reminderHour: 8, lastBackupAt: '2026-10-29T04:00:00.000Z' });
    const b = await freshDb();
    await importBackup(b, JSON.parse(JSON.stringify(await exportBackup(a))));
    const s = await getSettings(b);
    assert.equal(s.reminderHour, 8);
    assert.equal(s.lastBackupAt, '2026-10-29T04:00:00.000Z');
  });

  it('formats times', () => {
    assert.equal(formatTime(9, 0), '9:00 AM');
    assert.equal(formatTime(0, 5), '12:05 AM');
    assert.equal(formatTime(12, 0), '12:00 PM');
    assert.equal(formatTime(18, 30), '6:30 PM');
  });
});
