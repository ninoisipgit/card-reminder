import { Stack } from 'expo-router';

/**
 * The Debts tab. Its list is the app's start screen ("/"); the other debt screens
 * live under /debts/... so widget and reminder links stay the same.
 * Links straight to a detail screen still have the list to go back to.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function DebtsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Debts' }} />
      <Stack.Screen name="debts/person/[id]" options={{ title: '' }} />
      <Stack.Screen name="debts/person/share" options={{ title: 'Share list' }} />
      <Stack.Screen name="debts/debt/[id]" options={{ title: '' }} />
      <Stack.Screen name="debts/debt/edit" options={{ title: 'Debt', presentation: 'modal' }} />
      <Stack.Screen name="debts/debt/repay" options={{ title: 'Add repayment', presentation: 'modal' }} />
      <Stack.Screen name="debts/pay" options={{ title: 'Record money received', presentation: 'modal' }} />
      <Stack.Screen name="debts/paid" options={{ title: 'Paid history' }} />
      <Stack.Screen name="debts/settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
