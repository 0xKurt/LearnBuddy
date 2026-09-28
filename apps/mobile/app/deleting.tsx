// The account is being deleted (the 7-day hold is over, or the API answered 409
// deletion_running): nothing can be changed any more, so the app says so calmly and
// offers the one thing left to do — signing out. Once the deletion is done the session
// ends by itself and the start screen follows (docs/privacy.md §Export and deletion).

import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Screen } from '../components/lb/Screen.js';
import { signOutHere } from '../lib/leave.js';

export default function Deleting() {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (busy) return;
    setBusy(true);
    try {
      await signOutHere();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          orb
          title={t('deleting.title')}
          body={t('deleting.body')}
          action={
            <Btn pill busy={busy} onPress={() => void leave()}>
              {t('deleting.sign_out')}
            </Btn>
          }
        />
      </View>
    </Screen>
  );
}
