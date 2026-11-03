/**
 * Record part or all of a debt being paid back. ?id= is the debt.
 * The amount starts filled in with everything still owed; edit it for a partial repayment.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { addRepayment, getDebt, type Debt } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso, type IsoDate } from '@/lib/cycles';
import { whoOwes } from '@/lib/debt-display';
import { formatPeso, parsePesoToCents } from '@/lib/money';
import { syncAfterChange } from '@/lib/sync';

/** 150000 -> '1500', 150050 -> '1500.50' (what the user would type) */
function toInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export default function RepayScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = todayIso();
  const [debt, setDebt] = useState<Debt | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState<IsoDate>(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await getDebt(await getDb(), Number(id));
        setDebt(d);
        setAmount(toInput(d.remainingCents)); // pre-fill with the full amount still owed
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [id]);

  const cents = parsePesoToCents(amount);
  const tooMuch = debt !== null && cents !== null && cents > debt.remainingCents;
  const fullAmount = debt ? toInput(debt.remainingCents) : '';

  const save = async () => {
    if (!debt) return;
    if (cents === null) return setError('Enter an amount more than ₱0.');
    if (cents > debt.remainingCents) {
      return setError(`The amount can’t be more than the ${formatPeso(debt.remainingCents)} still owed.`);
    }
    setSaving(true);
    setError(null);
    try {
      await addRepayment(await getDb(), debt.id, cents, paidOn, note);
      syncAfterChange();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: debt?.direction === 'i_owe' ? 'Record a payment' : 'Record money received' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {debt ? (
          <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {whoOwes(debt)}
            </ThemedText>
            <ThemedText type="smallBold" style={{ fontSize: 24 }}>
              {formatPeso(debt.remainingCents)} still owed
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
            hint={
              debt && cents !== null && !tooMuch
                ? cents === debt.remainingCents
                  ? 'This pays it off in full.'
                  : `${formatPeso(debt.remainingCents - cents)} will still be owed.`
                : undefined
            }
            error={
              amount !== '' && cents === null
                ? 'Enter a number, like 500 or 500.50.'
                : tooMuch
                  ? `Can’t be more than the ${formatPeso(debt!.remainingCents)} still owed.`
                  : undefined
            }
          />
          {debt ? (
            <ChipRow>
              <Chip label={`Full amount (${formatPeso(debt.remainingCents)})`} onPress={() => setAmount(fullAmount)} />
            </ChipRow>
          ) : null}
        </View>

        <DateField label="Date" value={paidOn} onChange={setPaidOn} maximumDate={today} minimumDate={debt?.lentOn} />

        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. GCash, cash" />

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

      </ScrollView>
      <BottomBar>
        <Button label="Save repayment" onPress={save} busy={saving} disabled={!debt || cents === null || tooMuch} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  panel: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.half },
  group: { gap: Spacing.two },
});
