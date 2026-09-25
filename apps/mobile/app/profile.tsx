// The learner profile: who learns, name, birth date, language; for a child
// also the adult's consent (DSGVO Art. 8) and the adult PIN.

import type { AppLocale } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { LbTextInput } from '../components/lb/LbTextInput.js';
import { Screen } from '../components/lb/Screen.js';
import { Segmented } from '../components/lb/Segmented.js';
import { toast } from '../components/lb/Toast.js';
import { createLearner, getMe, setPin } from '../lib/api/endpoints.js';
import { keys, queryClient } from '../lib/api/queries.js';
import { messageFor } from '../lib/errors.js';
import { applyLocale, currentLocale } from '../lib/i18n/index.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

const LANGUAGES: Array<{ value: AppLocale; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
];

function birthDateOf(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1920) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null;
  if (date.getTime() > Date.now()) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ageOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

export default function Profile() {
  const { t } = useTranslation('auth');
  const [relation, setRelation] = useState<'self' | 'child' | null>(null);
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [locale, setLocale] = useState<AppLocale>(currentLocale());
  const [consent, setConsent] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [busy, setBusy] = useState(false);

  const birthDate = birthDateOf(day, month, year);
  const dateComplete = day.length > 0 && month.length > 0 && year.length === 4;
  const minor = birthDate !== null && ageOf(birthDate) < 16;
  const tooYoungSelf = relation === 'self' && minor;
  const pinOk = /^\d{4}$/.test(pin) && pin === pinRepeat;
  const ready =
    relation !== null &&
    name.trim().length > 0 &&
    birthDate !== null &&
    !tooYoungSelf &&
    (relation === 'self' || (consent && pinOk));

  async function submit() {
    if (!relation || !birthDate) return;
    setBusy(true);
    try {
      await createLearner({
        relation,
        display_name: name.trim(),
        birth_date: birthDate,
        locale,
        minor_consent: relation === 'child' ? consent : false,
      });
      if (relation === 'child') await setPin(pin);
      applyLocale(locale);
      // Load the fresh state before routing, so the gate never decides on stale data.
      await queryClient.fetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 0 });
      router.replace('/');
    } catch (err) {
      // A profile created without its PIN is completed in the settings (with the password).
      toast.show(messageFor(err), 'error');
      await queryClient.invalidateQueries({ queryKey: keys.me });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ padding: 24, gap: 18 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text accessibilityRole="header" style={TYPE.display}>
            {t('profile.title')}
          </Text>
          <Segmented
            options={[
              { value: 'self', label: t('profile.self') },
              { value: 'child', label: t('profile.child') },
            ]}
            value={relation}
            onChange={setRelation}
          />
          {relation ? (
            <>
              <View style={{ gap: 8 }}>
                <Text style={TYPE.label}>
                  {relation === 'self' ? t('profile.name_self') : t('profile.name_child')}
                </Text>
                <LbTextInput
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  accessibilityLabel={
                    relation === 'self' ? t('profile.name_self') : t('profile.name_child')
                  }
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text style={TYPE.label}>{t('profile.birth_date')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <LbTextInput
                      value={day}
                      onChangeText={setDay}
                      placeholder={t('profile.day')}
                      accessibilityLabel={t('profile.day')}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <LbTextInput
                      value={month}
                      onChangeText={setMonth}
                      placeholder={t('profile.month')}
                      accessibilityLabel={t('profile.month')}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1.6 }}>
                    <LbTextInput
                      value={year}
                      onChangeText={setYear}
                      placeholder={t('profile.year')}
                      accessibilityLabel={t('profile.year')}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>
                {dateComplete && !birthDate ? (
                  <Text style={[TYPE.small, { color: LB.danger }]}>
                    {t('profile.birth_date_invalid')}
                  </Text>
                ) : (
                  <Text style={TYPE.small}>
                    {relation === 'child'
                      ? t('profile.birth_date_hint_child')
                      : t('profile.birth_date_hint')}
                  </Text>
                )}
                {tooYoungSelf ? (
                  <Text style={[TYPE.small, { color: LB.danger }]}>
                    {t('profile.too_young_self')}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <Text style={TYPE.label}>{t('profile.language')}</Text>
                <Segmented options={LANGUAGES} value={locale} onChange={setLocale} />
              </View>
              {relation === 'child' ? (
                <Card tone="lavender">
                  <View style={{ gap: 12 }}>
                    <Checkbox
                      checked={consent}
                      onChange={setConsent}
                      label={t('profile.child_consent')}
                    />
                    <Text style={TYPE.title}>{t('profile.pin_title')}</Text>
                    <Text style={TYPE.small}>{t('profile.pin_body')}</Text>
                    <LbTextInput
                      value={pin}
                      onChangeText={setPinValue}
                      placeholder="••••"
                      accessibilityLabel={t('profile.pin_title')}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                    />
                    <LbTextInput
                      value={pinRepeat}
                      onChangeText={setPinRepeat}
                      placeholder="••••"
                      accessibilityLabel={t('profile.pin_repeat')}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                    />
                    {pinRepeat.length === 4 && pin !== pinRepeat ? (
                      <Text style={[TYPE.small, { color: LB.danger }]}>
                        {t('profile.pin_mismatch')}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              ) : null}
            </>
          ) : null}
        </ScrollView>
        <View
          style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: LB.hairline,
            backgroundColor: LB.paper,
          }}
        >
          <Btn size="lg" full disabled={!ready || busy} onPress={() => void submit()}>
            {t('profile.cta')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
