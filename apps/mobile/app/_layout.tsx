// Root provider stack. Doc 05 §navigation-structure.
import '../global.css';
import '../lib/i18n/index.js';

import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, ErrorBoundary, OfflineBanner, ToastHost, toast } from '../components/lb/index.js';
import { initAnalytics, identifyUser, track } from '../lib/analytics.js';
import { devNukeAccount } from '../lib/dev/reset.js';
import { fetchVersionInfo } from '../lib/api/version.js';
import { getSessionSync } from '../lib/auth/session.js';
import { i18n } from '../lib/i18n/index.js';
import { configurePurchases } from '../lib/purchases.js';
import { initSentry, setSentryUser } from '../lib/sentry.js';
import { LB } from '../lib/theme/colors.js';

// Initialise Sentry as early as possible — must run before the first render
// so a render crash on the very first screen is still captured.
initSentry();

// Foreground notification → in-app toast so iOS doesn't silently drop banners.
// Skip entirely in Expo Go (SDK 53+ removed Android push from Expo Go).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Constants = require('expo-constants');
  const ownership = (Constants?.default ?? Constants)?.appOwnership;
  if (ownership !== 'expo') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifs = require('expo-notifications') as {
      setNotificationHandler: (h: {
        handleNotification: () => Promise<{
          shouldShowAlert: boolean;
          shouldPlaySound: boolean;
          shouldSetBadge: boolean;
        }>;
      }) => void;
      addNotificationReceivedListener: (
        cb: (n: { request: { content: { title: string | null; body: string | null } } }) => void,
      ) => { remove(): void };
    };
    Notifs.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    Notifs.addNotificationReceivedListener((notification) => {
      const { title, body } = notification.request.content;
      if (title) toast.info(title, body ?? undefined);
    });
  }
} catch {
  // test env
}

function semverLt(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}

const WHATS_NEW_VERSION = '1.1.0';

