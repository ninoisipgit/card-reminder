/**
 * Settings: reminders, backup, appearance, data. Shown from both tabs
 * (routes (cards)/settings and debts/settings render this).
 */
import DateTimePicker from '@expo/ui/community/datetime-picker';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/choice';
import { LATEST_APK_URL } from '@/constants/app';
import { Spacing } from '@/constants/theme';
import { clearAllData, importBackup, summarize, type BackupSummary } from '@/data/backup';
import { getDb } from '@/data/open';
import { formatTime, getSettings, updateSettings, type AppSettings, type ThemeSetting } from '@/data/settings';
import { useTheme } from '@/hooks/use-theme';
import { pickBackupFile, saveBackupToFolder } from '@/lib/backup-file';
import { errorMessage } from '@/lib/card-display';
import {
  ensureNotificationPermission,
  getCardReminderSummary,
  getNotificationPermission,
  scheduleTestIn,
  type PermissionState,
} from '@/lib/notifications';
import { syncAfterChange } from '@/lib/sync';
import { applyTheme } from '@/lib/theme-setting';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    </View>
  );
}

function Row({ label, detail, right }: { label: string; detail?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function describeSummary(summary: BackupSummary): string {
  const parts = [
    `${summary.cards} ${summary.cards === 1 ? 'card' : 'cards'}`,
    `${summary.debts} ${summary.debts === 1 ? 'debt' : 'debts'}`,
    `${summary.repayments} ${summary.repayments === 1 ? 'repayment' : 'repayments'}`,
  ];
  return parts.join(', ');
}

function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}, ${formatTime(d.getHours(), d.getMinutes())}`;
}

export function SettingsScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [reminders, setReminders] = useState<{ count: number; next: string | null } | null>(null);
  const [pickingTime, setPickingTime] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [s, p, r] = await Promise.all([
        getDb().then(getSettings),
        getNotificationPermission(),
        getCardReminderSummary(),
      ]);
      setSettings(s);
      setPermission(p);
      setReminders(r);
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  // Coming back from Android settings (notifications, battery) refreshes the status.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshStatus();
    });
    return () => sub.remove();
  }, [refreshStatus]);

  const change = async (patch: Partial<AppSettings>, resync: boolean) => {
    try {
      const next = await updateSettings(await getDb(), patch);
      setSettings(next);
      if (patch.theme) applyTheme(patch.theme);
      if (resync) {
        await syncAfterChange();
        setReminders(await getCardReminderSummary());
      }
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
    }
  };

  const run = async (label: string, task: () => Promise<string | null>) => {
    setBusy(label);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ text });
    } catch (e) {
      setMessage({ text: errorMessage(e), error: true });
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const saveBackup = () =>
    run('save', async () => {
      const saved = await saveBackupToFolder(await getDb());
      return saved ? `Saved ${saved.fileName} (${describeSummary(saved.summary)}).` : null;
    });

  const restoreBackup = () =>
    run('restore', async () => {
      const backup = await pickBackupFile();
      if (!backup) return null;
      const when = backup.exportedAt ? dateTimeLabel(backup.exportedAt) : 'an unknown date';
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Replace everything with this backup?',
          `Backup from ${when}: ${describeSummary(summarize(backup))}.\n\nAll cards, debts and history on this phone will be replaced. This can’t be undone.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!ok) return null;
      const db = await getDb();
      const summary = await importBackup(db, backup);
      applyTheme((await getSettings(db)).theme);
      await syncAfterChange();
      return `Restored ${describeSummary(summary)}.`;
    });

  const deleteEverything = () =>
    Alert.alert('Delete all data?', 'Every card, debt, repayment and setting on this phone will be removed. Save a backup first if you might need it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: () =>
          run('delete', async () => {
            await clearAllData(await getDb());
            applyTheme('system');
            await syncAfterChange();
            return 'All data deleted.';
          }),
      },
    ]);

  const allowNotifications = () =>
    run('allow', async () => {
      if (permission === 'blocked') {
        await Linking.openSettings();
        return null;
      }
      const granted = await ensureNotificationPermission();
      if (granted) await syncAfterChange();
      return granted ? 'Notifications are on.' : 'Notifications are still off.';
    });

  const testReminder = () =>
    run('test', async () => {
      if (!(await ensureNotificationPermission())) return 'Allow notifications first.';
      await scheduleTestIn(1, 'bestEffort');
      return 'A test reminder will arrive in about a minute. Lock the phone to check it shows.';
    });

  const s = settings;
  const timeValue = new Date();
  if (s) timeValue.setHours(s.reminderHour, s.reminderMinute, 0, 0);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {message ? (
        <View
          style={[
            styles.message,
            { backgroundColor: message.error ? theme.dangerBackground : theme.successBackground },
          ]}>
          <ThemedText type="smallBold" style={{ color: message.error ? theme.danger : theme.success }}>
            {message.text}
          </ThemedText>
        </View>
      ) : null}

      <Section title="REMINDERS">
        <Row
          label="Reminder time"
          detail="For “due in 3 days” and the first overdue reminder."
          right={
            <Button label={s ? formatTime(s.reminderHour, s.reminderMinute) : '…'} variant="plain" onPress={() => setPickingTime(true)} />
          }
        />
        <Row
          label="Quiet at night"
          detail="Overdue cards repeat every 4 hours. Turn on to skip 10 PM – 7 AM. Off: your phone’s Do Not Disturb decides."
          right={
            <Switch
              value={s?.quietNights ?? false}
              onValueChange={(v) => change({ quietNights: v }, true)}
              accessibilityLabel="Quiet at night"
            />
          }
        />
        <Row
          label={permission === 'granted' ? 'Notifications are on' : 'Notifications are off'}
          detail={
            permission === 'granted'
              ? reminders && reminders.count > 0
                ? `${reminders.count} reminders scheduled. Next: ${reminders.next}.`
                : 'No reminders scheduled. Add a card to get some.'
              : permission === 'blocked'
                ? 'Blocked in Android settings. Reminders won’t show until you allow them.'
                : 'Allow them so card reminders can show.'
          }
          right={
            permission !== 'granted' && permission !== null ? (
              <Button
                label={permission === 'blocked' ? 'Open settings' : 'Allow'}
                variant="plain"
                onPress={allowNotifications}
                busy={busy === 'allow'}
              />
            ) : undefined
          }
        />
        <Row
          label="Reminders late or missing?"
          detail="Some phones (Xiaomi, Oppo, Vivo, Realme, Samsung) stop apps in the background. In app settings, set Battery to “No restrictions” or “Unrestricted”."
        />
        <View style={styles.buttons}>
          <Button label="Open app settings" variant="secondary" onPress={() => Linking.openSettings()} />
          <Button label="Send a test reminder" variant="secondary" onPress={testReminder} busy={busy === 'test'} />
        </View>
      </Section>

      <Section title="BACKUP">
        <Row
          label={s?.lastBackupAt ? `Last backup: ${dateTimeLabel(s.lastBackupAt)}` : 'No backup yet'}
          detail="Everything lives only on this phone. Save a backup file to Google Drive or Downloads, and restore it on a new phone."
        />
        <View style={styles.buttons}>
          <Button label="Save backup file" onPress={saveBackup} busy={busy === 'save'} />
          <Button label="Restore from a backup" variant="secondary" onPress={restoreBackup} busy={busy === 'restore'} />
        </View>
      </Section>

      <Section title="APPEARANCE">
        <Segmented<ThemeSetting>
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={s?.theme ?? 'system'}
          onChange={(t) => change({ theme: t }, false)}
        />
        <ThemedText type="small" themeColor="textSecondary">
          The home-screen widget always follows your phone’s setting.
        </ThemedText>
      </Section>

      <Section title="UPDATES">
        <Row
          label="Get the latest version"
          detail="Downloads the newest build. Open the file and tap Update; your data stays."
        />
        <Button label="Download latest version" variant="secondary" onPress={() => Linking.openURL(LATEST_APK_URL)} />
      </Section>

      <Section title="DATA">
        <Button label="Delete all data" variant="danger" onPress={deleteEverything} busy={busy === 'delete'} />
      </Section>

      <View style={styles.about}>
        <ThemedText type="small" themeColor="textSecondary">
          Card Reminder {Constants.expoConfig?.version ?? ''}
        </ThemedText>
        <Button label="Test tools" variant="plain" onPress={() => router.push('/dev')} />
      </View>

      {pickingTime && s ? (
        <DateTimePicker
          mode="time"
          value={timeValue}
          onChange={(event, date) => {
            setPickingTime(false);
            if (event.type === 'set' && date) change({ reminderHour: date.getHours(), reminderMinute: date.getMinutes() }, true);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four },
  section: { gap: Spacing.two },
  panel: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowText: { flex: 1, gap: Spacing.half },
  buttons: { gap: Spacing.two },
  message: { padding: Spacing.three, borderRadius: Spacing.three },
  about: { alignItems: 'center', gap: Spacing.one },
});
