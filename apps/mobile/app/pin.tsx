// The adult's PIN (modal). Opens a short admin session in memory for the one
// step it names (lib/adminFlow.ts purpose), so the parents see what they approve.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { PinPad } from '../components/lb/PinPad.js';
import { Screen } from '../components/lb/Screen.js';
import { clearAdminToken } from '../lib/admin.js';
import { finishAdmin, pendingAdminDetail, pendingAdminPurpose } from '../lib/adminFlow.js';
import { useAnnounce } from '../lib/announce.js';
import { ApiError } from '../lib/api/client.js';
import { openAdminSession } from '../lib/api/endpoints.js';
import { messageFor } from '../lib/errors.js';
import { formatTime } from '../lib/time.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

export default function Pin() {
  const { t, i18n } = useTranslation('auth');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);
  const inFlight = useRef(false);
  // Fixed when the screen opens: what the parents are asked to approve.
  const [purpose] = useState(pendingAdminPurpose);
  const [detail] = useState(pendingAdminDetail);

  // Leaving the screen any other way counts as "cancelled".
  useEffect(
    () => () => {
      if (!done.current) finishAdmin(false);
    },
    [],
  );

  async function submit(pin: string) {
    if (inFlight.current || done.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await openAdminSession(pin);
      done.current = true;
      // Nobody waiting (e.g. a pad left over from a double tap): keep no token.
      if (!finishAdmin(true)) clearAdminToken();
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'wrong_pin') setError(t('pin.wrong'));
      else if (err instanceof ApiError && err.code === 'pin_locked') {
        const until = err.details?.until;
        setError(
          typeof until === 'string'
            ? t('pin.locked_until', { time: formatTime(until, i18n.language) })
            : t('pin.locked'),
        );
      } else if (err instanceof ApiError && err.reason === 'pin_not_set')
        setError(t('pin.not_set'));
      else setError(messageFor(err));
      setAttempt((a) => a + 1);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // VoiceOver hears the error too, again after each wrong attempt (audit M-80).
  useAnnounce(error, { key: attempt, liveRegion: false });

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
            {detail ?? (purpose ? t(`pin.purpose.${purpose}`) : t('pin.body'))}
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
        {/* Opening the parents' area: a forgotten PIN is set anew with the account's
            password there (components/settings/PinCard.tsx). */}
        {purpose === 'parents' ? (
          <Btn
            variant="ghost"
            pill
            center
            onPress={() => {
              done.current = true;
              finishAdmin(false, true);
              router.back();
            }}
          >
            {t('pin.forgot')}
          </Btn>
        ) : null}
        <Btn variant="ghost" pill center onPress={() => router.back()}>
          {t('pin.cancel')}
        </Btn>
      </ScrollView>
    </Screen>
  );
}
