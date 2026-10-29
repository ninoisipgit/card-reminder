/**
 * Add or edit a debt.
 * ?id=      edit that debt
 * ?person=  add, with the name filled in (from a person's screen)
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow, Segmented } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { addDebt, deleteDebt, getDebt, listPeople, updateDebt, type Debt, type Direction, type Person } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { addDays, todayIso, type IsoDate } from '@/lib/cycles';
import { formatPeso, parsePesoToCents } from '@/lib/money';
import { syncAfterChange } from '@/lib/sync';

/** Same day next month (clamped), for the "1 month" shortcut. */
function addOneMonth(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m, Math.min(d, last)));
  return next.toISOString().slice(0, 10);
}

export default function EditDebtScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string; person?: string }>();
  const editing = params.id !== undefined;
  const today = todayIso();

  const [existing, setExisting] = useState<Debt | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [direction, setDirection] = useState<Direction>('owes_me');
  const [personName, setPersonName] = useState(params.person ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [lentOn, setLentOn] = useState<IsoDate>(today);
  const [dueOn, setDueOn] = useState<IsoDate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        setPeople(await listPeople(db));
        if (params.id !== undefined) {
          const d = await getDebt(db, Number(params.id));
          setExisting(d);
          setDirection(d.direction);
          setPersonName(d.personName);
          setAmount((d.amountCents / 100).toFixed(d.amountCents % 100 === 0 ? 0 : 2));
          setDescription(d.description);
          setLentOn(d.lentOn);
          setDueOn(d.dueOn);
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [params.id]);

  const cents = parsePesoToCents(amount);
  const typed = personName.trim().toLowerCase();
  const suggestions = people
    .filter((p) => p.name.toLowerCase() !== typed && (typed === '' || p.name.toLowerCase().includes(typed)))
    .slice(0, 6);

  const save = async () => {
    if (!personName.trim()) return setError('Enter who this is with.');
    if (cents === null) return setError('Enter an amount more than ₱0, like 1500 or 1,500.50.');
    if (dueOn && dueOn < lentOn) return setError('The due date can’t be before the date of the loan.');
    setSaving(true);
    setError(null);
    try {
      const db = await getDb();
      const input = { personName, direction, amountCents: cents, description, lentOn, dueOn };
      if (editing) await updateDebt(db, Number(params.id), input);
      else await addDebt(db, input);
      syncAfterChange();
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete this debt?', 'Its repayments will be deleted too. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDebt(await getDb(), Number(params.id));
            syncAfterChange();
            router.dismissTo('/debts');
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: editing ? 'Edit debt' : 'Add debt' }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Segmented<Direction>
          options={[
            { value: 'owes_me', label: 'They owe me' },
            { value: 'i_owe', label: 'I owe them' },
          ]}
          value={direction}
          onChange={setDirection}
        />

        <View style={styles.group}>
          <TextField
            label="Who"
            value={personName}
            onChangeText={setPersonName}
            placeholder="e.g. Mama"
            autoCapitalize="words"
            autoFocus={!editing && !params.person}
          />
          {suggestions.length > 0 ? (
            <ChipRow>
              {suggestions.map((p) => (
                <Chip key={p.id} label={p.name} onPress={() => setPersonName(p.name)} />
              ))}
            </ChipRow>
          ) : null}
        </View>

        <TextField
          label="Amount (₱)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          hint={
            existing && existing.repaidCents > 0
              ? `${formatPeso(existing.repaidCents)} already repaid, so the amount can’t be lower than that.`
              : cents !== null
                ? formatPeso(cents)
                : undefined
          }
          error={amount !== '' && cents === null ? 'Enter a number, like 1500 or 1,500.50.' : undefined}
        />

        <TextField
          label="What for (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. School supplies"
        />

        <DateField
          label={direction === 'owes_me' ? 'Lent on' : 'Borrowed on'}
          value={lentOn}
          onChange={setLentOn}
          maximumDate={today}
        />

        <View style={styles.group}>
          <DateField label="Due date (optional)" value={dueOn} onChange={setDueOn} emptyText="No due date" minimumDate={lentOn} />
          <ChipRow>
            <Chip label="None" selected={dueOn === null} onPress={() => setDueOn(null)} />
            <Chip label="In 1 week" onPress={() => setDueOn(addDays(today, 7))} />
            <Chip label="In 2 weeks" onPress={() => setDueOn(addDays(today, 14))} />
            <Chip label="In 1 month" onPress={() => setDueOn(addOneMonth(today))} />
          </ChipRow>
        </View>

        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}

        {editing ? <Button label="Delete debt" variant="danger" onPress={confirmDelete} /> : null}
      </ScrollView>
      <BottomBar>
        <Button label={editing ? 'Save changes' : 'Add debt'} onPress={save} busy={saving} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  group: { gap: Spacing.two },
});
