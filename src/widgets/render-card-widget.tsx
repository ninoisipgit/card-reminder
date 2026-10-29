'use no memo';
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { listCardStatuses } from '@/data/cards';
import { listDebtsDueSoon } from '@/data/debts';
import { getDb } from '@/data/open';
import { todayIso } from '@/lib/cycles';

import { CardWidget, type CardWidgetProps } from './CardWidget';

/** Must match the widget `name` in app.json. */
export const CARD_WIDGET_NAME = 'CardReminder';

/** Debts due within this many days appear on the widget (PRD open question; 7 assumed). */
export const DEBT_WINDOW_DAYS = 7;

/** Reads what the widget shows from the database. */
export async function loadWidgetData(now: Date = new Date()): Promise<Omit<CardWidgetProps, 'theme'>> {
  const today = todayIso(now);
  const db = await getDb();
  const [cards, debts] = await Promise.all([
    listCardStatuses(db, today),
    listDebtsDueSoon(db, today, DEBT_WINDOW_DAYS),
  ]);
  return { cards, debts, today };
}

/** Light and dark versions; Android picks one from the system theme. */
export async function renderCardWidget() {
  const data = await loadWidgetData();
  return {
    light: <CardWidget {...data} theme="light" />,
    dark: <CardWidget {...data} theme="dark" />,
  };
}

/** Redraw every copy of the widget on the home screen. Call after any data change. */
export function refreshCardWidget(): Promise<void> {
  return requestWidgetUpdate({
    widgetName: CARD_WIDGET_NAME,
    renderWidget: renderCardWidget,
  });
}
