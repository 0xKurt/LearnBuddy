// Consent to the current privacy text (its version comes from the API).

import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { Icon } from '../components/lb/Icon.js';
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
  'point_voice',
  'point_contact',
  'point_control',
] as const;

export default function Consent() {
  const { t } = useTranslation('auth');
  const me = useMe();
  const insets = useSafeAreaInsets();
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={TYPE.display}>
            {t('consent.title')}
          </Text>
          <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('consent.intro')}</Text>
        </View>
        <Card padding={20}>
          <View style={{ gap: 14 }}>
            {POINTS.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    marginTop: -1,
                    backgroundColor: LB.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={15} color={LB.primaryDk} />
                </View>
                <Text style={[TYPE.body, { flex: 1 }]}>{t(`consent.${p}`)}</Text>
              </View>
            ))}
          </View>
        </Card>
        {ENV.PRIVACY_URL ? (
          <Btn variant="ghost" pill onPress={() => void Linking.openURL(ENV.PRIVACY_URL)}>
            {t('consent.full_policy')}
          </Btn>
        ) : null}
        <Card tone="lavender" padding={14}>
          <Checkbox checked={accepted} onChange={setAccepted} label={t('consent.accept')} />
        </Card>
      </ScrollView>
      <View
        style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Btn size="lg" pill full disabled={!accepted || busy} onPress={() => void accept()}>
          {t('consent.cta')}
        </Btn>
      </View>
    </Screen>
  );
}
