/**
 * PROTOTYPE TEST SCREEN. Checks the risky parts before the real screens are built:
 * the database, the home-screen widget, and reminder reliability on this phone.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { WidgetPreview } from 'react-native-android-widget';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { clearAllData } from '@/data/backup';
import { getDb } from '@/data/open';
import { loadSampleData } from '@/data/sample';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, shortDate, todayIso } from '@/lib/cycles';
import {
  cancelAllReminders,
  ensureNotificationPermission,
  hasExactAlarmPermission,
  listScheduled,
  requestExactAlarmPermission,
  scheduleCardReminders,
  scheduleTestIn,
  scheduleTomorrowMorning,
  type Delivery,
  type ScheduledItem,
} from '@/lib/notifications';
import { CardWidget, type CardWidgetProps } from '@/widgets/CardWidget';
import { loadWidgetData, refreshCardWidget } from '@/widgets/render-card-widget';

type WidgetData = Omit<CardWidgetProps, 'theme'>;

/** Resolves true if the user taps the destructive button. */
function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

export default function PrototypeScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const params = useLocalSearchParams<{ card?: string; debt?: string }>();
  const [data, setData] = useState<WidgetData | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledItem[] | null>(null);

  const say = (line: string) =>
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 12));

  const run = (label: string, task: () => Promise<string | void>) => async () => {
    try {
      const result = await task();
      say(result ? `${label}: ${result}` : `${label}: done`);
    } catch (e) {
      say(`${label} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Re-reads the database and redraws the home-screen widget. */
  const reload = async () => {
    setData(await loadWidgetData());
    await refreshCardWidget().catch(() => {});
  };

  // Load data and keep the widget current whenever the app opens.
  useEffect(() => {
    reload().catch((e: unknown) => say(`Database FAILED: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  const openedFrom = params.card
    ? (data?.cards.find((c) => c.card.id === params.card)?.card.name ?? `card #${params.card}`)
    : params.debt
      ? (data?.debts.find((d) => String(d.id) === params.debt)?.personName ?? `debt #${params.debt}`)
      : undefined;

  const loadSample = async () => {
    if (!(await confirm('Load sample data?', 'This replaces all cards and debts.', 'Replace'))) return 'cancelled';
    await loadSampleData(await getDb(), todayIso());
    await reload();
    return 'loaded';
  };

  const clearData = async () => {
    if (!(await confirm('Delete everything?', 'All cards, debts and history will be removed.', 'Delete'))) return 'cancelled';
    await clearAllData(await getDb());
    await reload();
    return 'cleared';
  };

  /** Why a test can't be scheduled yet, or undefined when it can. */
  const blockedReason = async (delivery: Delivery): Promise<string | undefined> => {
    if (!(await ensureNotificationPermission())) return 'notifications not allowed';
    if (delivery === 'alarmClock' && !(await hasExactAlarmPermission())) return 'allow exact alarms first';
    return undefined;
  };

  const testIn2Min = (delivery: Delivery) => async () => {
    const blocked = await blockedReason(delivery);
    if (blocked) return blocked;
    await scheduleTestIn(2, delivery);
    return 'scheduled';
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Prototype</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Today is {shortDate(todayIso())}.{' '}
            {data ? `${data.cards.length} cards, ${data.debts.length} debts due soon in the database.` : 'Loading…'}
          </ThemedText>

          {openedFrom ? (
            <View style={[styles.banner, { borderColor: '#16A34A' }]}>
              <ThemedText type="smallBold">Opened from widget: {openedFrom}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Row taps work.
              </ThemedText>
            </View>
          ) : null}

          <Section title="1. Data">
            <Button label="Load sample data" onPress={run('Sample data', loadSample)} />
            <Button label="Clear all data" onPress={run('Clear data', clearData)} />
          </Section>

          <Section title="2. Widget">
            <View style={styles.preview}>
              {data ? (
                <WidgetPreview
                  renderWidget={() => <CardWidget {...data} theme={scheme} />}
                  width={320}
                  height={300}
                />
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Long-press your home screen → Widgets → card-reminder → Card reminders. It should match
              this preview. Tap a row to test opening the app.
            </ThemedText>
            <Button label="Refresh widget on home screen" onPress={run('Refresh widget', reload)} />
            {data?.cards.map((c) => (
              <ThemedText key={c.card.id} type="small">
                {c.card.name}: {c.state}, {c.state === 'paid' ? 'next' : dueLabel(c.daysLeft).toLowerCase()} (due{' '}
                {shortDate(c.current.due)}, remind {shortDate(c.current.reminder)})
              </ThemedText>
            ))}
          </Section>

          <Section title="3. Permissions">
            <Button
              label="Allow notifications"
              onPress={run('Notifications', async () => ((await ensureNotificationPermission()) ? 'allowed' : 'NOT allowed'))}
            />
            <Button
              label="Allow exact alarms"
              onPress={run('Exact alarms', async () => ((await requestExactAlarmPermission()) ? 'allowed' : 'NOT allowed'))}
            />
          </Section>

          <Section title="4. Reminder tests">
            <Button
              label="Test in 2 min (best effort)"
              onPress={run('2-min best effort', testIn2Min('bestEffort'))}
            />
            <Button
              label="Test in 2 min (exact)"
              onPress={run('2-min exact', testIn2Min('alarmClock'))}
            />
            <Button
              label="Tomorrow 9:00 AM, both kinds"
              onPress={run('Overnight', async () => {
                const blocked = await blockedReason('bestEffort');
                if (blocked) return blocked;
                await scheduleTomorrowMorning('bestEffort');
                if (await hasExactAlarmPermission()) {
                  await scheduleTomorrowMorning('alarmClock');
                  return 'scheduled best effort + exact';
                }
                return 'scheduled best effort only (exact alarms not allowed)';
              })}
            />
            <Button
              label="Schedule sample card reminders"
              onPress={run('Card reminders', async () => {
                const blocked = await blockedReason('bestEffort');
                if (blocked) return blocked;
                const n = await scheduleCardReminders(data?.cards ?? [], (await hasExactAlarmPermission()) ? 'alarmClock' : 'bestEffort');
                return `${n} scheduled`;
              })}
            />
            <Button label="Show scheduled" onPress={run('Scheduled', async () => { const s = await listScheduled(); setScheduled(s); return `${s.length} pending`; })} />
            <Button label="Cancel all" onPress={run('Cancel all', async () => { await cancelAllReminders(); setScheduled([]); })} />
            {scheduled?.map((s) => (
              <ThemedText key={s.id} type="small">
                • {s.title} — {s.scheduledFor}
              </ThemedText>
            ))}
          </Section>

          <Section title="Log">
            {log.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing yet.
              </ThemedText>
            ) : (
              log.map((line, i) => (
                <ThemedText key={i} type="code">
                  {line}
                </ThemedText>
              ))
            )}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  section: { gap: Spacing.two },
  preview: { alignItems: 'center' },
  button: {
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  banner: {
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
