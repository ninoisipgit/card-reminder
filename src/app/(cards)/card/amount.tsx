/** Add, change or remove the bill amount of a paid statement. ?payment= is the payment id. */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { getPayment, setPaymentAmount, type CardPayment } from '@/data/cards';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { shortDate } from '@/lib/cycles';
import { parsePesoToCents } from '@/lib/money';

function toInput(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

export default function BillAmountScreen() {
  const theme = useTheme();
  const { payment: paymentId } = useLocalSearchParams<{ payment: string }>();
  const [payment, setPayment] = useState<CardPayment | null>(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getPayment(await getDb(), Number(paymentId));
        setPayment(p);
        if (p.amountCents !== null) setAmount(toInput(p.amountCents));
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [paymentId]);

  const cents = parsePesoToCents(amount);

  const save = async (value: number | null) => {
    if (!payment) return;
    setSaving(true);
    setError(null);
    try {
      await setPaymentAmount(await getDb(), payment.id, value);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {payment ? (
          <ThemedText type="small" themeColor="textSecondary">
            Statement {shortDate(payment.statementDate)} · due {shortDate(payment.dueDate)}
          </ThemedText>
        ) : null}
        <TextField
          label="Bill amount (₱)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="e.g. 12500"
          error={amount !== '' && cents === null ? 'Enter a number, like 12500 or 12500.50.' : undefined}
        />
        {payment?.amountCents !== null && payment ? (
          <Button label="Remove amount" variant="plain" onPress={() => save(null)} disabled={saving} />
        ) : null}
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </ScrollView>
      <BottomBar>
        <Button label="Save amount" onPress={() => save(cents)} busy={saving} disabled={!payment || cents === null} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
});
