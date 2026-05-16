// Language picker — first cold-launch screen. Doc 05 §i18n.
//
// Single tap on a row picks + persists + navigates. No separate confirm
// step — five options are short enough that a confirm button was just one
// more click of confusion. The same picker is reused (with a "stay" mode)
// in (admin)/account-settings.

import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { devResetAll } from '../../lib/dev/reset.js';
import { setLocale, i18n } from '../../lib/i18n/index.js';
import {
  LOCALE_FLAGS,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  detectDeviceLocale,
  type AppLocale,
} from '../../lib/i18n/locale-storage.js';
import { LB } from '../../lib/theme/colors.js';

// Hard-coded localized titles for THIS screen so it reads in the device
// language until the user picks one (no i18n round-trip needed).
const LABELS: Record<AppLocale, { title: string; subtitle: string }> = {
  de: { title: 'Sprache', subtitle: 'Tippe zum Auswählen.' },
  en: { title: 'Language', subtitle: 'Tap to pick.' },
  fr: { title: 'Langue', subtitle: 'Touche pour choisir.' },
  es: { title: 'Idioma', subtitle: 'Toca para elegir.' },
  it: { title: 'Lingua', subtitle: 'Tocca per scegliere.' },
};

export default function LanguageScreen() {
  const current = (i18n.language as AppLocale) || detectDeviceLocale();
  const labels = LABELS[current];

  const onPick = (code: AppLocale) => {
    setLocale(code).catch((err) => {
      console.warn('[language] setLocale failed', err);
    });
    router.replace('/(onboarding)/welcome');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 14, color: LB.ink3, fontWeight: '500', letterSpacing: 0.5 }}>
            LEARNBUDDY
          </Text>
          {__DEV__ && (
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Dev reset',
                  'Clear local state (locale, session, pin, notifications)?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Wipe',
                      style: 'destructive',
                      onPress: async () => {
                        await devResetAll();
                        Alert.alert('Done', 'Shake → Reload in Expo Go to start fresh.');
                      },
                    },
                  ],
                );
              }}
              hitSlop={10}
              style={{
                backgroundColor: '#d1361c',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                DEV · RESET
              </Text>
            </Pressable>
          )}
        </View>
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

        <ScrollView contentContainerStyle={{ gap: 10, paddingTop: 24, paddingBottom: 24 }}>
          {SUPPORTED_LOCALES.map((code) => (
            <Pressable
              key={code}
              onPress={() => onPick(code)}
              style={({ pressed }) => ({
                paddingHorizontal: 18,
                paddingVertical: 18,
                borderRadius: 16,
                backgroundColor: pressed ? LB.primaryLt : '#fff',
                borderColor: current === code ? LB.primaryDk : LB.hairline,
                borderWidth: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 28 }}>{LOCALE_FLAGS[code]}</Text>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '600',
                    color: LB.ink,
                  }}
                >
                  {LOCALE_LABELS[code]}
                </Text>
              </View>
              <Text style={{ fontSize: 18, color: LB.ink3 }}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
