// The adult's PIN (modal). Opens a 10-minute admin session in memory.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { PinPad } from '../components/lb/PinPad.js';
import { Screen } from '../components/lb/Screen.js';
import { finishAdmin } from '../lib/adminFlow.js';
import { ApiError } from '../lib/api/client.js';
import { openAdminSession } from '../lib/api/endpoints.js';
import { messageFor } from '../lib/errors.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

export default function Pin() {
  const { t } = useTranslation('auth');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  // Leaving the screen any other way counts as "cancelled".
  useEffect(
    () => () => {
      if (!done.current) finishAdmin(false);
    },
    [],
  );

  async function submit(pin: string) {
    setBusy(true);
    try {
      await openAdminSession(pin);
      done.current = true;
      finishAdmin(true);
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'wrong_pin') setError(t('pin.wrong'));
      else if (err instanceof ApiError && err.code === 'pin_locked') setError(t('pin.locked'));
      else if (err instanceof ApiError && err.reason === 'pin_not_set') setError(t('pin.not_set'));
      else setError(messageFor(err));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingVertical: 24,
          gap: 18,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BuddyOrb size={64} />
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
            {t('pin.title')}
          </Text>
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', maxWidth: 360 }]}>
            {t('pin.body')}
          </Text>
        </View>
        {error ? (
          <View
            accessibilityLiveRegion="assertive"
            style={{
              backgroundColor: LB.blush,
              borderRadius: 18,
              paddingHorizontal: 16,
              paddingVertical: 10,
              maxWidth: 360,
            }}
          >
            <Text style={[TYPE.body, { color: LB.ink, textAlign: 'center' }]}>{error}</Text>
          </View>
        ) : null}
        <View style={{ marginTop: 4 }}>
          <PinPad onComplete={(pin) => void submit(pin)} resetKey={attempt} disabled={busy} />
        </View>
        <Btn variant="ghost" pill center onPress={() => router.back()}>
          {t('pin.cancel')}
        </Btn>
      </ScrollView>
    </Screen>
  );
}
