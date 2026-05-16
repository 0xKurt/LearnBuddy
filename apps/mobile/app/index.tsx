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
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { clearSession, loadSession } from '../lib/auth/session.js';
import { ApiError } from '../lib/api/client.js';
import { getAccount } from '../lib/api/account.js';
import { hydrateSavedLocale } from '../lib/i18n/index.js';
import { loadSavedLocale } from '../lib/i18n/locale-storage.js';
import { LB } from '../lib/theme/colors.js';

type Destination =
  | '/(onboarding)/language'
  | '/(onboarding)/welcome'
  | '/(onboarding)/consent'
  | '/(onboarding)/who-uses'
  | '/(learner)/home';

export default function IndexRoute() {
  const [dest, setDest] = useState<Destination | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Apply any saved locale immediately so downstream screens render
      // in the user's chosen language without a flicker.
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
        if (!account.consent) {
          setDest('/(onboarding)/consent');
        } else if (!account.learner) {
          setDest('/(onboarding)/who-uses');
        } else {
          setDest('/(learner)/home');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          await clearSession();
        }
        setDest('/(onboarding)/welcome');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        <ActivityIndicator color={LB.ink2} />
      </View>
    );
  }
  // expo-router's typed-routes regenerate on `expo start`, not `expo export`;
  // the language route is new this slice so the typed-routes .d.ts may not
  // yet list it. Cast keeps the typecheck green until the type file catches up.
  return <Redirect href={dest as never} />;
}
