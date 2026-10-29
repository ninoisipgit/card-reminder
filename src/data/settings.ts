/**
 * App settings, stored in the `settings` table (so backups include them).
 * Unknown or broken values fall back to the defaults.
 */
import type { ReminderOptions } from '@/lib/reminder-plan';

import { DataError, type Db } from './db';

export type ThemeSetting = 'system' | 'light' | 'dark';

export type AppSettings = {
  /** Reminder time of day, 24-hour. */
  reminderHour: number;
  reminderMinute: number;
  /** Skip overdue repeats between 10 PM and 7 AM. Off: rely on Do Not Disturb. */
  quietNights: boolean;
  theme: ThemeSetting;
  /** ISO timestamp of the last backup file saved, or null. */
  lastBackupAt: string | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  reminderHour: 9,
  reminderMinute: 0,
  quietNights: false,
  theme: 'system',
  lastBackupAt: null,
};

const VALID: { [K in keyof AppSettings]: (v: unknown) => v is AppSettings[K] } = {
  reminderHour: (v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23,
  reminderMinute: (v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 59,
  quietNights: (v): v is boolean => typeof v === 'boolean',
  theme: (v): v is ThemeSetting => v === 'system' || v === 'light' || v === 'dark',
  lastBackupAt: (v): v is string | null => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v))),
};

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in VALID)) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      const k = key as keyof AppSettings;
      if (VALID[k](parsed)) (settings as Record<string, unknown>)[k] = parsed;
    } catch {
      // ignore a broken value; the default stays
    }
  }
  return settings;
}

export async function updateSettings(db: Db, patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [key, value] of Object.entries(patch) as [keyof AppSettings, unknown][]) {
    if (!(key in VALID) || !VALID[key](value)) {
      throw new DataError('INVALID_INPUT', `Invalid value for ${key}.`);
    }
  }
  await db.withTransactionAsync(async () => {
    for (const [key, value] of Object.entries(patch)) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      );
    }
  });
  return getSettings(db);
}

export function reminderOptionsFrom(s: AppSettings): ReminderOptions {
  return { hour: s.reminderHour, minute: s.reminderMinute, quietNights: s.quietNights };
}

/** '9:00 AM' */
export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
