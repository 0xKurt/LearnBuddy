// Root provider stack. Doc 05 §navigation-structure.
import '../global.css';
import '../lib/i18n/index.js';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary, ToastHost } from '../components/lb/index.js';
import { initAnalytics, identifyUser, track } from '../lib/analytics.js';
import { getSessionSync } from '../lib/auth/session.js';
import { configurePurchases } from '../lib/purchases.js';
import { initSentry, setSentryUser } from '../lib/sentry.js';
import { LB } from '../lib/theme/colors.js';

// Initialise Sentry as early as possible — must run before the first render
// so a render crash on the very first screen is still captured.
initSentry();

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    // PostHog client init is async (loads feature flags); fire-and-forget so
    // it doesn't block the first paint.
    void initAnalytics().then(() => track('app_opened'));
  }, []);

  // Configure RevenueCat + observability identity once we have a stable
  // account_id. Same id is what the server's webhook handler resolves back
  // to a subscription row.
  useEffect(() => {
    const s = getSessionSync();
    if (s?.account_id) {
      configurePurchases(s.account_id);
      identifyUser(s.account_id);
      setSentryUser(s.user_id, s.account_id);
    }
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: LB.paper }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: LB.paper } }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(learner)" />
              <Stack.Screen name="(admin)" options={{ presentation: 'modal' }} />
              <Stack.Screen name="login" />
              <Stack.Screen name="reset-password" />
            </Stack>
            <ToastHost />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
