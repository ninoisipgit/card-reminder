/** One debt: how much is left, its repayments, and the actions on it. */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { longDate } from '@/components/ui/date-field';
import { HeaderButton } from '@/components/ui/header-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { DataError } from '@/data/db';
import { deleteRepayment, getDebt, listRepayments, type Debt, type Repayment } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { shortDate, todayIso } from '@/lib/cycles';
import { debtBadge, debtTitle, whoOwes } from '@/lib/debt-display';
import { formatPeso } from '@/lib/money';
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

export default function DebtScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const debtId = Number(id);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [d, r] = await Promise.all([getDebt(db, debtId), listRepayments(db, debtId)]);
      setDebt(d);
      setRepayments(r);
      setError(null);
    } catch (e) {
      if (e instanceof DataError && e.code === 'NOT_FOUND') setGone(true);
      else setError(errorMessage(e));
    }
  }, [debtId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (gone) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Debt' }} />
        <ThemedText type="smallBold">This debt no longer exists.</ThemedText>
        <Button label="Back to debts" variant="secondary" onPress={() => router.dismissTo('/debts')} />
      </View>
    );
  }
  if (!debt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </View>
    );
  }

  const today = todayIso();
  const badge = debtBadge(debt, today);
  const owesMe = debt.direction === 'owes_me';
  const progress = debt.amountCents > 0 ? debt.repaidCents / debt.amountCents : 0;

  const confirmDeleteRepayment = (r: Repayment) =>
    Alert.alert(
      `Delete the ${formatPeso(r.amountCents)} repayment?`,
      debt.settledOn ? 'The debt will reopen with this amount owed again.' : 'The amount will be owed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRepayment(await getDb(), r.id);
              await load();
              syncAfterChange();
            } catch (e) {
              setError(errorMessage(e));
            }
          },
        },
      ],
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: debt.personName,
          headerRight: () => (
            <HeaderButton
              label="Edit"
              onPress={() => router.push({ pathname: '/debts/debt/edit', params: { id: String(debt.id) } })}
            />
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View
          style={[
            styles.panel,
            { backgroundColor: badge?.tone === 'danger' ? theme.dangerBackground : theme.backgroundElement },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            {whoOwes(debt)}
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: debt.settledOn ? theme.success : owesMe ? theme.text : theme.danger }}>
            {formatPeso(debt.remainingCents)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {debt.settledOn
              ? `Paid in full on ${shortDate(debt.settledOn)}`
              : debt.repaidCents > 0
                ? `left of ${formatPeso(debt.amountCents)} · ${formatPeso(debt.repaidCents)} repaid`
                : 'nothing repaid yet'}
          </ThemedText>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.success }]} />
          </View>
          {badge ? <StatusBadge text={badge.text} tone={badge.tone} /> : null}
        </View>

        <View style={styles.info}>
          <InfoRow label="For" value={debtTitle(debt)} />
          <InfoRow label={owesMe ? 'Lent on' : 'Borrowed on'} value={longDate(debt.lentOn)} />
          <InfoRow label="Due" value={debt.dueOn ? longDate(debt.dueOn) : 'No due date'} />
          <InfoRow label="Original amount" value={formatPeso(debt.amountCents)} />
        </View>

        {!debt.settledOn ? (
          <Button
            label={owesMe ? `Record money received from ${debt.personName}` : `Record a payment to ${debt.personName}`}
            onPress={() => router.push({ pathname: '/debts/debt/repay', params: { id: String(debt.id) } })}
          />
        ) : null}

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          REPAYMENTS
        </ThemedText>
        {repayments.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            None yet.
          </ThemedText>
        ) : (
          repayments.map((r) => (
            <View key={r.id} style={[styles.repayment, { borderColor: theme.border }]}>
              <View style={styles.repaymentText}>
                <ThemedText type="smallBold">{formatPeso(r.amountCents)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {shortDate(r.paidOn)}
                  {r.note ? ` · ${r.note}` : ''}
                </ThemedText>
              </View>
              <Button label="Delete" variant="plain" onPress={() => confirmDeleteRepayment(r)} />
            </View>
          ))
        )}

        <Button
          label={`All debts with ${debt.personName}`}
          variant="secondary"
          onPress={() => router.push({ pathname: '/debts/person/[id]', params: { id: String(debt.personId) } })}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  panel: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: Spacing.two },
  fill: { height: 8, borderRadius: 4 },
  info: { gap: Spacing.two },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  sectionTitle: { marginTop: Spacing.two },
  repayment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  repaymentText: { flex: 1, gap: Spacing.half },
});
