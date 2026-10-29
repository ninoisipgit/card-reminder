'use no memo';
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { getCardStatus, sortByUrgency, todayIso } from '@/lib/cycles';
import { debtsForWidget, sampleCards, sampleDebts } from '@/lib/sample-data';

import { CardWidget, type CardWidgetProps } from './CardWidget';

/** Must match the widget `name` in app.json. */
export const CARD_WIDGET_NAME = 'CardReminder';

export function buildWidgetData(now: Date = new Date()): Omit<CardWidgetProps, 'theme'> {
  const today = todayIso(now);
  const cards = sortByUrgency(sampleCards(today).map((c) => getCardStatus(c, today)));
  const debts = debtsForWidget(sampleDebts(today), today);
  return { cards, debts, today };
}

/** Light and dark versions; Android picks one from the system theme. */
export function renderCardWidget() {
  const data = buildWidgetData();
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
