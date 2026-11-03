/**
 * Paid history, grouped by person: each person's settled debts, most recent first.
 * People are ordered by their latest settled debt. Search matches a name or what it was for.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { DebtRow } from '@/components/debt-row';
import { ThemedText } from '@/components/themed-text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { listSettledDebts, type Debt } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { todayIso } from '@/lib/cycles';
import { formatPeso } from '@/lib/money';

type PersonSection = {
  personId: number;
  personName: string;
  owedToMeCents: number;
  iOweCents: number;
  data: Debt[];
};

/** Debts arrive newest-settled first, so sections keep that order too. */
function groupByPerson(debts: Debt[]): PersonSection[] {
  const sections = new Map<number, PersonSection>();
  for (const d of debts) {
    const s = sections.get(d.personId) ?? {
      personId: d.personId,
      personName: d.personName,
      owedToMeCents: 0,
      iOweCents: 0,
      data: [],
    };
    if (d.direction === 'owes_me') s.owedToMeCents += d.amountCents;
    else s.iOweCents += d.amountCents;
    s.data.push(d);
    sections.set(d.personId, s);
  }
  return [...sections.values()];
}

function SectionHeader({ section }: { section: PersonSection }) {
  const theme = useTheme();
  const n = section.data.length;
  const totals = [
    section.owedToMeCents > 0 ? `${formatPeso(section.owedToMeCents)} paid back to you` : '',
    section.iOweCents > 0 ? `${formatPeso(section.iOweCents)} you paid back` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${section.personName}, ${n} paid. Open`}
      onPress={() => router.push({ pathname: '/debts/person/[id]', params: { id: String(section.personId) } })}
      style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
      <View style={styles.sectionTitleRow}>
        <ThemedText type="smallBold" style={{ fontSize: 19, flex: 1 }}>
          {section.personName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {n} paid
        </ThemedText>
      </View>
      {totals ? (
        <ThemedText type="small" themeColor="textSecondary">
          {totals}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export default function PaidHistoryScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [sections, setSections] = useState<PersonSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const list = await listSettledDebts(await getDb(), { search });
          if (active) setSections(groupByPerson(list));
        } catch (e) {
          if (active) setError(errorMessage(e));
        }
      })();
      return () => {
        active = false;
      };
    }, [search]),
  );

  const today = todayIso();
  return (
    <SectionList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled
      sections={sections ?? []}
      keyExtractor={(d) => String(d.id)}
      renderSectionHeader={({ section }) => <SectionHeader section={section} />}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <DebtRow debt={item} today={today} />
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Name or what it was for" />
          {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
        </View>
      }
      ListEmptyComponent={
        sections ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {search.trim() ? 'No paid debts match.' : 'Debts move here once they’re fully repaid.'}
          </ThemedText>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  sectionHeader: { paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: Spacing.half },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  item: { marginBottom: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
});
