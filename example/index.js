/**
 * @format
 */

import React from 'react';
import { AppRegistry } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { name as appName } from './app.json';

// SafeAreaProvider must wrap the app so `useSafeAreaInsets` / `SafeAreaView`
// can read the device's real insets (notch, status bar, home indicator).
function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

AppRegistry.registerComponent(appName, () => Root);
