// Profile creation. Doc 04 §learners + doc 05 §8.
//
// Collects display_name, birth_year, grade_level, ui_locale, avatar, answer
// mode. For minor profiles (birth_year < now − 16) the user is routed first
// to `profile-minor-consent.tsx`, which captures the consent record before
// this screen submits POST /learners.

import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';
import { createLearner } from '../../lib/api/learners.js';
import { ApiError } from '../../lib/api/client.js';
import { ENV } from '../../lib/env.js';
import { useAppStore } from '../../lib/store/index.js';

type GradeOption = { value: number; label: string };
const GRADES: GradeOption[] = [
  { value: 1, label: 'Klasse 1' },
  { value: 2, label: 'Klasse 2' },
  { value: 3, label: 'Klasse 3' },
  { value: 4, label: 'Klasse 4' },
  { value: 5, label: 'Klasse 5' },
  { value: 6, label: 'Klasse 6' },
  { value: 7, label: 'Klasse 7' },
  { value: 8, label: 'Klasse 8' },
  { value: 9, label: 'Klasse 9' },
  { value: 10, label: 'Klasse 10' },
  { value: 11, label: 'Oberstufe 11' },
  { value: 12, label: 'Oberstufe 12' },
  { value: 13, label: 'Studium / Erwachsenenbildung' },
];

export default function AddProfileScreen() {
  const params = useLocalSearchParams<{ minorConsent?: string }>();
  const setActiveLearner = useAppStore((s) => s.set_active_learner);

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [grade, setGrade] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedYear = useMemo(() => {
    const n = Number.parseInt(birthYear, 10);
    return Number.isFinite(n) && n >= 1900 && n <= new Date().getUTCFullYear() ? n : null;
  }, [birthYear]);
  const ageThisYear = parsedYear ? new Date().getUTCFullYear() - parsedYear : null;
  const isMinor = ageThisYear !== null && ageThisYear < 16;

  const canSubmit = name.trim().length > 0 && parsedYear !== null && !busy;

  async function onContinue() {
    if (!canSubmit || parsedYear === null) return;
    if (isMinor && !params.minorConsent) {
      router.push('/(onboarding)/profile-minor-consent');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const learner = await createLearner({
        display_name: name.trim(),
        birth_year: parsedYear,
        grade_level: grade,
        ui_locale: 'de',
        avatar_id: 1,
        preferred_answer_mode: 'voice',
        minor_consent_version: isMinor ? ENV.DSGVO_CONSENT_VERSION : null,
      });
      setActiveLearner(learner.id);
      router.push('/(onboarding)/pin-setup');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'learner_already_exists') {
        setError('Auf diesem Konto gibt es schon ein Profil.');
      } else if (e instanceof ApiError && e.code === 'validation_failed') {
        setError('Bitte alle Felder prüfen.');
      } else {
        setError('Konnte gerade nicht speichern — gleich nochmal probieren?');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 28, fontWeight: '600', color: LB.ink, letterSpacing: -0.6 }}>
            Profil anlegen
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            Wir brauchen den Vornamen, das Geburtsjahr und die Klasse. Alles anpassbar später.
          </Text>

          <View style={{ marginTop: 18, gap: 12 }}>
            <Field label="Vorname">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="z. B. Lena"
                placeholderTextColor={LB.ink3}
                style={inputStyle}
              />
            </Field>
            <Field label="Geburtsjahr">
              <TextInput
                value={birthYear}
                onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
                placeholder="z. B. 2012"
                placeholderTextColor={LB.ink3}
                keyboardType="number-pad"
                style={inputStyle}
              />
            </Field>
            <Field label="Klasse">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GRADES.map((g) => (
                  <Pressable
                    key={g.value}
                    onPress={() => setGrade(g.value)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: grade === g.value ? LB.ink : LB.bg,
                      borderColor: LB.hairline,
                      borderWidth: 1,
                    }}
                  >
                    <Text
                      style={{ color: grade === g.value ? '#fff' : LB.ink, fontSize: 12 }}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            {isMinor && (
              <Text style={{ fontSize: 12, color: LB.ink2, lineHeight: 18 }}>
                Auf der nächsten Seite holen wir kurz die Einwilligung für ein Profil unter 16 ein.
              </Text>
            )}
            {error && (
              <Text style={{ color: LB.danger, fontSize: 12 }}>{error}</Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: 32 }}>
          <Btn size="lg" full variant={canSubmit ? 'primary' : 'ghost'} onPress={onContinue}>
            {busy ? 'Moment …' : 'Weiter'}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11, color: LB.ink2, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: LB.bg,
  borderColor: LB.hairline,
  borderWidth: 1,
  borderRadius: 12,
  paddingHorizontal: 16,
  height: 50,
  fontSize: 15,
  color: LB.ink,
} as const;
