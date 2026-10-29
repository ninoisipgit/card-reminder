/** Add or edit a card. Opened with ?id= to edit; without it to add. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { addCard, deleteCard, getCard, updateCard } from '@/data/cards';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { firstUnpaidCycle, shortDate, todayIso, type CardConfig } from '@/lib/cycles';
import { ensureNotificationPermission } from '@/lib/notifications';
import { syncAfterChange } from '@/lib/sync';

/** Whole number in [min, max], or null. */
function parseWhole(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

export default function EditCardScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id !== undefined;
  const [existing, setExisting] = useState<CardConfig | null>(null);
  const [name, setName] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [daysToDue, setDaysToDue] = useState('20');
  const [reminderDays, setReminderDays] = useState('3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const card = await getCard(await getDb(), Number(id));
        setExisting(card);
        setName(card.name);
        setStatementDay(String(card.statementDay));
        setDaysToDue(String(card.daysToDue));
        setReminderDays(String(card.reminderDaysBefore));
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [editing, id]);

  const day = parseWhole(statementDay, 1, 31);
  const due = parseWhole(daysToDue, 1, 60);
  const remind = parseWhole(reminderDays, 0, 30);

  // Live preview of the next cycle with the values typed so far.
  const preview =
    day !== null && due !== null && remind !== null
      ? firstUnpaidCycle({
          id: existing?.id ?? 'new',
          name,
          statementDay: day,
          daysToDue: due,
          reminderDaysBefore: remind,
          addedOn: existing?.addedOn ?? todayIso(),
          lastPaidStatement: existing?.lastPaidStatement,
        }).cycle
      : null;

  const save = async () => {
    if (!name.trim()) return setError('Card name is required.');
    if (day === null) return setError('Statement day must be a number from 1 to 31.');
    if (due === null) return setError('Days to due date must be from 1 to 60.');
    if (remind === null) return setError('Reminder days must be from 0 to 30.');
    setSaving(true);
    setError(null);
    try {
      const db = await getDb();
      const input = { name, statementDay: day, daysToDue: due, reminderDaysBefore: remind };
      if (editing) {
        await updateCard(db, Number(id), input);
      } else {
        await addCard(db, input, todayIso());
        // Reminders are the point of adding a card, so ask once here (Android shows it only once).
        await ensureNotificationPermission().catch(() => false);
      }
      syncAfterChange();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert(`Delete ${existing?.name ?? 'this card'}?`, 'Its payment history and reminders will be removed too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCard(await getDb(), Number(id));
            syncAfterChange();
            router.dismissTo('/');
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: editing ? 'Edit card' : 'Add card' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <TextField
          label="Card name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. BPI Gold"
          autoCapitalize="words"
          autoFocus={!editing}
        />
        <TextField
          label="Statement day"
          value={statementDay}
          onChangeText={setStatementDay}
          keyboardType="number-pad"
          placeholder="1–31"
          hint="The day of the month your statement is cut. Use 31 for “end of month”."
          error={statementDay !== '' && day === null ? 'Enter a number from 1 to 31.' : undefined}
        />
        <TextField
          label="Days from statement to due date"
          value={daysToDue}
          onChangeText={setDaysToDue}
          keyboardType="number-pad"
          hint="Due date = statement date + this many days. Usually 20."
          error={daysToDue !== '' && due === null ? 'Enter a number from 1 to 60.' : undefined}
        />
        <TextField
          label="Remind me (days before due)"
          value={reminderDays}
          onChangeText={setReminderDays}
          keyboardType="number-pad"
          error={reminderDays !== '' && remind === null ? 'Enter a number from 0 to 30.' : undefined}
        />

        {preview ? (
          <View style={[styles.preview, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{editing ? 'Next cycle' : 'First cycle'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Statement {shortDate(preview.statement)} · Due {shortDate(preview.due)} · Reminder{' '}
              {shortDate(preview.reminder)}
            </ThemedText>
            {editing ? (
              <ThemedText type="small" themeColor="textSecondary">
                Changes apply to future cycles. Past payments keep their dates.
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        {editing ? <Button label="Delete card" variant="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
      <BottomBar>
        <Button label={editing ? 'Save changes' : 'Add card'} onPress={save} busy={saving} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  preview: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
});
