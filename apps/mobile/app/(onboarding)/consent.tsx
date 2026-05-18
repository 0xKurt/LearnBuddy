// Consent was collected in welcome.tsx (signup tab checkboxes). This screen
// records it server-side and immediately redirects to add-profile. It is
// reached from index.tsx when account.consent is null after email verification.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { recordConsent } from '../../lib/api/auth.js';
import { ENV } from '../../lib/env.js';
import { LB } from '../../lib/theme/colors.js';

export default function ConsentScreen() {
  const { t } = useTranslation('onboarding');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await recordConsent({ accepted: true, version: ENV.DSGVO_CONSENT_VERSION });
      router.replace('/(onboarding)/add-profile' as never);
    } catch {
      setError(t('consent.error_generic'));
      setBusy(false);
    }
  }

  useEffect(() => {
    void submit();
  }, []);

  if (busy) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: LB.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={LB.ink2} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: LB.paper, padding: 28, justifyContent: 'center' }}
    >
      {error && (
        <Text style={{ color: LB.danger, fontSize: 13, marginBottom: 20, textAlign: 'center' }}>
          {error}
        </Text>
      )}
      <View style={{ paddingHorizontal: 4 }}>
        <Btn size="lg" full variant="primary" onPress={() => void submit()}>
          {t('consent.retry')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
