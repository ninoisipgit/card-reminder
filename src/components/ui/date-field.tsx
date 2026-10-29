/** A date row that opens Android's Material date picker. Value is 'YYYY-MM-DD' or null. */
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayIso, type IsoDate } from '@/lib/cycles';

function toLocalDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 'Thu, Oct 29, 2026' */
export function longDate(iso: IsoDate): string {
  return toLocalDate(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DateField({
  label,
  value,
  onChange,
  emptyText = 'Not set',
  hint,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: IsoDate | null;
  onChange: (value: IsoDate) => void;
  emptyText?: string;
  hint?: string;
  minimumDate?: IsoDate;
  maximumDate?: IsoDate;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? longDate(value) : emptyText}. Change`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.input,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ThemedText style={{ color: value ? theme.text : theme.textSecondary }}>
          {value ? longDate(value) : emptyText}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          Change
        </ThemedText>
      </Pressable>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {open ? (
        <DateTimePicker
          mode="date"
          value={toLocalDate(value ?? todayIso())}
          minimumDate={minimumDate ? toLocalDate(minimumDate) : undefined}
          maximumDate={maximumDate ? toLocalDate(maximumDate) : undefined}
          onChange={(event, date) => {
            setOpen(false);
            if (event.type === 'set' && date) onChange(todayIso(date));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: Spacing.two + Spacing.one,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
