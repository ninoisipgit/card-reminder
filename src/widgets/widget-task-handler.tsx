'use no memo';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { CARD_WIDGET_NAME, renderCardWidget } from './render-card-widget';

/**
 * Android calls this in the background when the widget is added, resized, or
 * due for its periodic refresh (every 30 minutes, the minimum Android allows).
 * Row taps use OPEN_URI / OPEN_APP, which Android handles without calling this.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== CARD_WIDGET_NAME) return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(renderCardWidget());
      break;
    default:
      break;
  }
}
