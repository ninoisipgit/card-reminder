/**
 * Debts tab. PLACEHOLDER until the debt screens are built: shows totals and
 * each person's balance from the database, read-only.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getTotals, listPersonBalances, type PersonBalance, type Totals } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { formatPeso } from '@/lib/money';

export default function DebtsScreen() {
  const theme = useTheme();
  const [balances, setBalances] = useState<PersonBalance[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const db = await getDb();
          const [b, t] = await Promise.all([listPersonBalances(db), getTotals(db)]);
          if (active) {
            setBalances(b);
            setTotals(t);
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

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      data={balances ?? []}
      keyExtractor={(b) => String(b.person.id)}
      ListHeaderComponent={
        <View style={styles.header}>
          {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
          {totals ? (
            <View style={styles.totals}>
              <View style={[styles.total, { backgroundColor: theme.successBackground }]}>
                <ThemedText type="small" style={{ color: theme.success }}>
                  Owed to you
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.success, fontSize: 18 }}>
                  {formatPeso(totals.owedToMeCents)}
                </ThemedText>
              </View>
              <View style={[styles.total, { backgroundColor: theme.dangerBackground }]}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  You owe
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 18 }}>
                  {formatPeso(totals.iOweCents)}
                </ThemedText>
              </View>
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            Adding debts and repayments comes next. For now, load sample data from Cards → Test tools.
          </ThemedText>
        </View>
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={styles.name}>
            {item.person.name}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: item.netCents >= 0 ? theme.success : theme.danger }}>
            {item.netCents >= 0 ? `owes you ${formatPeso(item.netCents)}` : `you owe ${formatPeso(-item.netCents)}`}
          </ThemedText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  header: { gap: Spacing.three, marginBottom: Spacing.two },
  totals: { flexDirection: 'row', gap: Spacing.two },
  total: { flex: 1, padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  name: { flex: 1, fontSize: 16 },
});
