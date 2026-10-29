import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A text button for the screen header ("Add", "Edit"). */
export function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: Spacing.one })}>
      <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 16 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}
