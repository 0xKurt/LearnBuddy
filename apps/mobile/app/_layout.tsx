// Root: providers, session hydration, notification taps, the offline line, one Stack.

import '../lib/i18n/index.js';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/lb/ErrorBoundary.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { OfflineFrame } from '../components/lb/OfflineFrame.js';
import { SplashHandoff } from '../components/lb/SplashHandoff.js';
import { toast, ToastHost } from '../components/lb/Toast.js';
import { clearAdminToken, installAdminAutoClear } from '../lib/admin.js';
import { ApiError } from '../lib/api/client.js';
import { postAnswer } from '../lib/api/endpoints.js';
import { flushOutbox } from '../lib/api/outboxSync.js';
import { keys, queryClient, setHome } from '../lib/api/queries.js';
import { currentSession, loadSession, onSessionChange } from '../lib/auth/session.js';
import { applyLocale, deviceLocale, i18n } from '../lib/i18n/index.js';
import { learnerLocaleOf } from '../lib/i18n/follow.js';
import { ShareIntake } from '../components/capture/ShareIntake.js';
import { clearIncoming } from '../lib/capture/incoming.js';
import { recoverCameraResult } from '../lib/capture/pendingCamera.js';
import { adoptLocalWork } from '../lib/localWork.js';
import {
  clearLegacyLocalNotifications,
  flushActions,
  flushOpened,
  onNotificationTap,
  registerPushCategories,
  retryPendingRelease,
  syncPushDevice,
} from '../lib/push.js';
import { practiceRoute } from '../lib/pushActions.js';
import { LB } from '../lib/theme/colors.js';

/** Answers kept on the device (closed app, lost connection): send them now. */
async function sendKeptAnswers(): Promise<void> {
  const done = await flushOutbox(postAnswer, (sessionId) => {
    void queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });
    void queryClient.invalidateQueries({ queryKey: keys.home });
  }).catch(() => null);
  // An answer that arrived too late (question closed, session over) is not dropped
  // silently (refused-offline-answers-dropped-silently).
  if (done && done.refused > 0) toast.show(i18n.t('common:outbox_refused'));
}

/** "Jetzt üben" pressed in this run of the app: where its answer should lead. */
const practiceWanted = new Set<string>();
let showPractice: (route: string) => void = () => undefined;

/**
 * What the device still owes the API about notifications (lib/push.ts) — "opened" reports and
 * pressed buttons: send them now. The answer to "Jetzt üben" opens the practice it started.
 */
function sendOpenedReports(): void {
  void flushOpened(setHome).catch(() => undefined);
  void flushActions((e, res) => {
    void queryClient.invalidateQueries({ queryKey: keys.home });
    if (e.action === 'practice_now' && practiceWanted.delete(e.id)) {
      showPractice(practiceRoute(res.session_id));
    }
  }).catch(() => undefined);
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
  // Where a notification button asked to go before the app was ready.
  const pendingRoute = useRef<string | null>(null);
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
    // The parents' PIN unlocks one step, never a phone left in the background.
    const offAdmin = installAdminAutoClear(AppState);
    const offSession = onSessionChange((s, ended) => {
      if (s) {
        if (userRef.current === s.user_id) return;
        userRef.current = s.user_id;
        // Someone else's leftovers go; hers (after an expired session) are sent now.
        void afterSignedIn(s.user_id);
        return;
      }
      clearAdminToken();
      clearIncoming();
      userRef.current = null;
      // The welcome screen speaks the phone's language, not the previous learner's.
      applyLocale(deviceLocale());
      // Nothing of the previous learner stays reachable: cache and whole stack reset
      // (audit M-72). Her unsent answers and photos stay on the device unless she
      // signed out on purpose (settings deletes them there, after a warning).
      queryClient.clear();
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
      if (ended === 'expired') toast.show(i18n.t('common:session.expired'));
    });
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      // The profile's language, wherever the app was entered (a notification tap, a
      // reload), not only through the start screen (p2-locale-not-applied-on-direct-routes).
      if (event.action.type === 'success') {
        const locale = learnerLocaleOf(event.query.queryKey, event.action.data);
        if (locale) applyLocale(locale);
        return;
      }
      if (event.action.type !== 'error') return;
      const err = event.action.error;
      if (!(err instanceof ApiError)) return;
      // A new privacy text while the app is open: the server refuses until it is
      // accepted again (409 consent_outdated), so go to the consent screen.
      if (err.reason === 'consent_outdated') {
        void queryClient.invalidateQueries({ queryKey: keys.me });
        router.replace('/consent');
      }
      // The deletion started: the account takes no more changes (409 deletion_running).
      if (err.reason === 'deletion_running') {
        void queryClient.invalidateQueries({ queryKey: keys.me });
        if (router.canDismiss()) router.dismissAll();
        router.replace('/deleting');
      }
    });
    // A tap (also the one that started the app) is kept until the API has it and
    // sent once signed in (audit M-64). A warm tap goes back to Buddy without
    // stacking a second Buddy screen (p2-tap-replace-stacks-second-buddy); on a
    // cold start the start screen leads there anyway.
    // "Jetzt üben" leads straight to the prepared practice once the API started it (on a cold
    // start: as soon as the app is ready); "Heute nicht" and "Seltener schreiben" only report.
    showPractice = (route) => {
      if (readyRef.current && currentSession()) router.push(route);
      else pendingRoute.current = route;
    };
    void registerPushCategories();
    const offTap = onNotificationTap((outreachId, press) => {
      if (press.kind === 'action' && press.action === 'practice_now')
        practiceWanted.add(outreachId);
      sendOpenedReports();
      if (press.kind === 'action') return;
      if (!readyRef.current || !currentSession()) return;
      if (router.canDismiss()) router.dismissTo('/buddy');
      else router.replace('/buddy');
    });
    return () => {
      offOnline();
      offAdmin();
      offQueries();
      offSession();
      offTap();
    };
  }, []);

  // "Jetzt üben" pressed while the app was starting: its practice opens once it is ready.
  useEffect(() => {
    if (!ready || !pendingRoute.current || !currentSession()) return;
    const route = pendingRoute.current;
    pendingRoute.current = null;
    router.push(route);
  }, [ready]);

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
                <>
                  <Stack
                    screenOptions={{ headerShown: false, contentStyle: { backgroundColor: LB.bg } }}
                  >
                    <Stack.Screen name="pin" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="talk" options={{ presentation: 'fullScreenModal' }} />
                  </Stack>
                  {/* Images and PDFs shared from other apps go to capture. */}
                  <ShareIntake />
                </>
              ) : (
                <LoadingState />
              )}
            </OfflineFrame>
            <ToastHost />
            <SplashHandoff ready={ready} />
          </ErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
