/**
 * PROTOTYPE TEST SCREEN. Checks the two risky parts before the real app is built:
 * 1. the home-screen widget, 2. reminder reliability on this phone.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { WidgetPreview } from 'react-native-android-widget';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dueLabel, shortDate } from '@/lib/cycles';
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
import { sampleCards, sampleDebts } from '@/lib/sample-data';
import { CardWidget } from '@/widgets/CardWidget';
import { buildWidgetData, refreshCardWidget } from '@/widgets/render-card-widget';

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
  const data = useMemo(() => buildWidgetData(), []);
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

  // Keep the widget current whenever the app opens.
  useEffect(() => {
    refreshCardWidget().catch(() => {});
  }, []);

  const openedFrom = params.card
    ? sampleCards(data.today).find((c) => c.id === params.card)?.name
    : params.debt
      ? sampleDebts(data.today).find((d) => d.id === params.debt)?.person
      : undefined;

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
            Sample data only. Today is {shortDate(data.today)}.
          </ThemedText>

          {openedFrom ? (
            <View style={[styles.banner, { borderColor: '#16A34A' }]}>
              <ThemedText type="smallBold">Opened from widget: {openedFrom}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Row taps work.
              </ThemedText>
            </View>
          ) : null}

          <Section title="1. Widget">
            <View style={styles.preview}>
              <WidgetPreview
                renderWidget={() => <CardWidget {...data} theme={scheme} />}
                width={320}
                height={300}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Long-press your home screen → Widgets → card-reminder → Card reminders. It should match
              this preview. Tap a row to test opening the app.
            </ThemedText>
            <Button label="Refresh widget on home screen" onPress={run('Refresh widget', refreshCardWidget)} />
            {data.cards.map((c) => (
              <ThemedText key={c.card.id} type="small">
                {c.card.name}: {c.state}, {c.state === 'paid' ? 'next' : dueLabel(c.daysLeft).toLowerCase()} (due{' '}
                {shortDate(c.current.due)}, remind {shortDate(c.current.reminder)})
              </ThemedText>
            ))}
          </Section>

          <Section title="2. Permissions">
            <Button
              label="Allow notifications"
              onPress={run('Notifications', async () => ((await ensureNotificationPermission()) ? 'allowed' : 'NOT allowed'))}
            />
            <Button
              label="Allow exact alarms"
              onPress={run('Exact alarms', async () => ((await requestExactAlarmPermission()) ? 'allowed' : 'NOT allowed'))}
            />
          </Section>

          <Section title="3. Reminder tests">
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
                const n = await scheduleCardReminders(data.cards, (await hasExactAlarmPermission()) ? 'alarmClock' : 'bestEffort');
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
