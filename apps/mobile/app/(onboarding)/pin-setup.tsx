// PIN + biometric setup. Doc 05 §10 ("Mandatory — cannot be skipped").
//
// When Face ID / Touch ID hardware is enrolled, the user picks their method first:
//   A. Face ID only — authenticates immediately, no PIN needed, goes to hand-off.
//   B. PIN — 4-digit pad → confirm → done. Biometric is NOT re-offered (user said no).
//
// When no biometric hardware exists the method step is skipped and the old
// 3-step PIN + optional biometric offer runs as before.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, PinPad } from '../../components/lb/index.js';
import {
  authenticateBiometric,
  hasBiometricHardware,
  setBiometricEnabled,
  setPin,
} from '../../lib/auth/pin.js';
import { LB } from '../../lib/theme/colors.js';

type Phase = 'method' | 'choose' | 'confirm' | 'biometric';

export default function PinSetupScreen() {
  const { t } = useTranslation('onboarding');
  // null = still detecting hardware (avoids flash of wrong screen)
  const [phase, setPhase] = useState<Phase | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    void (async () => {
      const avail = await hasBiometricHardware();
      setBiometricAvailable(avail);
      setPhase(avail ? 'method' : 'choose');
    })();
  }, []);

  // User chose Face ID as their only method.
  async function onBiometricSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await authenticateBiometric(t('pin.biometric_offer'), t('common:actions.cancel'));
      if (ok) {
        await setBiometricEnabled(true);
        router.replace('/(onboarding)/hand-off');
      } else {
        setError(t('pin.biometric_failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  // User chose PIN; they already said no to biometric so skip that offer later.
  function onPickPin() {
    setError(null);
    setPhase('choose');
  }

  async function finalize(enableBiometric: boolean) {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      await setPin(chosen);
      if (enableBiometric) {
        const ok = await authenticateBiometric(
          t('pin.biometric_offer'),
          t('common:actions.cancel'),
        );
        await setBiometricEnabled(ok);
      } else {
        await setBiometricEnabled(false);
      }
      router.replace('/(onboarding)/hand-off');
    } finally {
      setBusy(false);
    }
  }

  function onChoosePin(pin: string) {
    setChosen(pin);
    setError(null);
    setPhase('confirm');
    setResetKey((k) => k + 1);
  }

  function onConfirmPin(pin: string) {
    if (pin !== chosen) {
      setError(t('pin.mismatch'));
      setChosen(null);
      setPhase('choose');
      setResetKey((k) => k + 1);
      return;
    }
    setError(null);
    // Only offer biometric here when hardware exists AND user didn't already
    // see the method screen (where they picked PIN, meaning they declined biometric).
    if (biometricAvailable) {
      setPhase('biometric');
    } else {
      void finalize(false);
    }
  }

  if (phase === null) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: LB.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={LB.ink2} accessibilityLabel={t('pin.detecting')} />
      </SafeAreaView>
    );
  }

  const title =
    phase === 'method'
      ? t('pin.method_title')
      : phase === 'biometric'
        ? t('pin.biometric_offer')
        : phase === 'confirm'
          ? t('pin.confirm_title')
          : t('pin.title');

  const subtitle =
    phase === 'method'
      ? t('pin.method_subtitle')
      : phase === 'biometric'
        ? ''
        : phase === 'confirm'
          ? t('pin.confirm_subtitle')
          : t('pin.subtitle');

  const glyph = phase === 'method' ? '🔐' : '🔒';

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
        <View style={{ gap: 16, marginTop: 24 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: LB.primaryLt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 32 }}>{glyph}</Text>
          </View>
          <Text
            style={{
              fontSize: 26,
              fontWeight: '600',
              color: LB.ink,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>{subtitle}</Text>
          )}
          {!!error && <Text style={{ color: LB.danger ?? '#c0392b', fontSize: 12 }}>{error}</Text>}
        </View>

        {phase === 'method' ? (
          <View style={{ gap: 10 }}>
            <Btn
              size="lg"
              full
              variant="primary"
              onPress={() => {
                void onBiometricSetup();
              }}
              disabled={busy}
            >
              {busy ? t('pin.saving') : t('pin.method_biometric')}
            </Btn>
            <Btn size="lg" full variant="ghost" onPress={onPickPin}>
              {t('pin.method_pin')}
            </Btn>
          </View>
        ) : phase === 'biometric' ? (
          <View style={{ gap: 10 }}>
            <Btn
              size="lg"
              full
              variant="primary"
              onPress={() => {
                void finalize(true);
              }}
            >
              {busy ? t('pin.saving') : t('pin.biometric_yes')}
            </Btn>
            <Btn
              size="lg"
              full
              variant="ghost"
              onPress={() => {
                void finalize(false);
              }}
            >
              {t('pin.biometric_no')}
            </Btn>
          </View>
        ) : (
          <PinPad
            resetKey={resetKey + (phase === 'confirm' ? 1000 : 0)}
            onComplete={phase === 'choose' ? onChoosePin : onConfirmPin}
            disabled={busy}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
