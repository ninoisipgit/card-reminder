/** One person: their balance, open debts, and paid history. */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { DebtRow } from '@/components/debt-row';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { DataError } from '@/data/db';
import { deletePerson, getPerson, listOpenDebts, listSettledDebts, type Debt, type Person } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso } from '@/lib/cycles';
import { formatPeso } from '@/lib/money';

export default function PersonScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const personId = Number(id);
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState<Debt[]>([]);
  const [settled, setSettled] = useState<Debt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const db = await getDb();
          const [p, o, s] = await Promise.all([
            getPerson(db, personId),
            listOpenDebts(db, personId),
            listSettledDebts(db, { personId }),
          ]);
          if (!active) return;
          setPerson(p);
          setOpen(o);
          setSettled(s);
        } catch (e) {
          if (!active) return;
          if (e instanceof DataError && e.code === 'NOT_FOUND') setGone(true);
          else setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, [personId]),
  );

  if (gone) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText type="smallBold">This person no longer exists.</ThemedText>
        <Button label="Back to debts" variant="secondary" onPress={() => router.dismissTo('/debts')} />
      </View>
    );
  }
  if (!person) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </View>
    );
  }

  const today = todayIso();
  const owedToMe = open.filter((d) => d.direction === 'owes_me').reduce((t, d) => t + d.remainingCents, 0);
  const iOwe = open.filter((d) => d.direction === 'i_owe').reduce((t, d) => t + d.remainingCents, 0);

  const confirmDelete = () =>
    Alert.alert(`Remove ${person.name}?`, 'They have no debts left, so nothing else is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePerson(await getDb(), personId);
            router.dismissTo('/debts');
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: person.name }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View style={styles.totals}>
          <View style={[styles.total, { backgroundColor: theme.successBackground }]}>
            <ThemedText type="small" style={{ color: theme.success }}>
              Owes you
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.success, fontSize: 24 }}>
              {formatPeso(owedToMe)}
            </ThemedText>
          </View>
          <View style={[styles.total, { backgroundColor: theme.dangerBackground }]}>
            <ThemedText type="small" style={{ color: theme.danger }}>
              You owe
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.danger, fontSize: 24 }}>
              {formatPeso(iOwe)}
            </ThemedText>
          </View>
        </View>

        <Button
          label={`Add a debt with ${person.name}`}
          onPress={() => router.push({ pathname: '/debts/debt/edit', params: { person: person.name } })}
        />

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          OPEN
        </ThemedText>
        {open.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing open. All settled.
          </ThemedText>
        ) : (
          open.map((d) => <DebtRow key={d.id} debt={d} today={today} />)
        )}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          PAID
        </ThemedText>
        {settled.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No paid debts yet.
          </ThemedText>
        ) : (
          settled.map((d) => <DebtRow key={d.id} debt={d} today={today} />)
        )}

        {open.length === 0 && settled.length === 0 ? (
          <Button label={`Remove ${person.name}`} variant="danger" onPress={confirmDelete} />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  totals: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  total: { flex: 1, padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
  sectionTitle: { marginTop: Spacing.three },
});
