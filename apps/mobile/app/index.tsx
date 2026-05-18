// Cold-launch router. Doc 04 §account + Doc 05 §navigation.
//
// On mount we:
//   1. Hydrate the persisted app locale + session.
//   2. If the user hasn't picked a locale yet — /(onboarding)/language.
//   3. If no session — welcome.
//   4. Otherwise call GET /account and pick:
//        - no consent       → /(onboarding)/consent
//        - no learner       → /(onboarding)/who-uses
//        - else             → /(learner)/home
//      A 401 means the persisted session is dead; clear it and welcome.

import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { clearSession, loadSession, setSession } from '../lib/auth/session.js';
import { ApiError } from '../lib/api/client.js';
import { getAccount } from '../lib/api/account.js';
import { hydrateSavedLocale, i18n } from '../lib/i18n/index.js';
import { loadSavedLocale } from '../lib/i18n/locale-storage.js';
import { LB } from '../lib/theme/colors.js';

type Destination =
  | '/(onboarding)/language'
  | '/(onboarding)/welcome'
  | '/(onboarding)/consent'
  | '/(onboarding)/add-profile'
  | '/(learner)/home';

export default function IndexRoute() {
  const [dest, setDest] = useState<Destination | null>(null);
  const [loadError, setLoadError] = useState(false);

  const resolve = useCallback(() => {
    setLoadError(false);
    setDest(null);
    let cancelled = false;
    void (async () => {
      await hydrateSavedLocale();
      const savedLocale = await loadSavedLocale();
      if (cancelled) return;
      if (!savedLocale) {
        setDest('/(onboarding)/language');
        return;
      }
      const session = await loadSession();
      if (cancelled) return;
      if (!session) {
        setDest('/(onboarding)/welcome');
        return;
      }
      try {
        const account = await getAccount();
        if (cancelled) return;
        // Backfill account_id into the stored session if it wasn't set during
        // login (first login stores account_id: '' since getAccount hadn't run yet).
        if (!session.account_id) {
          await setSession({ ...session, account_id: account.id });
        }
        if (!account.consent) {
          setDest('/(onboarding)/consent');
        } else if (!account.learner) {
          setDest('/(onboarding)/add-profile');
        } else {
          setDest('/(learner)/home');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          await clearSession();
          setDest('/(onboarding)/welcome');
        } else {
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return resolve();
  }, [resolve]);

  if (loadError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: LB.paper,
          gap: 16,
          paddingHorizontal: 32,
        }}
      >
        <Text style={{ fontSize: 16, color: LB.ink, textAlign: 'center' }}>
          {i18n.t('common:load_error')}
        </Text>
        <Pressable onPress={resolve} hitSlop={12}>
          <View
            style={{
              backgroundColor: LB.ink,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
              {i18n.t('common:actions.retry')}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  }

  if (!dest) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: LB.paper,
        }}
      >
        <ActivityIndicator color={LB.ink2} accessibilityLabel={i18n.t('common:loading')} />
      </View>
    );
  }
  // expo-router's typed-routes regenerate on `expo start`, not `expo export`;
  // the language route is new this slice so the typed-routes .d.ts may not
  // yet list it. Cast keeps the typecheck green until the type file catches up.
  return <Redirect href={dest as never} />;
}
