import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { getDb } from '@/data/open';
import { getSettings } from '@/data/settings';
import { syncAfterChange, syncIfStale } from '@/lib/sync';
import { applyTheme } from '@/lib/theme-setting';

SplashScreen.preventAutoHideAsync();

/** The last reminder tap already acted on, so a re-render doesn't open it twice. */
let handledResponseKey: string | null = null;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const lastResponse = Notifications.useLastNotificationResponse();

  // Widget + reminders are re-synced on launch, and when the app returns to the
  // foreground (at most hourly), so overdue reminders keep being re-planned.
  useEffect(() => {
    getDb()
      .then(getSettings)
      .then((s) => applyTheme(s.theme))
      .catch(() => {});
    syncAfterChange();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIfStale();
    });
    return () => sub.remove();
  }, []);

  // Tapping a reminder opens that card.
  useEffect(() => {
    if (lastResponse?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = `${lastResponse.notification.request.identifier}@${lastResponse.notification.date}`;
    if (key === handledResponseKey) return;
    handledResponseKey = key;
    const url = lastResponse.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(url as Href);
  }, [lastResponse]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
