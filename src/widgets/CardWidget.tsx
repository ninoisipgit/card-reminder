'use no memo'; // React Compiler must not add hooks to widget components
import React from 'react';
import {
  FlexWidget,
  ListWidget,
  TextWidget,
  type ColorProp,
} from 'react-native-android-widget';

import { toDayNumber, dueLabel, shortDate, type CardStatus, type IsoDate } from '@/lib/cycles';
import { formatPeso, type DebtDue } from '@/lib/sample-data';

export type WidgetTheme = 'light' | 'dark';

type Palette = {
  background: ColorProp;
  row: ColorProp;
  overdueRow: ColorProp;
  text: ColorProp;
  muted: ColorProp;
  section: ColorProp;
  overdue: ColorProp;
  overdueBg: ColorProp;
  dueSoon: ColorProp;
  dueSoonBg: ColorProp;
  paid: ColorProp;
  paidBg: ColorProp;
  neutral: ColorProp;
  neutralBg: ColorProp;
};

const PALETTES: Record<WidgetTheme, Palette> = {
  light: {
    background: '#FFFFFF',
    row: '#F3F4F6',
    overdueRow: '#FEF2F2',
    text: '#111827',
    muted: '#6B7280',
    section: '#9CA3AF',
    overdue: '#B91C1C',
    overdueBg: '#FEE2E2',
    dueSoon: '#92400E',
    dueSoonBg: '#FEF3C7',
    paid: '#166534',
    paidBg: '#DCFCE7',
    neutral: '#374151',
    neutralBg: '#E5E7EB',
  },
  dark: {
    background: '#1C1C1E',
    row: '#2C2C2E',
    overdueRow: '#3B1416',
    text: '#F9FAFB',
    muted: '#A1A1AA',
    section: '#71717A',
    overdue: '#FCA5A5',
    overdueBg: '#5C1A1D',
    dueSoon: '#FCD34D',
    dueSoonBg: '#4A3410',
    paid: '#86EFAC',
    paidBg: '#163A24',
    neutral: '#E4E4E7',
    neutralBg: '#3A3A3C',
  },
};

export type CardWidgetProps = {
  cards: CardStatus[];
  debts: DebtDue[];
  today: IsoDate;
  theme: WidgetTheme;
};

function Badge({ text, fg, bg }: { text: string; fg: ColorProp; bg: ColorProp }) {
  return (
    <FlexWidget style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <TextWidget text={text} style={{ fontSize: 12, fontWeight: '600', color: fg }} />
    </FlexWidget>
  );
}

function SectionLabel({ text, p }: { text: string; p: Palette }) {
  return (
    <FlexWidget style={{ width: 'match_parent', paddingTop: 6, paddingBottom: 4, paddingHorizontal: 4 }}>
      <TextWidget text={text} style={{ fontSize: 11, fontWeight: '700', color: p.section }} />
    </FlexWidget>
  );
}

function Row({
  uri,
  title,
  subtitle,
  badge,
  highlight,
  label,
  p,
}: {
  uri: string;
  title: string;
  subtitle: string;
  badge: React.ReactElement;
  highlight: boolean;
  label: string;
  p: Palette;
}) {
  return (
    <FlexWidget
      style={{ width: 'match_parent' }}
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: highlight ? p.overdueRow : p.row,
          borderRadius: 12,
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginVertical: 3,
        }}
      >
        <FlexWidget style={{ flex: 1, flexDirection: 'column', paddingRight: 8 }}>
          <TextWidget text={title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '600', color: p.text }} />
          <TextWidget text={subtitle} maxLines={1} truncate="END" style={{ fontSize: 12, color: p.muted }} />
        </FlexWidget>
        {badge}
      </FlexWidget>
    </FlexWidget>
  );
}

function CardRow({ status, p }: { status: CardStatus; p: Palette }) {
  const { card, current, state, daysLeft, overdueCount } = status;
  const tone =
    state === 'overdue'
      ? { fg: p.overdue, bg: p.overdueBg }
      : state === 'dueSoon'
        ? { fg: p.dueSoon, bg: p.dueSoonBg }
        : state === 'paid'
          ? { fg: p.paid, bg: p.paidBg }
          : { fg: p.neutral, bg: p.neutralBg };
  const badgeText = state === 'paid' ? 'Paid ✓' : dueLabel(daysLeft);
  const title = overdueCount > 1 ? `${card.name} · ${overdueCount} unpaid` : card.name;
  const subtitle = `Statement ${shortDate(current.statement)} · Due ${shortDate(current.due)}`;
  return (
    <Row
      uri={`cardreminder://?card=${card.id}`}
      title={title}
      subtitle={subtitle}
      badge={<Badge text={badgeText} fg={tone.fg} bg={tone.bg} />}
      highlight={state === 'overdue'}
      label={`${card.name}, ${badgeText}, due ${shortDate(current.due)}`}
      p={p}
    />
  );
}

function DebtRow({ debt, today, p }: { debt: DebtDue; today: IsoDate; p: Palette }) {
  const daysLeft = toDayNumber(debt.due) - toDayNumber(today);
  const overdue = daysLeft < 0;
  const who = debt.direction === 'owesMe' ? `${debt.person} owes you` : `You owe ${debt.person}`;
  const tone = overdue ? { fg: p.overdue, bg: p.overdueBg } : { fg: p.dueSoon, bg: p.dueSoonBg };
  return (
    <Row
      uri={`cardreminder://?debt=${debt.id}`}
      title={`${who} ${formatPeso(debt.remaining)}`}
      subtitle={`Due ${shortDate(debt.due)}`}
      badge={<Badge text={dueLabel(daysLeft)} fg={tone.fg} bg={tone.bg} />}
      highlight={overdue}
      label={`${who} ${formatPeso(debt.remaining)}, ${dueLabel(daysLeft)}`}
      p={p}
    />
  );
}

export function CardWidget({ cards, debts, today, theme }: CardWidgetProps) {
  const p = PALETTES[theme];
  const overdue = cards.filter((c) => c.state === 'overdue').length;
  const dueSoon = cards.filter((c) => c.state === 'dueSoon').length;
  const summary =
    overdue + dueSoon === 0
      ? 'All clear'
      : [overdue ? `${overdue} overdue` : '', dueSoon ? `${dueSoon} due soon` : ''].filter(Boolean).join(' · ');

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: p.background,
        borderRadius: 20,
        padding: 12,
      }}
    >
      <FlexWidget
        clickAction="OPEN_APP"
        accessibilityLabel={`Payments. ${summary}. Open app.`}
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          paddingBottom: 6,
        }}
      >
        <TextWidget text="Payments" style={{ fontSize: 16, fontWeight: '700', color: p.text }} />
        <TextWidget
          text={summary}
          style={{ fontSize: 12, fontWeight: '600', color: overdue ? p.overdue : p.muted }}
        />
      </FlexWidget>

      <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
        <SectionLabel text="CARDS" p={p} />
        {cards.length === 0 ? (
          <SectionLabel text="No cards yet. Tap to add one." p={p} />
        ) : (
          cards.map((status) => <CardRow key={status.card.id} status={status} p={p} />)
        )}
        {debts.length > 0 ? <SectionLabel text="DEBTS DUE" p={p} /> : null}
        {debts.map((debt) => (
          <DebtRow key={debt.id} debt={debt} today={today} p={p} />
        ))}
      </ListWidget>
    </FlexWidget>
  );
}
