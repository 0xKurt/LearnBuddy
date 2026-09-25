// The adult's PIN (modal). Opens a 10-minute admin session in memory.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
      <View
        style={{ flex: 1, padding: 24, gap: 20, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t('pin.title')}
        </Text>
        <Text style={[TYPE.body, { textAlign: 'center' }]}>{t('pin.body')}</Text>
        {error ? (
          <Text
            accessibilityLiveRegion="assertive"
            style={[TYPE.body, { color: LB.danger, textAlign: 'center' }]}
          >
            {error}
          </Text>
        ) : null}
        <PinPad onComplete={(pin) => void submit(pin)} resetKey={attempt} disabled={busy} />
        <Btn variant="ghost" center onPress={() => router.back()}>
          {t('pin.cancel')}
        </Btn>
      </View>
    </Screen>
  );
}
