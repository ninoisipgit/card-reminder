// App entry: starts Expo Router and registers the home-screen widget handler.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './src/widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
