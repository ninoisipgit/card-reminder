/** Cards tab: every card with its next due date, most urgent first. */
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BottomBar } from '@/components/ui/bottom-bar';
import { HeaderButton } from '@/components/ui/header-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { backupNudge, hasAnyData } from '@/data/backup';
import { listCardStatuses } from '@/data/cards';
import { getDb } from '@/data/open';
import { getSettings } from '@/data/settings';
import { useTheme } from '@/hooks/use-theme';
import { saveBackupToFolder } from '@/lib/backup-file';
import { cardBadgeText, cardDatesLine, cardsSummary, cardTone, errorMessage } from '@/lib/card-display';
import { todayIso, type CardStatus } from '@/lib/cycles';

function CardRow({ status }: { status: CardStatus }) {
  const theme = useTheme();
  const tone = cardTone(status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${status.card.name}, ${cardBadgeText(status)}`}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: status.card.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: tone === 'danger' ? theme.dangerBackground : theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 18 }}>
          {status.card.name}
          {status.overdueCount > 1 ? ` · ${status.overdueCount} unpaid` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {cardDatesLine(status)}
        </ThemedText>
      </View>
      <StatusBadge text={cardBadgeText(status)} tone={tone} />
    </Pressable>
  );
}

/** "Later" hides the nudge until the app is next opened. */
let nudgeDismissedThisSession = false;

function BackupNudge({ daysSince, onSaved, onLater }: { daysSince: number | null; onSaved: () => void; onLater: () => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await saveBackupToFolder(await getDb())) onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.nudge, { backgroundColor: theme.warningBackground }]}>
      <ThemedText type="smallBold" style={{ color: theme.warning }}>
        {daysSince === null ? 'No backup yet' : `Last backup was ${daysSince} days ago`}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.warning }}>
        Your cards and debts are only on this phone. Save a backup to Google Drive or Downloads.
      </ThemedText>
      {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <View style={styles.nudgeButtons}>
        <View style={styles.flex}>
          <Button label="Save backup" onPress={save} busy={busy} />
        </View>
        <Button label="Later" variant="plain" onPress={onLater} />
      </View>
    </View>
  );
}

export default function CardsScreen() {
  const theme = useTheme();
  const [cards, setCards] = useState<CardStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<ReturnType<typeof backupNudge>>(null);

  // Reload whenever the tab comes back into view (after adding, paying, editing).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const db = await getDb();
          const [list, settings, hasData] = await Promise.all([
            listCardStatuses(db, todayIso()),
            getSettings(db),
            hasAnyData(db),
          ]);
          if (active) {
            setCards(list);
            setError(null);
            setNudge(nudgeDismissedThisSession ? null : backupNudge(settings.lastBackupAt, hasData));
          }
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const addCard = () => router.push('/card/edit');

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{ headerRight: () => <HeaderButton label="Settings" onPress={() => router.push('/settings')} /> }}
      />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={cards ?? []}
        keyExtractor={(s) => s.card.id}
        renderItem={({ item }) => <CardRow status={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {nudge ? (
              <BackupNudge
                daysSince={nudge.daysSince}
                onSaved={() => setNudge(null)}
                onLater={() => {
                  nudgeDismissedThisSession = true;
                  setNudge(null);
                }}
              />
            ) : null}
            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                Couldn’t load cards: {error}
              </ThemedText>
            ) : cards && cards.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {cardsSummary(cards)}
              </ThemedText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          cards ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold" style={{ fontSize: 18 }}>
                No cards yet
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Add a credit card with its statement day. The app works out the due date and reminds you 3 days before.
              </ThemedText>
            </View>
          ) : undefined
        }
      />
      <BottomBar>
        <Button label="Add card" onPress={addCard} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { gap: Spacing.two },
  nudge: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one, marginBottom: Spacing.one },
  nudgeButtons: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  content: { padding: Spacing.three, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
});
