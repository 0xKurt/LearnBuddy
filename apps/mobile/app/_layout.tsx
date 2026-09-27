// Root: providers, session hydration, notification taps, the offline line, one Stack.

import '../lib/i18n/index.js';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/lb/ErrorBoundary.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { OfflineFrame } from '../components/lb/OfflineFrame.js';
import { toast, ToastHost } from '../components/lb/Toast.js';
import { outreachOpened, postAnswer } from '../lib/api/endpoints.js';
import { flushOutbox } from '../lib/api/outboxSync.js';
import { keys, queryClient, setHome } from '../lib/api/queries.js';
import { loadSession, onSessionChange } from '../lib/auth/session.js';
import { i18n } from '../lib/i18n/index.js';
import { adoptLocalWork } from '../lib/localWork.js';
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
    void loadSession()
      .then(async (s) => {
        if (s) await adoptLocalWork(s.user_id).catch(() => undefined);
      })
      .finally(() => {
        setReady(true);
        void sendKeptAnswers();
      });
    // Back online: send what was answered meanwhile.
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void sendKeptAnswers();
    });
    void clearLegacyLocalNotifications();
    const offSession = onSessionChange((s, ended) => {
      if (s) {
        // Someone else's leftovers go; hers (after an expired session) are sent now.
        void adoptLocalWork(s.user_id)
          .catch(() => undefined)
          .then(sendKeptAnswers);
        return;
      }
      // Nothing of the previous learner stays reachable: cache and whole stack reset
      // (audit M-72). Her unsent answers and photos stay on the device unless she
      // signed out on purpose (settings deletes them there, after a warning).
      queryClient.clear();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
      if (ended === 'expired') toast.show(i18n.t('common:session.expired'));
    });
    const offTap = onNotificationTap((outreachId) => {
      void outreachOpened(outreachId, null)
        .then(setHome)
        .catch(() => queryClient.invalidateQueries({ queryKey: keys.home }));
      router.replace('/buddy');
    });
    return () => {
      offOnline();
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
