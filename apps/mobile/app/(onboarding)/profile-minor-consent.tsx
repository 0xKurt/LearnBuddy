// Minor-profile consent + POST. Doc 04 §POST /learners + Doc 05 §9.
//
// Reads the profile draft from the store (set by add-profile when birth_year
// places the profile under 16), shows the explicit-consent copy with the
// profile's name, and on accept calls createLearner with the version pinned
// from ENV.DSGVO_CONSENT_VERSION. Server-side this writes the consent
// version + accepted_at alongside the learner row.

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Icon } from '../../components/lb/index.js';
import { ApiError } from '../../lib/api/client.js';
import { createLearner } from '../../lib/api/learners.js';
import { ENV } from '../../lib/env.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function MinorConsentScreen() {
  const { t } = useTranslation('onboarding');
  const draft = useAppStore((s) => s.pending_profile_draft);
  const setDraft = useAppStore((s) => s.set_pending_profile_draft);
  const setActiveLearner = useAppStore((s) => s.set_active_learner);

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return <Redirect href="/(onboarding)/add-profile?for=child" />;
  }

  const canSubmit = accepted && !busy;

  async function onSubmit() {
    if (!canSubmit || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const learner = await createLearner({
        ...draft,
        minor_consent_version: ENV.DSGVO_CONSENT_VERSION,
      });
      setActiveLearner(learner.id);
      setDraft(null);
      router.replace('/(onboarding)/pin-setup');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'learner_already_exists') {
        setError(t('minor_consent.error_already'));
      } else if (e instanceof ApiError && e.code === 'validation_failed') {
        setError(t('minor_consent.error_validation'));
      } else {
        setError(t('minor_consent.error_generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          paddingVertical: 32,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.5,
            }}
          >
            {t('minor_consent.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('minor_consent.body', { name: draft.display_name })}
          </Text>

          <Pressable
            onPress={() => setAccepted((v) => !v)}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              marginTop: 18,
            }}
            disabled={busy}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: accepted ? LB.primary : LB.ink4,
                backgroundColor: accepted ? LB.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {accepted && <Icon name="check" size={16} color="#fff" />}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: LB.ink, lineHeight: 19 }}>
              {t('minor_consent.checkbox')}
            </Text>
          </Pressable>

          {error && (
            <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12, marginTop: 6 }}>
              {error}
            </Text>
          )}
        </View>

        <Btn size="lg" full variant="primary" onPress={onSubmit}>
          {busy ? t('minor_consent.saving') : t('minor_consent.cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
