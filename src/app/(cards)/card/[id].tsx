/** Card detail: this month's cycle, "Mark paid" with undo, and the full payment history. */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import {
  getCardStatusById,
  listCardHistory,
  markCurrentCyclePaid,
  undoLastPayment,
  type CardPayment,
} from '@/data/cards';
import { DataError } from '@/data/db';
import { getDb } from '@/data/open';
import { DEFAULT_SETTINGS, formatTime, getSettings } from '@/data/settings';
import { useTheme } from '@/hooks/use-theme';
import { cardBadgeText, cardTone, errorMessage } from '@/lib/card-display';
import { shortDate, toDayNumber, todayIso, type CardStatus } from '@/lib/cycles';
import { syncAfterChange } from '@/lib/sync';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

function HistoryRow({ payment, onUndo }: { payment: CardPayment; onUndo?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.historyRow, { borderColor: theme.border }]}>
      <View style={styles.historyText}>
        <ThemedText type="smallBold">Statement {shortDate(payment.statementDate)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Due {shortDate(payment.dueDate)} · Marked paid {shortDate(payment.paidOn)}
        </ThemedText>
      </View>
      <View style={styles.historyRight}>
        <StatusBadge text={payment.onTime ? 'On time' : 'Late'} tone={payment.onTime ? 'success' : 'danger'} />
        {onUndo ? <Button label="Undo" variant="plain" onPress={onUndo} /> : null}
      </View>
    </View>
  );
}

export default function CardDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cardId = Number(id);
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [history, setHistory] = useState<CardPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The payment just made on this screen, for the inline Undo. */
  const [justPaid, setJustPaid] = useState<CardPayment | null>(null);
  const [reminderTime, setReminderTime] = useState(formatTime(DEFAULT_SETTINGS.reminderHour, DEFAULT_SETTINGS.reminderMinute));

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [s, h, settings] = await Promise.all([
        getCardStatusById(db, cardId, todayIso()),
        listCardHistory(db, cardId),
        getSettings(db),
      ]);
      setStatus(s);
      setHistory(h);
      setReminderTime(formatTime(settings.reminderHour, settings.reminderMinute));
      setError(null);
    } catch (e) {
      if (e instanceof DataError && e.code === 'NOT_FOUND') setNotFound(true);
      else setError(errorMessage(e));
    }
  }, [cardId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const markPaid = async () => {
    setBusy(true);
    try {
      const payment = await markCurrentCyclePaid(await getDb(), cardId, todayIso());
      setJustPaid(payment);
      await load();
      syncAfterChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    try {
      await undoLastPayment(await getDb(), cardId);
      setJustPaid(null);
      await load();
      syncAfterChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmUndo = () =>
    Alert.alert('Undo this payment?', 'The cycle will show as unpaid again and its reminders come back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: undo },
    ]);

  if (notFound) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Card' }} />
        <ThemedText type="smallBold">This card no longer exists.</ThemedText>
        <Button label="Back to cards" variant="secondary" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  if (!status) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </View>
    );
  }

  const { card, current, state, overdueCount } = status;
  const statementOut = toDayNumber(todayIso()) >= toDayNumber(current.statement);

  return (
    <>
      <Stack.Screen
        options={{
          title: card.name,
          headerRight: () => (
            <HeaderButton
              label="Edit"
              onPress={() => router.push({ pathname: '/card/edit', params: { id: card.id } })}
            />
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View style={[styles.panel, { backgroundColor: state === 'overdue' ? theme.dangerBackground : theme.backgroundElement }]}>
          <StatusBadge text={cardBadgeText(status)} tone={cardTone(state)} />
          {overdueCount > 1 ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {overdueCount} months unpaid. The oldest is shown; mark each one paid in turn.
            </ThemedText>
          ) : null}
          <InfoRow label="Statement date" value={shortDate(current.statement)} />
          <InfoRow label="Due date" value={shortDate(current.due)} />
          <InfoRow label="Reminder" value={`${shortDate(current.reminder)}, ${reminderTime}`} />
          {state === 'overdue' ? (
            <ThemedText type="small" themeColor="textSecondary">
              Reminding you every 4 hours until you mark it paid.
            </ThemedText>
          ) : null}
        </View>

        {justPaid ? (
          <View style={[styles.undoBar, { backgroundColor: theme.successBackground }]}>
            <ThemedText type="smallBold" style={[styles.undoText, { color: theme.success }]}>
              Marked paid: statement {shortDate(justPaid.statementDate)}
            </ThemedText>
            <Button label="Undo" variant="plain" onPress={undo} disabled={busy} />
          </View>
        ) : null}

        {statementOut ? (
          <Button label="Mark as paid" onPress={markPaid} busy={busy} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            Nothing to pay yet. The next statement comes out {shortDate(current.statement)}.
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          “Mark as paid” is your own record. It doesn’t check with the bank.
        </ThemedText>

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          HISTORY
        </ThemedText>
        {history.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No payments marked yet.
          </ThemedText>
        ) : (
          history.map((p, i) => (
            <HistoryRow key={p.id} payment={p} onUndo={i === 0 && !justPaid ? confirmUndo : undefined} />
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  panel: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    borderRadius: Spacing.three,
  },
  undoText: { flex: 1 },
  sectionTitle: { marginTop: Spacing.two },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyText: { flex: 1, gap: Spacing.half },
  historyRight: { alignItems: 'flex-end' },
});
