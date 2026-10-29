/** Applies the Light / Dark / System choice to the app (the widget always follows the phone). */
import { Appearance } from 'react-native';

import type { ThemeSetting } from '@/data/settings';

export function applyTheme(theme: ThemeSetting): void {
  Appearance.setColorScheme(theme === 'system' ? 'auto' : theme);
}
