// Consent to the current privacy text (its version comes from the API).

import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import { createAccount, getMe } from '../lib/api/endpoints.js';
import { keys, queryClient, useMe } from '../lib/api/queries.js';
import { ENV } from '../lib/env.js';
import { messageFor } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

const POINTS = [
  'point_data',
  'point_photos',
  'point_ai',
  'point_contact',
  'point_control',
] as const;

export default function Consent() {
  const { t } = useTranslation('auth');
  const me = useMe();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (me.isPending) return <LoadingState />;

  async function accept() {
    if (!me.data) return;
    setBusy(true);
    try {
      await createAccount(currentLocale(), me.data.consent_version);
      // Load the fresh state before routing, so the gate never decides on stale data.
      await queryClient.fetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 0 });
      router.replace('/');
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text accessibilityRole="header" style={TYPE.display}>
          {t('consent.title')}
        </Text>
        <Text style={TYPE.body}>{t('consent.intro')}</Text>
        <Card>
          <View style={{ gap: 12 }}>
            {POINTS.map((p) => (
              <Text key={p} style={TYPE.body}>
                • {t(`consent.${p}`)}
              </Text>
            ))}
          </View>
        </Card>
        {ENV.PRIVACY_URL ? (
          <Btn variant="ghost" onPress={() => void Linking.openURL(ENV.PRIVACY_URL)}>
            {t('consent.full_policy')}
          </Btn>
        ) : null}
        <Checkbox checked={accepted} onChange={setAccepted} label={t('consent.accept')} />
      </ScrollView>
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: LB.hairline,
          backgroundColor: LB.paper,
        }}
      >
        <Btn size="lg" full disabled={!accepted || busy} onPress={() => void accept()}>
          {t('consent.cta')}
        </Btn>
      </View>
    </Screen>
  );
}
