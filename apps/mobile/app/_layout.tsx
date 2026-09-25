// Root: providers, session hydration, notification taps, the offline line, one Stack.

import '../lib/i18n/index.js';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/lb/ErrorBoundary.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { OfflineFrame } from '../components/lb/OfflineFrame.js';
import { ToastHost } from '../components/lb/Toast.js';
import { outreachOpened } from '../lib/api/endpoints.js';
import { keys, queryClient, setHome } from '../lib/api/queries.js';
import { loadSession, onSessionChange } from '../lib/auth/session.js';
import { clearLegacyLocalNotifications, onNotificationTap } from '../lib/push.js';
import { LB } from '../lib/theme/colors.js';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSession().finally(() => setReady(true));
    void clearLegacyLocalNotifications();
    const offSession = onSessionChange((s) => {
      if (!s) {
        queryClient.clear();
        router.replace('/');
      }
    });
    const offTap = onNotificationTap((outreachId) => {
      void outreachOpened(outreachId, null)
        .then(setHome)
        .catch(() => queryClient.invalidateQueries({ queryKey: keys.home }));
      router.replace('/buddy');
    });
    return () => {
      offSession();
      offTap();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: LB.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <StatusBar style="dark" />
            <OfflineFrame>
              {ready ? (
                <Stack
                  screenOptions={{ headerShown: false, contentStyle: { backgroundColor: LB.bg } }}
                >
                  <Stack.Screen name="pin" options={{ presentation: 'modal' }} />
                </Stack>
              ) : (
                <LoadingState />
              )}
            </OfflineFrame>
            <ToastHost />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
