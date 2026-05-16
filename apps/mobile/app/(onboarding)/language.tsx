// Language picker — first cold-launch screen. Doc 05 §i18n.
//
// Lists the five supported app languages and persists the choice in
// SecureStore (lib/i18n/locale-storage.ts). After confirming, the user
// drops into the welcome screen in the freshly-set language. The same
// picker is reused in (admin)/account-settings → "Sprache" later.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { setLocale, i18n } from '../../lib/i18n/index.js';
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  detectDeviceLocale,
  type AppLocale,
} from '../../lib/i18n/locale-storage.js';
import { LB } from '../../lib/theme/colors.js';

// Hard-coded localized titles for THIS screen so it works before the user
// has made a choice. (We can't t() something the user hasn't chosen a lang
// for yet — well, we can, but the heading lands in whichever device locale,
// which may not be one the user reads at all.)
const LABELS: Record<AppLocale, { title: string; subtitle: string; cta: string }> = {
  de: {
    title: 'Sprache wählen',
    subtitle: 'Du kannst das später jederzeit ändern.',
    cta: 'Weiter',
  },
  en: { title: 'Choose language', subtitle: 'You can change this anytime.', cta: 'Continue' },
  fr: { title: 'Choisis la langue', subtitle: 'Tu peux changer plus tard.', cta: 'Continuer' },
  es: { title: 'Elige idioma', subtitle: 'Puedes cambiarlo más tarde.', cta: 'Continuar' },
  it: { title: 'Scegli la lingua', subtitle: 'Puoi cambiarla in seguito.', cta: 'Continua' },
};

export default function LanguageScreen() {
  const [selected, setSelected] = useState<AppLocale>(
    (i18n.language as AppLocale) || detectDeviceLocale(),
  );
  const labels = LABELS[selected];

  const onConfirm = () => {
    // Persist in the background — SecureStore writes can be slow on cold
    // start and we don't want the user staring at a frozen button while
    // they land. Navigation happens immediately.
    setLocale(selected).catch((err) => {
      console.warn('[language] setLocale failed', err);
    });
    router.replace('/(onboarding)/welcome');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 }}>
        <Text style={{ fontSize: 14, color: LB.ink3, fontWeight: '500', letterSpacing: 0.5 }}>
          LEARNBUDDY
        </Text>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '600',
            color: LB.ink,
            letterSpacing: -0.6,
            marginTop: 12,
          }}
        >
          {labels.title}
        </Text>
        <Text style={{ fontSize: 14, color: LB.ink2, marginTop: 8, lineHeight: 20 }}>
          {labels.subtitle}
        </Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingTop: 24 }}>
          {SUPPORTED_LOCALES.map((code) => (
            <Pressable
              key={code}
              onPress={() => setSelected(code)}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderRadius: 16,
                backgroundColor: selected === code ? LB.primaryLt : '#fff',
                borderColor: selected === code ? LB.primaryDk : LB.hairline,
                borderWidth: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: selected === code ? LB.primaryDk : LB.ink,
                }}
              >
                {LOCALE_LABELS[code]}
              </Text>
              <Text style={{ fontSize: 12, color: LB.ink3, textTransform: 'uppercase' }}>
                {code}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Btn size="lg" full onPress={onConfirm}>
          {labels.cta}
        </Btn>
      </View>
    </SafeAreaView>
  );
}
