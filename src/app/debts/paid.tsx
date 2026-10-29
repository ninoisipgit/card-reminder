/** Paid history: every settled debt, most recent first, searchable by name or description. */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { DebtRow } from '@/components/debt-row';
import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { listSettledDebts, type Debt } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso } from '@/lib/cycles';

export default function PaidHistoryScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const list = await listSettledDebts(await getDb(), { search });
          if (active) setDebts(list);
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, [search]),
  );

  const today = todayIso();
  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={debts ?? []}
      keyExtractor={(d) => String(d.id)}
      renderItem={({ item }) => <DebtRow debt={item} today={today} showPerson />}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Name or what it was for" />
          {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
        </View>
      }
      ListEmptyComponent={
        debts ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {search.trim() ? 'No paid debts match.' : 'Debts move here once they’re fully repaid.'}
          </ThemedText>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  header: { gap: Spacing.two, marginBottom: Spacing.one },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
});
