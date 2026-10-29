/** One debt in a list. Tapping opens the debt. */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import type { Debt } from '@/data/debts';
import { useTheme } from '@/hooks/use-theme';
import type { IsoDate } from '@/lib/cycles';
import { debtAmountLine, debtBadge, debtTitle, whoOwes } from '@/lib/debt-display';

export function DebtRow({ debt, today, showPerson = false }: { debt: Debt; today: IsoDate; showPerson?: boolean }) {
  const theme = useTheme();
  const badge = debtBadge(debt, today);
  const title = showPerson ? `${whoOwes(debt)} · ${debtTitle(debt)}` : debtTitle(debt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${whoOwes(debt)}. ${debtTitle(debt)}. ${debtAmountLine(debt)}`}
      onPress={() => router.push({ pathname: '/debts/debt/[id]', params: { id: String(debt.id) } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: badge?.tone === 'danger' ? theme.dangerBackground : theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 18 }}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {debtAmountLine(debt)}
        </ThemedText>
      </View>
      {badge ? <StatusBadge text={badge.text} tone={badge.tone} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  text: { flex: 1, gap: Spacing.half },
});