export default function RootLayout() {
  // Don't retry client errors (a clean 404 "no items" must surface
  // immediately, not after 3 backoff rounds); retry transient/5xx twice.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | null)?.status;
              if (typeof status === 'number' && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
    [],
  );
  const insets = useSafeAreaInsets();
  const [forceUpdate, setForceUpdate] = useState(false);
  const [obscured, setObscured] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  useEffect(() => {
    void initAnalytics().then(() => track('app_opened'));
  }, []);

  useEffect(() => {
    if (__DEV__) return;
    void (async () => {
      const seen = await SecureStore.getItemAsync('lb_whats_new_seen');
      // First install: seen is null — mark silently, don't show.
      // Upgrade: seen is an older version — show what's new.
      if (seen !== null && seen !== WHATS_NEW_VERSION) {
        setShowWhatsNew(true);
      }
      await SecureStore.setItemAsync('lb_whats_new_seen', WHATS_NEW_VERSION);
    })();
  }, []);

  useEffect(() => {
    void fetchVersionInfo()
      .then(({ min_app_version }) => {
        const current = Application.nativeApplicationVersion ?? '0.0.0';
        if (semverLt(current, min_app_version)) setForceUpdate(true);
      })
      .catch(() => {
        // Network offline — never block the user.
      });
  }, []);

  // Show privacy overlay in app-switcher so screen content isn't captured.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setObscured(state === 'inactive');
    });
    return () => sub.remove();
  }, []);

  // Refetch stale queries whenever the app returns to the foreground (Fix #22).
  useEffect(() => {
    return focusManager.setEventListener((handleFocus) => {
      const sub = AppState.addEventListener('change', (state) => {
        handleFocus(state === 'active');
      });
      return () => sub.remove();
    });
  }, []);

  // Navigate to the relevant folder when a test-reminder notification is tapped.
  useEffect(() => {
    let sub: { remove(): void } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Constants = require('expo-constants');
      const ownership = (Constants?.default ?? Constants)?.appOwnership;
      if (ownership !== 'expo') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifs = require('expo-notifications') as {
          addNotificationResponseReceivedListener: (
            cb: (r: {
              actionIdentifier: string;
              notification: { request: { content: { data: Record<string, unknown> } } };
            }) => void,
          ) => { remove(): void };
        };
        sub = Notifs.addNotificationResponseReceivedListener((response) => {
          if (response.actionIdentifier === 'PRACTICE_NOW') {
            router.push('/(learner)/practice' as never);
            return;
          }
          const data = response.notification.request.content.data;
          if (typeof data.folder_id === 'string') {
            router.push({
              pathname: '/(learner)/folder/[folderId]',
              params: { folderId: data.folder_id, subjectId: data.subject_id ?? '' },
            } as never);
          }
        });
      }
    } catch {
      // test env
    }
    return () => sub?.remove();
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

  const t = (k: string) => i18n.t(`common:${k}`);
  const storeUrl =
    Platform.OS === 'ios'
      ? (process.env.EXPO_PUBLIC_IOS_STORE_URL ?? 'https://apps.apple.com/search?term=learnbuddy')
      : (process.env.EXPO_PUBLIC_ANDROID_STORE_URL ??
        'https://play.google.com/store/search?q=learnbuddy');

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: LB.paper }}>
        <SafeAreaProvider>
          <OfflineBanner />
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
          <Modal visible={showWhatsNew} transparent animationType="slide" statusBarTranslucent>
            <View
              style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
            >
              <View
                style={{
                  backgroundColor: LB.paper,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  padding: 28,
                  paddingBottom: Math.max(insets.bottom + 16, 28),
                  gap: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: LB.ink,
                    letterSpacing: -0.5,
                  }}
                >
                  {t('whats_new.title')}
                </Text>
                {(i18n.t('common:whats_new.items', { returnObjects: true }) as string[]).map(
                  (item, idx) => (
                    <Text key={idx} style={{ fontSize: 14, color: LB.ink2, lineHeight: 20 }}>
                      {'• '}
                      {item}
                    </Text>
                  ),
                )}
                <Btn full onPress={() => setShowWhatsNew(false)}>
                  {t('whats_new.cta')}
                </Btn>
              </View>
            </View>
          </Modal>
          {obscured && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: LB.lavender,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '700', color: LB.ink, letterSpacing: -0.4 }}>
                LearnBuddy
              </Text>
            </View>
          )}
          <Modal visible={forceUpdate} transparent animationType="fade" statusBarTranslucent>
            <View
              style={{
                flex: 1,
                backgroundColor: LB.paper,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 32,
              }}
            >
              <View
                style={{
                  backgroundColor: LB.lavender,
                  borderRadius: 24,
                  padding: 32,
                  width: '100%',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                    color: LB.ink,
                    letterSpacing: -0.5,
                    textAlign: 'center',
                  }}
                >
                  {t('update.title')}
                </Text>
                <Text style={{ fontSize: 14, color: LB.ink2, lineHeight: 21, textAlign: 'center' }}>
                  {t('update.body')}
                </Text>
                <Btn onPress={() => void Linking.openURL(storeUrl)}>{t('update.cta')}</Btn>
              </View>
            </View>
          </Modal>
          {/* Global DEV NUKE — always reachable in development */}
          {__DEV__ && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'DEV · NUKE',
                  'Hard-delete this account from Supabase Auth?\nAll DB rows cascade. Cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'NUKE',
                      style: 'destructive',
                      onPress: () => {
                        void devNukeAccount()
                          .then(({ serverDeleted }) => {
                            if (!serverDeleted) {
                              Alert.alert(
                                '⚠️ Partial',
                                'Local data cleared.\nServer delete FAILED — user still in DB (API unreachable or dev routes not mounted).',
                                [
                                  {
                                    text: 'OK',
                                    onPress: () =>
                                      router.replace('/(onboarding)/language' as never),
                                  },
                                ],
                              );
                            } else {
                              router.replace('/(onboarding)/language' as never);
                            }
                          })
                          .catch(() => {
                            Alert.alert('Error', 'Could not clear local data.');
                          });
                      },
                    },
                  ],
                );
              }}
              style={{
                position: 'absolute',
                top: insets.top + 8,
                right: 16,
                zIndex: 9999,
              }}
            >
              <View
                style={{
                  backgroundColor: '#7b1fa2',
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
                >
                  DEV · NUKE
                </Text>
              </View>
            </Pressable>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
