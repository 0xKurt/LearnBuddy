// Where does this person belong? No session → welcome; a running deletion → the calm
// "being deleted" screen; no consent → consent; no profile → profile; otherwise Buddy.
// Decided from the API, not guessed (lib/gate.ts). The language follows the profile from
// the root layout, wherever the app was opened.

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { LoadFailed } from '../components/lb/LoadFailed.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { useMe } from '../lib/api/queries.js';
import { currentSession } from '../lib/auth/session.js';
import { gateRoute } from '../lib/gate.js';
import { signOutHere } from '../lib/leave.js';

export default function Index() {
  const signedIn = currentSession() !== null;
  if (!signedIn) return <Redirect href="/welcome" />;
  return <SignedInGate />;
}

function SignedInGate() {
  const { t } = useTranslation(['common', 'auth']);
  const me = useMe();
  const [leaving, setLeaving] = useState(false);

  if (me.isPending) return <LoadingState label={t('loading')} />;
  if (me.isError) {
    // Retry, and always a way out (p2-gate-error-no-exit). Her unsent answers and photos
    // stay on the device for her next sign-in.
    //
    // The design's "failed" state (components/core/States.jsx `StateScreen`): Buddy thinks above
    // the line. The design draws a head with a way back there (ui_kits/app/Extra.jsx:255); the
    // gate has nowhere to go back to and no places a ⋯ could open, so the page stands without a
    // head, like "update" and "deleting", and offers what is true here: try again, or sign out.
    return (
      <Screen>
        <LoadFailed error={me.error} busy={me.isRefetching} onRetry={() => void me.refetch()}>
          <Btn
            variant="ghost"
            size="sm"
            disabled={leaving}
            onPress={() => {
              setLeaving(true);
              void signOutHere({ keepLocalWork: true }).finally(() => setLeaving(false));
            }}
          >
            {t('auth:profile.sign_out')}
          </Btn>
        </LoadFailed>
      </Screen>
    );
  }
  return <Redirect href={gateRoute(me.data)} />;
}
