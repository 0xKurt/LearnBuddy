// Consent to the current privacy text (its version comes from the API).
// Declining is a real choice: "Nicht einverstanden" signs out (H-22). When the
// text changed for an account with a minor's profile, agreeing again is the
// parents' decision: the API asks for their PIN, and the PIN screen opens.

import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckPoints } from '../components/auth/CheckPoints.js';
import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { LoadingState } from '../components/lb/LoadingState.js';
import { Screen } from '../components/lb/Screen.js';
import { toast } from '../components/lb/Toast.js';
import { asAdultIfNeeded, toastAdultFailure } from '../components/settings/adultGate.js';
import { ApiError } from '../lib/api/client.js';
import { createAccount, getMe, selfConsent } from '../lib/api/endpoints.js';
import { keys, queryClient, useMe } from '../lib/api/queries.js';
import { ENV, legalGap } from '../lib/env.js';
import { messageFor } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { signOutHere } from '../lib/leave.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { CARD_PAD, GUTTER, pinnedBar, RHYTHM, SPACE } from '../lib/theme/space.js';

const POINTS = [
  'point_data',
  'point_photos',
  'point_ai',
  'point_voice',
  'point_contact',
  'point_control',
] as const;

export default function Consent() {
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
  const me = useMe();
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  if (me.isPending) return <LoadingState />;
  // She has turned 16: the parents' consent carried her until now, from here it is hers
  // (issue #31). Same text, other words around it — and no adult in the way.
  const forHerself = me.data?.learner?.own_consent_due === true;

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
      if (forHerself) {
        // Hers to give: no PIN, no adult — that is the whole point of turning 16.
        await selfConsent(version);
      } else {
        await asAdultIfNeeded(() => createAccount(currentLocale(), version), {
          pinSet: me.data.account?.pin_set ?? false,
          purpose: 'consent',
        });
      }
      // Load the fresh state before routing, so the gate never decides on stale data.
      await queryClient.fetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 0 });
      router.replace('/');
    } catch (err) {
      toastAdultFailure(err, t('consent.parents_needed'));
      // The text changed meanwhile: load its version, so the next tap agrees to the
      // current one instead of sending the old one again (p2-consent-outdated-toast-loop).
      if (err instanceof ApiError && err.reason === 'consent_outdated') void me.refetch();
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
        contentContainerStyle={{
          paddingHorizontal: GUTTER,
          paddingVertical: SPACE.md,
          gap: SPACE.md,
        }}
      >
        <View style={{ gap: SPACE.sm }}>
          <Text accessibilityRole="header" style={TYPE.display}>
            {t(forHerself ? 'consent.own_title' : 'consent.title')}
          </Text>
          <Text style={[TYPE.body, { color: palette.ink2 }]}>
            {t(forHerself ? 'consent.own_intro' : 'consent.intro')}
          </Text>
        </View>
        {/* Six points; in German they fit a small phone (360×740) without scrolling. */}
        <CheckPoints compact points={POINTS.map((p) => t(`consent.${p}`))} />
        {ENV.PRIVACY_URL ? (
          <Btn variant="ghost" pill onPress={() => void Linking.openURL(ENV.PRIVACY_URL)}>
            {t('consent.full_policy')}
          </Btn>
        ) : null}
        {/* An internal test build may start without the legal pages (issue #130, `lib/env.ts`),
            but it may not look complete while doing so — a missing link is INVISIBLE, and that
            invisibility was the bug the rule was written against. So the gap says itself, on
            the very screen where the link would have been. Never in a store build: `legalGap`
            is false there, because such a build does not start at all without the URLs. */}
        {legalGap ? (
          <Text
            accessibilityRole="alert"
            style={[
              TYPE.small,
              { color: palette.ink2, textAlign: 'center', paddingHorizontal: SPACE.xl },
            ]}
          >
            {t('consent.internal_build')}
          </Text>
        ) : null}
      </ScrollView>
      {/* The agreement sits with its button: both always on screen. */}
      <View style={[pinnedBar(insets.bottom), { gap: RHYTHM.parts }]}>
        <Card tone="lavender" padding={CARD_PAD.snug}>
          <Checkbox
            checked={accepted}
            onChange={setAccepted}
            label={t(forHerself ? 'consent.own_accept' : 'consent.accept')}
          />
        </Card>
        <Btn size="lg" pill full busy={busy} disabled={!accepted} onPress={() => void accept()}>
          {t('consent.cta')}
        </Btn>
        <Btn variant="ghost" size="sm" pill center disabled={busy} onPress={() => void decline()}>
          {t('consent.decline')}
        </Btn>
      </View>
    </Screen>
  );
}
