/** Debts tab: totals, then everyone with an open balance. Debts due soon are flagged. */
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { HeaderButtons } from '@/components/ui/header-buttons';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { listOpenDebts, listPersonBalances, type Debt, type PersonBalance, type Totals } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso, type IsoDate } from '@/lib/cycles';
import { debtBadge } from '@/lib/debt-display';
import { formatPeso } from '@/lib/money';

type PersonRowData = PersonBalance & {
  /** The most urgent badge among this person's open debts, if any. */
  badge: ReturnType<typeof debtBadge>;
  /** Earliest due date among their open debts, for sorting. */
  nextDue: IsoDate | null;
};

/** People sorted by their soonest due date; people with no due dates last, by name. */
function buildRows(balances: PersonBalance[], open: Debt[], today: IsoDate): PersonRowData[] {
  const rows = balances.map((b) => {
    const theirs = open.filter((d) => d.personId === b.person.id);
    const badges = theirs.map((d) => debtBadge(d, today)).filter((x): x is NonNullable<typeof x> => x !== null);
    const dues = theirs.map((d) => d.dueOn).filter((x): x is IsoDate => x !== null).sort();
    return { ...b, badge: badges.find((x) => x.tone === 'danger') ?? badges[0] ?? null, nextDue: dues[0] ?? null };
  });
  return rows.sort((a, b) => {
    if (a.nextDue && b.nextDue && a.nextDue !== b.nextDue) return a.nextDue < b.nextDue ? -1 : 1;
    if (a.nextDue && !b.nextDue) return -1;
    if (!a.nextDue && b.nextDue) return 1;
    return a.person.name.localeCompare(b.person.name);
  });
}

function PersonRow({ row }: { row: PersonRowData }) {
  const theme = useTheme();
  const { person, netCents, openDebtCount } = row;
  const net =
    netCents > 0
      ? { text: `owes you ${formatPeso(netCents)}`, color: theme.success }
      : netCents < 0
        ? { text: `you owe ${formatPeso(-netCents)}`, color: theme.danger }
        : { text: 'even', color: theme.textSecondary };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.name}, ${net.text}`}
      onPress={() => router.push({ pathname: '/debts/person/[id]', params: { id: String(person.id) } })}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 16 }}>
          {person.name}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: net.color }}>
          {net.text}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {openDebtCount} open {openDebtCount === 1 ? 'debt' : 'debts'}
        </ThemedText>
      </View>
      {row.badge ? <StatusBadge text={row.badge.text} tone={row.badge.tone} /> : null}
    </Pressable>
  );
}

export default function DebtsScreen() {
  const theme = useTheme();
  const [rows, setRows] = useState<PersonRowData[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const db = await getDb();
          const [balances, open] = await Promise.all([listPersonBalances(db), listOpenDebts(db)]);
          if (!active) return;
          setRows(buildRows(balances, open, todayIso()));
          setTotals(
            balances.reduce<Totals>(
              (t, b) => ({ owedToMeCents: t.owedToMeCents + b.owedToMeCents, iOweCents: t.iOweCents + b.iOweCents }),
              { owedToMeCents: 0, iOweCents: 0 },
            ),
          );
          setError(null);
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const addDebt = () => router.push('/debts/debt/edit');

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButtons
              buttons={[
                { label: 'Settings', onPress: () => router.push('/debts/settings') },
                { label: 'Add', onPress: addDebt },
              ]}
            />
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        data={rows ?? []}
        keyExtractor={(r) => String(r.person.id)}
        renderItem={({ item }) => <PersonRow row={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {error ? <ThemedText style={{ color: theme.danger }}>Couldn’t load debts: {error}</ThemedText> : null}
            {totals ? (
              <View style={styles.totals}>
                <View style={[styles.total, { backgroundColor: theme.successBackground }]}>
                  <ThemedText type="small" style={{ color: theme.success }}>
                    Owed to you
                  </ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.success, fontSize: 20 }}>
                    {formatPeso(totals.owedToMeCents)}
                  </ThemedText>
                </View>
                <View style={[styles.total, { backgroundColor: theme.dangerBackground }]}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    You owe
                  </ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 20 }}>
                    {formatPeso(totals.iOweCents)}
                  </ThemedText>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          rows ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                No open debts
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Record money you lend or borrow. Repayments can be added bit by bit.
              </ThemedText>
              <Button label="Add a debt" onPress={addDebt} />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          <Pressable onPress={() => router.push('/debts/paid')} style={styles.footer} accessibilityRole="link">
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Paid history
            </ThemedText>
          </Pressable>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.one },
  totals: { flexDirection: 'row', gap: Spacing.two },
  total: { flex: 1, padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
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
  footer: { alignItems: 'center', paddingVertical: Spacing.four },
});
