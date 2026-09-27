// Where does this person belong? No session → welcome; a running deletion → the calm
// "being deleted" screen; no consent → consent; no profile → profile; otherwise Buddy.
// Decided from the API, not guessed (lib/gate.ts). The language follows the profile from
// the root layout, wherever the app was opened.

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { useMe } from '../lib/api/queries.js';
import { currentSession } from '../lib/auth/session.js';
import { messageFor } from '../lib/errors.js';
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
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title={messageFor(me.error)}
            action={
              <View style={{ gap: 10, alignItems: 'center' }}>
                <Btn onPress={() => void me.refetch()}>{t('actions.retry')}</Btn>
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
              </View>
            }
          />
        </View>
      </Screen>
    );
  }
  return <Redirect href={gateRoute(me.data)} />;
}
