/**
 * One person's unpaid list as a single image, to send in Messenger or keep in Photos.
 * The preview below IS the image: it's captured whole, however long the list is.
 * It always uses light colors so it reads well in any chat. ?person= is the person id.
 */
import * as MediaLibrary from 'expo-media-library';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ThemedText } from '@/components/themed-text';
import { BottomBar } from '@/components/ui/bottom-bar';
import { Button } from '@/components/ui/button';
import { longDate } from '@/components/ui/date-field';
import { Colors, Spacing } from '@/constants/theme';
import { getPerson, listOpenDebts } from '@/data/debts';
import { getDb } from '@/data/open';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/card-display';
import { shortDate, todayIso } from '@/lib/cycles';
import { buildStatement, type Statement, type StatementSection } from '@/lib/debt-statement';
import { formatPeso } from '@/lib/money';

const ink = Colors.light;

function Section({ section }: { section: StatementSection }) {
  const n = section.rows.length;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {section.title.toUpperCase()} · {n} {n === 1 ? 'ITEM' : 'ITEMS'}
      </Text>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Text style={[styles.headText, styles.colDate]}>Date</Text>
        <Text style={[styles.headText, styles.colDesc]}>Description</Text>
        <Text style={[styles.headText, styles.colAmount]}>Amount</Text>
      </View>
      {section.rows.map((r, i) => (
        <View key={r.id} style={[styles.tableRow, i % 2 === 1 && { backgroundColor: ink.backgroundElement }]}>
          <Text style={[styles.cell, styles.colDate]}>{shortDate(r.lentOn)}</Text>
          <View style={styles.colDesc}>
            <Text style={styles.cell}>{r.description}</Text>
            {r.dueOn ? <Text style={styles.cellNote}>Due {shortDate(r.dueOn)}</Text> : null}
          </View>
          <View style={styles.colAmount}>
            <Text style={[styles.cell, styles.amount]}>{formatPeso(r.remainingCents)}</Text>
            {r.repaidCents > 0 ? <Text style={styles.cellNote}>of {formatPeso(r.amountCents)}</Text> : null}
          </View>
        </View>
      ))}
      <View style={[styles.tableRow, styles.totalRow]}>
        <Text style={[styles.totalText, { flex: 1 }]}>Total</Text>
        <Text style={[styles.totalText, styles.amount]}>{formatPeso(section.totalCents)}</Text>
      </View>
    </View>
  );
}

function StatementImage({ s }: { s: Statement }) {
  const both = s.sections.length > 1;
  return (
    <View style={styles.image}>
      <Text style={styles.name}>{s.personName}</Text>
      <Text style={styles.asOf}>Unpaid as of {longDate(s.asOf)}</Text>

      <View style={styles.summary}>
        {s.sections.map((sec) => (
          <View key={sec.direction} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{sec.title}</Text>
            <Text style={[styles.summaryValue, { color: sec.direction === 'owes_me' ? ink.success : ink.danger }]}>
              {formatPeso(sec.totalCents)}
            </Text>
          </View>
        ))}
        {both ? (
          <View style={[styles.summaryRow, styles.summaryNet]}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={styles.summaryValue}>
              {s.netCents === 0
                ? 'Even'
                : s.netCents > 0
                  ? `${s.personName} owes ${formatPeso(s.netCents)}`
                  : `I owe ${formatPeso(-s.netCents)}`}
            </Text>
          </View>
        ) : null}
        {s.paidSoFarCents > 0 ? (
          <Text style={styles.cellNote}>Already paid on these: {formatPeso(s.paidSoFarCents)}</Text>
        ) : null}
      </View>

      {s.sections.map((sec) => (
        <Section key={sec.direction} section={sec} />
      ))}
    </View>
  );
}

export default function ShareListScreen() {
  const theme = useTheme();
  const { person: personParam } = useLocalSearchParams<{ person: string }>();
  const imageRef = useRef<ComponentRef<typeof View>>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const id = Number(personParam);
        const [p, open] = await Promise.all([getPerson(db, id), listOpenDebts(db, id)]);
        setStatement(buildStatement(p.name, open, todayIso()));
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [personParam]);

  const capture = () => captureRef(imageRef, { format: 'png', quality: 1, result: 'tmpfile' });

  const share = async () => {
    setBusy('share');
    setError(null);
    setMessage(null);
    try {
      const uri = await capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${statement?.personName} — unpaid list` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    setMessage(null);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        setError('Allow access to Photos to save the image.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(await capture());
      setMessage('Saved to your Photos (Gallery).');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: statement ? `Share ${statement.personName}’s list` : 'Share list' }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {statement ? (
          statement.itemCount > 0 ? (
            <View ref={imageRef} collapsable={false} style={[styles.frame, { borderColor: theme.border }]}>
              <StatementImage s={statement} />
            </View>
          ) : (
            <ThemedText themeColor="textSecondary">Nothing unpaid. All settled.</ThemedText>
          )
        ) : null}
        {message ? <ThemedText style={{ color: theme.success }}>{message}</ThemedText> : null}
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      </ScrollView>
      <BottomBar>
        <View style={styles.buttons}>
          <Button
            label="Share"
            onPress={share}
            busy={busy === 'share'}
            disabled={!statement || statement.itemCount === 0 || busy !== null}
          />
          <Button
            label="Save to Photos"
            variant="secondary"
            onPress={save}
            busy={busy === 'save'}
            disabled={!statement || statement.itemCount === 0 || busy !== null}
          />
        </View>
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three },
  buttons: { gap: Spacing.two },
  frame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Spacing.two, overflow: 'hidden' },

  // The image itself: fixed light colors.
  image: { backgroundColor: ink.background, padding: 20, gap: 16 },
  name: { color: ink.text, fontSize: 28, fontWeight: '700' },
  asOf: { color: ink.textSecondary, fontSize: 16, marginTop: -12 },
  summary: { backgroundColor: ink.backgroundElement, borderRadius: 12, padding: 14, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryNet: { borderTopWidth: 1, borderTopColor: ink.border, paddingTop: 8 },
  summaryLabel: { color: ink.text, fontSize: 17, flex: 1 },
  summaryValue: { color: ink.text, fontSize: 22, fontWeight: '700' },
  section: { gap: 0 },
  sectionTitle: { color: ink.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9, paddingHorizontal: 8 },
  tableHead: { borderBottomWidth: 1, borderBottomColor: ink.border },
  headText: { color: ink.textSecondary, fontSize: 14, fontWeight: '700' },
  colDate: { width: 56 },
  colDesc: { flex: 1 },
  colAmount: { alignItems: 'flex-end', minWidth: 96 },
  cell: { color: ink.text, fontSize: 16, lineHeight: 21 },
  cellNote: { color: ink.textSecondary, fontSize: 13 },
  amount: { fontWeight: '700', textAlign: 'right' },
  totalRow: { borderTopWidth: 1.5, borderTopColor: ink.text, marginTop: 2 },
  totalText: { color: ink.text, fontSize: 18, fontWeight: '700' },
});
