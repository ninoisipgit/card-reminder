/**
 * One debt as a single compact row: date · description · amount.
 * Used on a person's screen, where the person is already known.
 * A second, smaller line appears only for a due date or a partial repayment.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Debt } from '@/data/debts';
import { useTheme } from '@/hooks/use-theme';
import { shortDate, type IsoDate } from '@/lib/cycles';
import { debtBadge, debtTitle } from '@/lib/debt-display';
import { formatPeso } from '@/lib/money';

export function DebtLine({ debt, today, last = false }: { debt: Debt; today: IsoDate; last?: boolean }) {
  const theme = useTheme();
  const badge = debtBadge(debt, today);
  const settled = debt.settledOn !== null;
  const toneColor =
    badge?.tone === 'danger' ? theme.danger : badge?.tone === 'warning' ? theme.warning : theme.textSecondary;

  const notes: string[] = [];
  if (settled) notes.push(`Paid ${shortDate(debt.settledOn!)}`);
  else if (badge) notes.push(badge.text);
  else if (debt.dueOn) notes.push(`Due ${shortDate(debt.dueOn)}`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shortDate(debt.lentOn)}. ${debtTitle(debt)}. ${formatPeso(settled ? debt.amountCents : debt.remainingCents)}`}
      onPress={() => router.push({ pathname: '/debts/debt/[id]', params: { id: String(debt.id) } })}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
        {shortDate(debt.lentOn)}
      </ThemedText>
      <View style={styles.middle}>
        <ThemedText numberOfLines={2} style={styles.description}>
          {debtTitle(debt)}
        </ThemedText>
        {notes.length > 0 ? (
          <ThemedText type="small" style={{ color: settled ? theme.success : toneColor }}>
            {notes.join(' · ')}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.amounts}>
        <ThemedText type="smallBold" style={[styles.amount, settled && { color: theme.textSecondary }]}>
          {formatPeso(settled ? debt.amountCents : debt.remainingCents)}
        </ThemedText>
        {!settled && debt.repaidCents > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            of {formatPeso(debt.amountCents)}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Groups DebtLines into one rounded panel. */
export function DebtLines({ debts, today }: { debts: Debt[]; today: IsoDate }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.backgroundElement }]}>
      {debts.map((d, i) => (
        <DebtLine key={d.id} debt={d} today={today} last={i === debts.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: Spacing.three, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + Spacing.half,
    paddingHorizontal: Spacing.three,
  },
  date: { width: 58 },
  middle: { flex: 1, gap: 2 },
  description: { fontSize: 17, lineHeight: 22 },
  amounts: { alignItems: 'flex-end' },
  amount: { fontSize: 17 },
});
