import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A bar pinned to the bottom of a screen, just above the tab bar, for the main action. */
export function BottomBar({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
