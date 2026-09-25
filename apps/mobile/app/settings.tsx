// Settings. Sources: docs/architecture.md §API (GET/PATCH /buddy/settings,
// PATCH /learner, PUT /account/pin, GET /account/export, POST/DELETE
// /account/deletion), §Delivery (contact rules) and docs/privacy.md (PIN
// gate, export, deletion); sign-in details go to Supabase Auth directly
// (components/settings/AccountAccessCard.tsx). Written for learners of about 12–18: plain
// questions, short sentences, one action per row. The parents' area is set
// apart; for a minor, more contact and account data go through the parents'
// PIN (lib/adminFlow.ts). Everything shown is what the API returned.

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { AboutSection } from '../components/settings/AboutSection.js';
import { AdultSection } from '../components/settings/AdultSection.js';
import { ContactSection } from '../components/settings/ContactSection.js';
import { ProfileSection } from '../components/settings/ProfileSection.js';
import { useRevealInput } from '../components/settings/useRevealInput.js';
import { useHome, useMe, useSettings } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';

export default function SettingsScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const settings = useSettings();
  const me = useMe();
  const home = useHome();
  const { scroll, content, reveal } = useRevealInput();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([settings.refetch(), me.refetch(), home.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  const title = t('settings:title');
  const loadError = (!settings.data && settings.error) || (!me.data && me.error) || null;

  if (loadError) {
    return (
      <Screen back title={title}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title={messageFor(loadError)}
            action={
              <Btn center onPress={() => void refresh()}>
                {t('common:actions.retry')}
              </Btn>
            }
          />
        </View>
      </Screen>
    );
  }
  if (!settings.data || !me.data) {
    return (
      <Screen back title={title}>
        <LoadingState label={t('common:loading')} />
      </Screen>
    );
  }

  const { account, learner } = me.data;
  // Without an account or profile there is nothing to set here; the start screen routes on.
  if (!account || !learner) return <Redirect href="/" />;

  return (
    <Screen back title={title}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
          }
        >
          <View ref={content} style={{ gap: 32 }}>
            <ContactSection
              settings={settings.data}
              isMinor={learner.is_minor}
              pinSet={account.pin_set}
              push={home.data?.system.push ?? null}
            />
            <AdultSection account={account} learner={learner} onInputFocus={reveal} />
            <ProfileSection learner={learner} />
            <AboutSection />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
