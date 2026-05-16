// Admin unlock. Doc 05 §Admin surface §Unlock.
//
// On mount we reset the admin_unlocked flag (so every modal re-entry forces
// re-auth) and, if biometric is set up, fire the prompt automatically. The
// PIN pad is always shown below. Five wrong PIN entries within five minutes
// triggers a 15-minute lock — biometric stays usable during the lockout.
// "Passwort verwenden" jumps to /login so the user can fall back to their
// account password (per Doc 05 §Unlock).

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, PinPad } from '../../components/lb/index.js';
import {
  authenticateBiometric,
  hasBiometricHardware,
  isBiometricEnabled,
  pinLockedUntil,
  recordPinFailure,
  verifyPin,
} from '../../lib/auth/pin.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

const LOCK_THRESHOLD = 5;

export default function AdminUnlockScreen() {
  const { t } = useTranslation('auth');
  const setAdminUnlocked = useAppStore((s) => s.set_admin_unlocked);
  const [biometricReady, setBiometricReady] = useState(false);
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const biometricFiredRef = useRef(false);

  // Reset the unlocked flag every time this screen mounts.
  useEffect(() => {
    setAdminUnlocked(false);
  }, [setAdminUnlocked]);

  // Determine biometric availability + persisted lockout once.
  useEffect(() => {
    (async () => {
      const hw = await hasBiometricHardware();
      const pref = await isBiometricEnabled();
      const ready = hw && pref;
      setBiometricReady(ready);
      setLockedUntil(await pinLockedUntil());

      if (ready && !biometricFiredRef.current) {
        biometricFiredRef.current = true;
        const ok = await authenticateBiometric(t('unlock.title'));
        if (ok) {
          setAdminUnlocked(true);
          router.replace('/(admin)/overview');
        }
      }
    })();
  }, [setAdminUnlocked, t]);

  // Tick the lockout countdown.
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      if (Date.now() >= lockedUntil) {
        setLockedUntil(0);
        setFailures(0);
        clearInterval(id);
      } else {
        setLockedUntil((v) => v); // force re-render so the countdown text refreshes
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function onPinComplete(pin: string) {
    if (lockedUntil && Date.now() < lockedUntil) return;
    const ok = await verifyPin(pin);
    if (ok) {
      setAdminUnlocked(true);
      router.replace('/(admin)/overview');
      return;
    }
    const newLocked = await recordPinFailure();
    const nextFailures = failures + 1;
    setFailures(nextFailures);
    setResetKey((k) => k + 1);
    if (newLocked) {
      setLockedUntil(newLocked);
      setError(null);
    } else {
      const remaining = Math.max(0, LOCK_THRESHOLD - nextFailures);
      setError(t('unlock.wrong_pin', { remaining }));
    }
  }

  async function onBiometricPress() {
    const ok = await authenticateBiometric(t('unlock.title'));
    if (ok) {
      setAdminUnlocked(true);
      router.replace('/(admin)/overview');
    }
  }

  const locked = lockedUntil > 0 && Date.now() < lockedUntil;
  const lockMinutes = locked ? Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000)) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 28,
          paddingVertical: 32,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ alignItems: 'center', gap: 12, marginTop: 24 }}>
          <Text style={{ fontSize: 56 }}>🔒</Text>
          <Text
            style={{
              fontSize: 22,
              fontWeight: '600',
              color: LB.ink,
              textAlign: 'center',
              letterSpacing: -0.4,
            }}
          >
            {t('unlock.title')}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: LB.ink2,
              textAlign: 'center',
              lineHeight: 19,
              maxWidth: 280,
            }}
          >
            {biometricReady ? t('unlock.subtitle_biometric') : t('unlock.subtitle_pin')}
          </Text>
          {locked && (
            <Text
              style={{
                color: LB.danger ?? '#c0392b',
                fontSize: 12,
                textAlign: 'center',
                marginTop: 8,
                maxWidth: 280,
              }}
            >
              {t('unlock.locked', { minutes: lockMinutes })}
            </Text>
          )}
          {!locked && error && (
            <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12, marginTop: 8 }}>
              {error}
            </Text>
          )}
        </View>

        <PinPad
          resetKey={resetKey}
          onComplete={(pin) => {
            void onPinComplete(pin);
          }}
          disabled={locked}
        />

        <View style={{ width: '100%', gap: 10 }}>
          {biometricReady && (
            <Btn
              size="lg"
              full
              variant="outline"
              onPress={() => {
                void onBiometricPress();
              }}
            >
              {t('unlock.biometric_cta')}
            </Btn>
          )}
          <Pressable onPress={() => router.replace('/login')} hitSlop={12}>
            <Text
              style={{
                color: LB.ink2,
                fontSize: 12,
                textAlign: 'center',
                textDecorationLine: 'underline',
                paddingVertical: 6,
              }}
            >
              {t('unlock.password_fallback')}
            </Text>
          </Pressable>
          <Btn size="lg" full variant="ghost" onPress={() => router.back()}>
            {t('unlock.cancel')}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}
