/**
 * Pay a lump sum: one amount from (or to) a person, applied to their oldest debts first.
 * ?person= is the person id; ?direction= picks the side when they have both.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow, Segmented } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { allocatePayment, getPerson, listOpenDebts, payLumpSum, type Debt, type Direction, type Person } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { shortDate, todayIso, type IsoDate } from '@/lib/cycles';
import { debtTitle } from '@/lib/debt-display';
import { formatPeso, parsePesoToCents } from '@/lib/money';
import { syncAfterChange } from '@/lib/sync';

function toInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export default function PayLumpSumScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ person: string; direction?: Direction }>();
  const personId = Number(params.person);
  const today = todayIso();
  const [person, setPerson] = useState<Person | null>(null);
  const [open, setOpen] = useState<Debt[] | null>(null);
  const [direction, setDirection] = useState<Direction>(params.direction === 'i_owe' ? 'i_owe' : 'owes_me');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState<IsoDate>(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const [p, o] = await Promise.all([getPerson(db, personId), listOpenDebts(db, personId)]);
        setPerson(p);
        setOpen(o);
        // If they only have debts on the other side, start there.
        if (!o.some((d) => d.direction === direction) && o.length > 0) setDirection(o[0].direction);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const sides = new Set((open ?? []).map((d) => d.direction));
  const debts = (open ?? []).filter((d) => d.direction === direction);
  const owed = debts.reduce((t, d) => t + d.remainingCents, 0);
  const cents = parsePesoToCents(amount);
  const tooMuch = cents !== null && cents > owed;
  const plan = cents !== null && !tooMuch ? allocatePayment(debts, cents) : [];
  const name = person?.name ?? '';

  const save = async () => {
    if (cents === null) return setError('Enter an amount more than ₱0.');
    setSaving(true);
    setError(null);
    try {
      await payLumpSum(await getDb(), personId, direction, cents, paidOn);
      syncAfterChange();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: direction === 'i_owe' ? 'Pay an amount' : 'Record money received' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sides.size > 1 ? (
          <Segmented
            options={[
              { value: 'owes_me', label: `${name} paid me` },
              { value: 'i_owe', label: `I paid ${name}` },
            ]}
            value={direction}
            onChange={(d) => {
              setDirection(d);
              setAmount('');
            }}
          />
        ) : null}

        {person && open ? (
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {direction === 'owes_me' ? `${name} owes you` : `You owe ${name}`}
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 24 }}>
              {formatPeso(owed)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              across {debts.length} {debts.length === 1 ? 'debt' : 'debts'}. The amount goes to the oldest first.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.group}>
          <TextField
            label="Amount (₱)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            hint={cents !== null && !tooMuch ? (cents === owed ? 'This settles everything.' : `${formatPeso(owed - cents)} will still be owed.`) : undefined}
            error={
              amount !== '' && cents === null
                ? 'Enter a number, like 500 or 500.50.'
                : tooMuch
                  ? `Can’t be more than the ${formatPeso(owed)} still owed.`
                  : undefined
            }
          />
          {owed > 0 ? (
            <ChipRow>
              <Chip label={`Full amount (${formatPeso(owed)})`} onPress={() => setAmount(toInput(owed))} />
            </ChipRow>
          ) : null}
        </View>

        <DateField label="Date" value={paidOn} onChange={setPaidOn} maximumDate={today} />

        {plan.length > 0 ? (
          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              HOW IT’S APPLIED
            </ThemedText>
            {plan.map(({ debt, payCents }) => {
              const left = debt.remainingCents - payCents;
              return (
                <View key={debt.id} style={[styles.planRow, { borderColor: theme.border }]}>
                  <View style={styles.planText}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {debtTitle(debt)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {shortDate(debt.lentOn)} · {formatPeso(payCents)}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={{ color: left === 0 ? theme.success : theme.textSecondary }}>
                    {left === 0 ? 'Paid off' : `${formatPeso(left)} left`}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        ) : null}

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </ScrollView>
      <BottomBar>
        <Button label="Save payment" onPress={save} busy={saving} disabled={!person || cents === null || tooMuch} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  panel: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
  group: { gap: Spacing.two },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  planText: { flex: 1, gap: Spacing.half },
});
