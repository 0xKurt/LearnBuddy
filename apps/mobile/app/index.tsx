// Where does this person belong? No session → welcome; no consent → consent;
// no profile → profile; otherwise Buddy. Decided from the API, not guessed.

import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { useMe } from '../lib/api/queries.js';
import { currentSession } from '../lib/auth/session.js';
import { messageFor } from '../lib/errors.js';
import { applyLocale } from '../lib/i18n/index.js';
import { EmptyState } from '../components/lb/EmptyState.js';

export default function Index() {
  const signedIn = currentSession() !== null;
  if (!signedIn) return <Redirect href="/welcome" />;
  return <SignedInGate />;
}

function SignedInGate() {
  const { t } = useTranslation('common');
  const me = useMe();
  const learnerLocale = me.data?.learner?.locale;
  useEffect(() => {
    if (learnerLocale) applyLocale(learnerLocale);
  }, [learnerLocale]);

  if (me.isPending) return <LoadingState label={t('loading')} />;
  if (me.isError) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title={messageFor(me.error)}
            action={<Btn onPress={() => void me.refetch()}>{t('actions.retry')}</Btn>}
          />
        </View>
      </Screen>
    );
  }
  const { account, learner } = me.data;
  if (!account || !account.consent_current) return <Redirect href="/consent" />;
  if (!learner) return <Redirect href="/profile" />;
  return <Redirect href="/buddy" />;
}
