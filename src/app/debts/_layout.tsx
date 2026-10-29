import { Stack } from 'expo-router';

export default function DebtsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Debts' }} />
      <Stack.Screen name="person/[id]" options={{ title: '' }} />
      <Stack.Screen name="debt/[id]" options={{ title: '' }} />
      <Stack.Screen name="debt/edit" options={{ title: 'Debt', presentation: 'modal' }} />
      <Stack.Screen name="debt/repay" options={{ title: 'Add repayment', presentation: 'modal' }} />
      <Stack.Screen name="paid" options={{ title: 'Paid history' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}
