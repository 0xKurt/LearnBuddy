// PIN + biometric setup. Doc 05 §10 ("Mandatory — cannot be skipped").
//
// Three-step flow:
//   1. Choose PIN — 4-digit pad.
//   2. Confirm PIN — same 4 digits. Mismatch → restart from step 1.
//   3. If biometric hardware exists, offer to enable. Either way the PIN is
//      persisted and we forward to /(onboarding)/hand-off.

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, PinPad } from '../../components/lb/index.js';
import {
  authenticateBiometric,
  hasBiometricHardware,
  setBiometricEnabled,
  setPin,
} from '../../lib/auth/pin.js';
import { LB } from '../../lib/theme/colors.js';

type Phase = 'choose' | 'confirm' | 'biometric';

export default function PinSetupScreen() {
  const { t } = useTranslation('onboarding');
  const [phase, setPhase] = useState<Phase>('choose');
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    hasBiometricHardware().then(setBiometricAvailable);
  }, []);

  async function finalize(enableBiometric: boolean) {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      await setPin(chosen);
      if (enableBiometric) {
        const ok = await authenticateBiometric(t('pin.biometric_offer'));
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
    if (biometricAvailable) {
      setPhase('biometric');
    } else {
      void finalize(false);
    }
  }

  const title =
    phase === 'biometric'
      ? t('pin.biometric_offer')
      : phase === 'confirm'
        ? t('pin.confirm_title')
        : t('pin.title');
  const subtitle =
    phase === 'biometric'
      ? ''
      : phase === 'confirm'
        ? t('pin.confirm_subtitle')
        : t('pin.subtitle');

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
            <Text style={{ fontSize: 32 }}>🔒</Text>
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

        {phase === 'biometric' ? (
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
