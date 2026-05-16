// Root provider stack. Doc 05 §navigation-structure.
import '../global.css';
import '../lib/i18n/index.js';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getSessionSync } from '../lib/auth/session.js';
import { configurePurchases } from '../lib/purchases.js';
import { LB } from '../lib/theme/colors.js';

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);

  // Configure RevenueCat once we have a stable account_id. The same id is
  // what the server's webhook handler resolves back to a subscription row.
  useEffect(() => {
    const s = getSessionSync();
    if (s?.account_id) configurePurchases(s.account_id);
  }, []);

  return (
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
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
