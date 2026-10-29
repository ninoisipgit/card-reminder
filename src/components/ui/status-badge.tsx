import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tone } from '@/lib/card-display';

export function StatusBadge({ text, tone }: { text: string; tone: Tone }) {
  const theme = useTheme();
  const c = {
    danger: { bg: theme.dangerBackground, fg: theme.danger },
    warning: { bg: theme.warningBackground, fg: theme.warning },
    success: { bg: theme.successBackground, fg: theme.success },
    neutral: { bg: theme.backgroundSelected, fg: theme.text },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <ThemedText type="smallBold" style={{ color: c.fg }}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.two + Spacing.one,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.three,
    alignSelf: 'flex-start',
  },
});
