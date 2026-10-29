import { Stack } from 'expo-router';

export default function CardsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Cards' }} />
      <Stack.Screen name="card/[id]" options={{ title: '' }} />
      <Stack.Screen name="card/edit" options={{ title: 'Card', presentation: 'modal' }} />
      <Stack.Screen name="dev" options={{ title: 'Test tools' }} />
    </Stack>
  );
}
