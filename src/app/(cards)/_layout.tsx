import { Stack } from 'expo-router';

/** The Cards tab; its list is at /cards. Links straight to a detail screen (widget, reminders) still have the list to go back to. */
export const unstable_settings = { initialRouteName: 'cards' };

export default function CardsLayout() {
  return (
    <Stack>
      <Stack.Screen name="cards" options={{ title: 'Cards' }} />
      <Stack.Screen name="card/[id]" options={{ title: '' }} />
      <Stack.Screen name="card/edit" options={{ title: 'Card', presentation: 'modal' }} />
      <Stack.Screen name="card/amount" options={{ title: 'Bill amount', presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="dev" options={{ title: 'Test tools' }} />
    </Stack>
  );
}
