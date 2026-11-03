/**
 * One person: their balance, open debts, and paid history.
 * "Settle all" closes every open debt in one step (family usually pays everything at month end).
 */
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { DebtLines } from '@/components/debt-line';
import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { HeaderButton } from '@/components/ui/header-button';
import { Spacing } from '@/constants/theme';
import { DataError } from '@/data/db';
import {
  deletePerson,
  getPerson,
  listOpenDebts,
  listSettledDebts,
  settleAllWithPerson,
  undoSettleAll,
  type Debt,
  type Direction,
  type Person,
  type SettleResult,
} from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso } from '@/lib/cycles';
import { formatPeso } from '@/lib/money';
import { syncAfterChange } from '@/lib/sync';

export default function PersonScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const personId = Number(id);
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState<Debt[]>([]);
  const [settled, setSettled] = useState<Debt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The settle just done on this screen, for the inline Undo. */
  const [justSettled, setJustSettled] = useState<SettleResult | null>(null);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [p, o, s] = await Promise.all([
        getPerson(db, personId),
        listOpenDebts(db, personId),
        listSettledDebts(db, { personId }),
      ]);
      setPerson(p);
      setOpen(o);
      setSettled(s);
      setError(null);
    } catch (e) {
      if (e instanceof DataError && e.code === 'NOT_FOUND') setGone(true);
      else setError(errorMessage(e));
    }
  }, [personId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const settle = async (direction: Direction) => {
    setBusy(true);
    try {
      setJustSettled(await settleAllWithPerson(await getDb(), personId, todayIso(), direction));
      await load();
      syncAfterChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const undoSettle = async () => {
    if (!justSettled) return;
    setBusy(true);
    try {
      await undoSettleAll(await getDb(), justSettled.repaymentIds);
      setJustSettled(null);
      await load();
      syncAfterChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (gone) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText type="smallBold">This person no longer exists.</ThemedText>
        <Button label="Back to debts" variant="secondary" onPress={() => router.dismissTo('/')} />
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
  const countOf = (dir: Direction) => open.filter((d) => d.direction === dir).length;

  const confirmSettle = (direction: Direction) => {
    const n = countOf(direction);
    const amount = formatPeso(direction === 'owes_me' ? owedToMe : iOwe);
    const debts = `${n} ${n === 1 ? 'debt' : 'debts'}`;
    Alert.alert(
      direction === 'owes_me' ? `${person.name} paid you ${amount}?` : `You paid ${person.name} ${amount}?`,
      `This records ${amount} paid today and moves ${debts} to Paid history. You can undo it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settle all', onPress: () => settle(direction) },
      ],
    );
  };

  const settledText = justSettled
    ? [
        justSettled.owedToMeCents > 0 ? `${formatPeso(justSettled.owedToMeCents)} received` : '',
        justSettled.iOweCents > 0 ? `${formatPeso(justSettled.iOweCents)} paid` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const confirmDelete = () =>
    Alert.alert(`Remove ${person.name}?`, 'They have no debts left, so nothing else is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePerson(await getDb(), personId);
            router.dismissTo('/');
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: person.name,
          headerRight:
            open.length > 0
              ? () => (
                  <HeaderButton
                    label="Share"
                    onPress={() => router.push({ pathname: '/debts/person/share', params: { person: String(personId) } })}
                  />
                )
              : undefined,
        }}
      />
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

        {justSettled ? (
          <View style={[styles.undoBar, { backgroundColor: theme.successBackground }]}>
            <ThemedText type="smallBold" style={[styles.undoText, { color: theme.success }]}>
              Settled {justSettled.settledCount} {justSettled.settledCount === 1 ? 'debt' : 'debts'}: {settledText}
            </ThemedText>
            <Button label="Undo" variant="plain" onPress={undoSettle} disabled={busy} />
          </View>
        ) : null}

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          OPEN
        </ThemedText>
        {open.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing open. All settled.
          </ThemedText>
        ) : (
          <DebtLines debts={[...open].sort((a, b) => (a.lentOn === b.lentOn ? a.id - b.id : a.lentOn < b.lentOn ? -1 : 1))} today={today} />
        )}

        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          PAID
        </ThemedText>
        {settled.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No paid debts yet.
          </ThemedText>
        ) : (
          <DebtLines debts={settled} today={today} />
        )}

        {open.length === 0 && settled.length === 0 ? (
          <Button label={`Remove ${person.name}`} variant="danger" onPress={confirmDelete} />
        ) : null}
      </ScrollView>
      {owedToMe > 0 || iOwe > 0 ? (
        <BottomBar>
          <View style={styles.settleButtons}>
            {owedToMe > 0 ? (
              <Button
                label={`Settle all · ${formatPeso(owedToMe)} received`}
                onPress={() => confirmSettle('owes_me')}
                busy={busy}
              />
            ) : null}
            {iOwe > 0 ? (
              <Button
                label={`Settle all · ${formatPeso(iOwe)} I paid`}
                variant={owedToMe > 0 ? 'secondary' : 'primary'}
                onPress={() => confirmSettle('i_owe')}
                busy={busy}
              />
            ) : null}
            <Button
              label="Pay part of it"
              variant="plain"
              onPress={() =>
                router.push({
                  pathname: '/debts/pay',
                  params: { person: String(personId), direction: owedToMe > 0 ? 'owes_me' : 'i_owe' },
                })
              }
              disabled={busy}
            />
          </View>
        </BottomBar>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  totals: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  total: { flex: 1, padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
  sectionTitle: { marginTop: Spacing.three },
  undoBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, borderRadius: Spacing.three },
  undoText: { flex: 1 },
  settleButtons: { gap: Spacing.two },
});
