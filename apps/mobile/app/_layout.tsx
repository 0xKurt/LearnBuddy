// Root: providers, session hydration, notification taps, the offline line, one Stack.

import '../lib/i18n/index.js';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/lb/ErrorBoundary.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { OfflineFrame } from '../components/lb/OfflineFrame.js';
import { toast, ToastHost } from '../components/lb/Toast.js';
import { postAnswer } from '../lib/api/endpoints.js';
import { flushOutbox } from '../lib/api/outboxSync.js';
import { keys, queryClient, setHome } from '../lib/api/queries.js';
import { currentSession, loadSession, onSessionChange } from '../lib/auth/session.js';
import { i18n } from '../lib/i18n/index.js';
import { recoverCameraResult } from '../lib/capture/pendingCamera.js';
import { adoptLocalWork } from '../lib/localWork.js';
import {
  clearLegacyLocalNotifications,
  flushOpened,
  onNotificationTap,
  retryPendingRelease,
  syncPushDevice,
} from '../lib/push.js';
import { LB } from '../lib/theme/colors.js';

/** Answers kept on the device (closed app, lost connection): send them now. */
async function sendKeptAnswers(): Promise<void> {
  await flushOutbox(postAnswer, (sessionId) => {
    void queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });
    void queryClient.invalidateQueries({ queryKey: keys.home });
  }).catch(() => 0);
}

/** "A message was opened" reports kept on the device (lib/push.ts): send them now. */
function sendOpenedReports(): void {
  void flushOpened(setHome).catch(() => undefined);
}

/** Signed in: her leftovers are sent, this device is hers for push. */
async function afterSignedIn(userId: string): Promise<void> {
  await adoptLocalWork(userId).catch(() => undefined);
  void sendKeptAnswers();
  sendOpenedReports();
  void syncPushDevice().catch(() => undefined);
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  // Whose session the app runs with: token refreshes save the session again and must not
  // count as a new sign-in.
  const userRef = useRef<string | null>(null);

  useEffect(() => {
    void loadSession()
      .then(async (s) => {
        userRef.current = s?.user_id ?? null;
        if (s) await afterSignedIn(s.user_id);
        else void retryPendingRelease().catch(() => undefined);
      })
      .finally(() => {
        readyRef.current = true;
        setReady(true);
      });
    // Back online: send what was answered meanwhile.
    const offOnline = onlineManager.subscribe((online) => {
      if (!online) return;
      void sendKeptAnswers();
      sendOpenedReports();
      void retryPendingRelease().catch(() => undefined);
    });
    void clearLegacyLocalNotifications();
    const offSession = onSessionChange((s, ended) => {
      if (s) {
        if (userRef.current === s.user_id) return;
        userRef.current = s.user_id;
        // Someone else's leftovers go; hers (after an expired session) are sent now.
        void afterSignedIn(s.user_id);
        return;
      }
      userRef.current = null;
      // Nothing of the previous learner stays reachable: cache and whole stack reset
      // (audit M-72). Her unsent answers and photos stay on the device unless she
      // signed out on purpose (settings deletes them there, after a warning).
      queryClient.clear();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
      if (ended === 'expired') toast.show(i18n.t('common:session.expired'));
    });
    // A tap (also the one that started the app) is kept until the API has it and
    // sent once signed in (audit M-64). A warm tap goes back to Buddy without
    // stacking a second Buddy screen (p2-tap-replace-stacks-second-buddy); on a
    // cold start the start screen leads there anyway.
    const offTap = onNotificationTap(() => {
      sendOpenedReports();
      if (!readyRef.current || !currentSession()) return;
      if (router.canDismiss()) router.dismissTo('/buddy');
      else router.replace('/buddy');
    });
    return () => {
      offOnline();
      offSession();
      offTap();
    };
  }, []);

  // Android cut the app off while the camera was open: the photo goes on to capture (M-22).
  useEffect(() => {
    if (!ready || !currentSession()) return;
    void recoverCameraResult().then((found) => {
      if (found) router.push({ pathname: '/capture', params: { resume: '1', pending: '1' } });
    });
  }, [ready]);

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
