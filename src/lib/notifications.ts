/**
 * Notification scheduling.
 * - syncCardReminders(): the real reminders, re-planned after every change
 * - schedule*Test*(): prototype checks of reminder reliability on this phone
 */
import * as Notifications from 'expo-notifications';

import { shortDate, type CardStatus, type IsoDate } from './cycles';
import { planCardReminders, REMINDER_HOUR } from './reminder-plan';

export const REMINDER_CHANNEL = 'payment-reminders';
/** Overdue cards repeat every 4 hours (PRD). The prototype test schedules the next 24 hours. */
export const OVERDUE_REPEAT_HOURS = 4;

/** Marks notifications created by syncCardReminders, so a re-sync only replaces those. */
const CARD_REMINDER_KIND = 'card-reminder';

/**
 * 'bestEffort' = Android may delay it a few minutes to save battery.
 * 'alarmClock' = exact time, needs the "Alarms & reminders" permission; Android shows an alarm icon.
 */
export type Delivery = 'bestEffort' | 'alarmClock';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Creates the channel (required before Android 13+ shows the permission prompt), then asks. */
export async function ensureNotificationPermission(): Promise<boolean> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Payment reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function hasExactAlarmPermission(): Promise<boolean> {
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

/** Opens Android settings; resolves when the user comes back. */
export async function requestExactAlarmPermission(): Promise<boolean> {
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

function timeLabel(date: Date): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${date.toDateString()} ${hour12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

async function scheduleAt(date: Date, title: string, body: string, delivery: Delivery): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      // Kept so the test screen can list when each one should fire.
      data: { scheduledFor: timeLabel(date), delivery },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: REMINDER_CHANNEL,
      delivery,
    },
  });
}

export function scheduleTestIn(minutes: number, delivery: Delivery): Promise<string> {
  const at = new Date(Date.now() + minutes * 60_000);
  return scheduleAt(at, `Test reminder (${delivery})`, `Expected at ${timeLabel(at)}. Note when it actually arrives.`, delivery);
}

export function scheduleTomorrowMorning(delivery: Delivery): Promise<string> {
  const at = new Date();
  at.setDate(at.getDate() + 1);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  return scheduleAt(at, `Overnight test (${delivery})`, `Expected at ${timeLabel(at)}. Leave the phone on battery overnight.`, delivery);
}

function atReminderHour(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, REMINDER_HOUR, 0, 0, 0);
}

/**
 * Real rules, sample data:
 * - not yet due: one reminder 3 days before the due date at REMINDER_HOUR
 * - overdue: every 4 hours for the next 24 hours
 * Returns how many were scheduled.
 */
export async function scheduleCardReminders(cards: CardStatus[], delivery: Delivery): Promise<number> {
  const now = Date.now();
  let count = 0;
  for (const { card, current, state } of cards) {
    if (state === 'paid') continue;
    if (state === 'overdue') {
      for (let i = 1; i * OVERDUE_REPEAT_HOURS <= 24; i++) {
        const at = new Date(now + i * OVERDUE_REPEAT_HOURS * 3_600_000);
        await scheduleAt(at, `${card.name} is overdue`, `It was due ${shortDate(current.due)}. Pay it and mark it paid.`, delivery);
        count++;
      }
      continue;
    }
    const at = atReminderHour(current.reminder);
    if (at.getTime() > now) {
      await scheduleAt(at, `${card.name} due in ${card.reminderDaysBefore} days`, `Due ${shortDate(current.due)}.`, delivery);
      count++;
    }
  }
  return count;
}

export type ScheduledItem = { id: string; title: string; scheduledFor: string };

export async function listScheduled(): Promise<ScheduledItem[]> {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  return requests.map((r) => ({
    id: r.identifier,
    title: r.content.title ?? '(no title)',
    scheduledFor: String(r.content.data?.scheduledFor ?? 'unknown time'),
  }));
}

export function cancelAllReminders(): Promise<void> {
  return Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Replaces all card reminders with a fresh plan from the current card states.
 * Safe to call often: on app open and after every change to cards.
 * Uses best-effort delivery (may be a few minutes late; no alarm icon). Revisit
 * after the overnight test on a real phone.
 */
export async function syncCardReminders(statuses: CardStatus[], now: Date = new Date()): Promise<number> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Payment reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const r of existing) {
    if (r.content.data?.kind === CARD_REMINDER_KIND) {
      await Notifications.cancelScheduledNotificationAsync(r.identifier);
    }
  }

  const plan = planCardReminders(statuses, now);
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: p.title,
        body: p.body,
        data: { kind: CARD_REMINDER_KIND, url: `/card/${p.cardId}`, scheduledFor: timeLabel(p.at) },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.at,
        channelId: REMINDER_CHANNEL,
      },
    });
  }
  return plan.length;
}
