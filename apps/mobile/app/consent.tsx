// Consent to the current privacy text (its version comes from the API).
// Declining is a real choice: "Nicht einverstanden" signs out (H-22). When the
// text changed for an account with a minor's profile, agreeing again is the
// parents' decision: the API asks for their PIN, and the PIN screen opens.

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
import { AdultCancelled, asAdultIfNeeded } from '../components/settings/adultGate.js';
import { ApiError } from '../lib/api/client.js';
import { createAccount, getMe } from '../lib/api/endpoints.js';
import { keys, queryClient, useMe } from '../lib/api/queries.js';
import { ENV } from '../lib/env.js';
import { messageFor } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { signOutHere } from '../lib/leave.js';
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
    if (busy) return;
    if (!me.data) {
      // The current text's version could not be loaded (offline, API unreachable): say so
      // and try again, never a silent tap (consent-cta-silent-noop).
      toast.show(messageFor(me.error), 'error');
      void me.refetch();
      return;
    }
    const version = me.data.consent_version;
    setBusy(true);
    try {
      await asAdultIfNeeded(() => createAccount(currentLocale(), version), {
        pinSet: me.data.account?.pin_set ?? false,
        purpose: 'consent',
      });
      // Load the fresh state before routing, so the gate never decides on stale data.
      await queryClient.fetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 0 });
      router.replace('/');
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') toast.show(t('consent.parents_needed'));
      } else {
        toast.show(messageFor(err), 'error');
        // The text changed meanwhile: load its version, so the next tap agrees to the
        // current one instead of sending the old one again (p2-consent-outdated-toast-loop).
        if (err instanceof ApiError && err.reason === 'consent_outdated') void me.refetch();
      }
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
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
      {/* The points are read, the decision is pinned below: in German all six fit a
          360×740 phone, in French and Spanish the longer sentences scroll a little
          (issue #76 — measured, not guessed). What matters never moves out of sight. */}
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}
      >
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={TYPE.display}>
            {t('consent.title')}
          </Text>
          <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('consent.intro')}</Text>
        </View>
        {/* Six points; in German they fit a small phone (360×740) without scrolling. */}
        <Card padding={14}>
          <View style={{ gap: 8 }}>
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
                <Text style={[TYPE.body, { flex: 1, fontSize: 14, lineHeight: 20 }]}>
                  {t(`consent.${p}`)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
        {ENV.PRIVACY_URL ? (
          <Btn variant="ghost" pill onPress={() => void Linking.openURL(ENV.PRIVACY_URL)}>
            {t('consent.full_policy')}
          </Btn>
        ) : null}
      </ScrollView>
      {/* The agreement sits with its button: both always on screen. */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16),
          gap: 10,
        }}
      >
        <Card tone="lavender" padding={14}>
          <Checkbox checked={accepted} onChange={setAccepted} label={t('consent.accept')} />
        </Card>
        <Btn size="lg" pill full disabled={!accepted || busy} onPress={() => void accept()}>
          {t('consent.cta')}
        </Btn>
        <Btn variant="ghost" size="sm" pill center disabled={busy} onPress={() => void decline()}>
          {t('consent.decline')}
        </Btn>
      </View>
    </Screen>
  );
}
