// Root: providers, session hydration, notification taps, the offline line, one Stack.

import '../lib/i18n/index.js';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/lb/ErrorBoundary.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { OfflineFrame } from '../components/lb/OfflineFrame.js';
import { ToastHost } from '../components/lb/Toast.js';
import { clearAdminToken, installAdminAutoClear } from '../lib/admin.js';
import { ApiError } from '../lib/api/client.js';
import { outreachOpened, postAnswer } from '../lib/api/endpoints.js';
import { clearOutbox, flushOutbox } from '../lib/api/outboxSync.js';
import { drafts } from '../lib/capture/draftStorage.js';
import { keys, queryClient, setHome } from '../lib/api/queries.js';
import { loadSession, onSessionChange } from '../lib/auth/session.js';
import { clearLegacyLocalNotifications, onNotificationTap } from '../lib/push.js';
import { LB } from '../lib/theme/colors.js';

/** Answers kept on the device (closed app, lost connection): send them now. */
async function sendKeptAnswers(): Promise<void> {
  await flushOutbox(postAnswer, (sessionId) => {
    void queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });
    void queryClient.invalidateQueries({ queryKey: keys.home });
  }).catch(() => 0);
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSession().finally(() => {
      setReady(true);
      void sendKeptAnswers();
    });
    // Back online: send what was answered meanwhile.
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void sendKeptAnswers();
    });
    void clearLegacyLocalNotifications();
    // The parents' PIN unlocks one step, never a phone left in the background.
    const offAdmin = installAdminAutoClear(AppState);
    const offSession = onSessionChange((s) => {
      if (!s) {
        clearAdminToken();
        void clearOutbox();
        // A shared phone: the next person does not find her photos.
        void drafts.clearAll();
        queryClient.clear();
        router.replace('/');
      }
    });
    // A new privacy text while the app is open: the server refuses until it is
    // accepted again (409 consent_outdated), so go to the consent screen.
    const offConsent = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      const err = event.action.error;
      if (err instanceof ApiError && err.reason === 'consent_outdated') {
        void queryClient.invalidateQueries({ queryKey: keys.me });
        router.replace('/consent');
      }
    });
    const offTap = onNotificationTap((outreachId) => {
      void outreachOpened(outreachId, null)
        .then(setHome)
        .catch(() => queryClient.invalidateQueries({ queryKey: keys.home }));
      router.replace('/buddy');
    });
    return () => {
      offOnline();
      offAdmin();
      offConsent();
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
                  <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal' }} />
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
