/**
 * Keeps the home-screen widget and scheduled reminders in step with the database.
 * Call syncAfterChange() after any change to cards, debts or reminder settings.
 */
import { listCardStatuses } from '@/data/cards';
import { getDb } from '@/data/open';
import { getSettings, reminderOptionsFrom } from '@/data/settings';
import { todayIso } from '@/lib/cycles';
import { syncCardReminders } from '@/lib/notifications';
import { refreshCardWidget } from '@/widgets/render-card-widget';

let lastSyncAt = 0;

/** Redraws the widget and re-plans reminders. Never throws; failures are logged. */
export async function syncAfterChange(): Promise<void> {
  lastSyncAt = Date.now();
  const results = await Promise.allSettled([
    refreshCardWidget(),
    (async () => {
      const db = await getDb();
      const [statuses, settings] = await Promise.all([listCardStatuses(db, todayIso()), getSettings(db)]);
      await syncCardReminders(statuses, reminderOptionsFrom(settings));
    })(),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') console.warn('Sync failed:', r.reason);
  }
}

/** For app-foreground events: re-sync only if the last sync is older than `maxAgeMs`. */
export async function syncIfStale(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  if (Date.now() - lastSyncAt >= maxAgeMs) await syncAfterChange();
}
