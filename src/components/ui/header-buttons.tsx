import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { HeaderButton } from './header-button';

/** Several text buttons in a header, e.g. Settings + Add. */
export function HeaderButtons({ buttons }: { buttons: { label: string; onPress: () => void }[] }) {
  return (
    <View style={styles.row}>
      {buttons.map((b) => (
        <HeaderButton key={b.label} label={b.label} onPress={b.onPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Spacing.three } });
