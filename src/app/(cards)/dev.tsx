/**
 * TEST TOOLS (Settings > Test tools, development builds only). Sample data, a
 * widget preview, and reminder checks. Hidden in release builds because
 * "Load sample data" replaces everything.
 */
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { WidgetPreview } from 'react-native-android-widget';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { clearAllData } from '@/data/backup';
import { getDb } from '@/data/open';
import { loadSampleData } from '@/data/sample';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, shortDate, todayIso } from '@/lib/cycles';
import {
  cancelAllReminders,
  ensureNotificationPermission,
  listScheduled,
  scheduleCardReminders,
  scheduleTestIn,
  scheduleTomorrowMorning,
  type Delivery,
  type ScheduledItem,
} from '@/lib/notifications';
import { syncAfterChange } from '@/lib/sync';
import { CardWidget, type CardWidgetProps } from '@/widgets/CardWidget';
import { loadWidgetData } from '@/widgets/render-card-widget';

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

/** Release builds (the phone) never show this screen, even from an old link. */
export default function TestToolsRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return <TestToolsScreen />;
}

function TestToolsScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
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

  /** Re-reads the database, redraws the home-screen widget and re-plans reminders. */
  const reload = async () => {
    setData(await loadWidgetData());
    await syncAfterChange();
  };

  // Load data and keep the widget current whenever the app opens.
  useEffect(() => {
    reload().catch((e: unknown) => say(`Database FAILED: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

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
        {/* A FlatList, not a ScrollView: the widget preview contains a list, and
            React Native only allows lists inside other lists. */}
        <FlatList
          data={[]}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.stack}>
          <ThemedText type="small" themeColor="textSecondary">
            Today is {shortDate(todayIso())}.{' '}
            {data ? `${data.cards.length} cards, ${data.debts.length} debts due soon in the database.` : 'Loading…'}
          </ThemedText>

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
          </Section>

          <Section title="4. Reminder tests">
            <Button
              label="Test in 2 min"
              onPress={run('2-min best effort', testIn2Min('bestEffort'))}
            />
            <Button
              label="Tomorrow 9:00 AM"
              onPress={run('Overnight', async () => {
                const blocked = await blockedReason('bestEffort');
                if (blocked) return blocked;
                await scheduleTomorrowMorning('bestEffort');
                return 'scheduled';
              })}
            />
            <Button
              label="Schedule sample card reminders"
              onPress={run('Card reminders', async () => {
                const blocked = await blockedReason('bestEffort');
                if (blocked) return blocked;
                const n = await scheduleCardReminders(data?.cards ?? [], 'bestEffort');
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
            </View>
          }
        />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  stack: { gap: Spacing.three },
  section: { gap: Spacing.two },
  preview: { alignItems: 'center' },
  button: {
    paddingVertical: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
