/** Cards tab: every card with its next due date, most urgent first. */
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BottomBar } from '@/components/ui/bottom-bar';
import { HeaderButton } from '@/components/ui/header-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spacing } from '@/constants/theme';
import { listCardStatuses } from '@/data/cards';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { cardBadgeText, cardDatesLine, cardsSummary, cardTone, errorMessage } from '@/lib/card-display';
import { todayIso, type CardStatus } from '@/lib/cycles';

function CardRow({ status }: { status: CardStatus }) {
  const theme = useTheme();
  const tone = cardTone(status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${status.card.name}, ${cardBadgeText(status)}`}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: status.card.id } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: tone === 'danger' ? theme.dangerBackground : theme.backgroundElement,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 18 }}>
          {status.card.name}
          {status.overdueCount > 1 ? ` · ${status.overdueCount} unpaid` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {cardDatesLine(status)}
        </ThemedText>
      </View>
      <StatusBadge text={cardBadgeText(status)} tone={tone} />
    </Pressable>
  );
}

export default function CardsScreen() {
  const theme = useTheme();
  const [cards, setCards] = useState<CardStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the tab comes back into view (after adding, paying, editing).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const list = await listCardStatuses(await getDb(), todayIso());
          if (active) {
            setCards(list);
            setError(null);
          }
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const addCard = () => router.push('/card/edit');

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{ headerRight: () => <HeaderButton label="Settings" onPress={() => router.push('/settings')} /> }}
      />
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={cards ?? []}
        keyExtractor={(s) => s.card.id}
        renderItem={({ item }) => <CardRow status={item} />}
        ListHeaderComponent={
          error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              Couldn’t load cards: {error}
            </ThemedText>
          ) : cards && cards.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {cardsSummary(cards)}
            </ThemedText>
          ) : undefined
        }
        ListEmptyComponent={
          cards ? (
            <View style={styles.empty}>
              <ThemedText type="smallBold" style={{ fontSize: 18 }}>
                No cards yet
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Add a credit card with its statement day. The app works out the due date and reminds you 3 days before.
              </ThemedText>
            </View>
          ) : undefined
        }
      />
      <BottomBar>
        <Button label="Add card" onPress={addCard} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
});
