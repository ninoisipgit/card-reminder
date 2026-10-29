import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'plain';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
}) {
  const theme = useTheme();
  const colors: Record<Variant, { bg: string; fg: string }> = {
    primary: { bg: theme.accent, fg: theme.onAccent },
    secondary: { bg: theme.backgroundElement, fg: theme.text },
    danger: { bg: theme.dangerBackground, fg: theme.danger },
    plain: { bg: 'transparent', fg: theme.accent },
  };
  const c = colors[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: c.bg, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <ThemedText type="smallBold" style={{ color: c.fg }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
