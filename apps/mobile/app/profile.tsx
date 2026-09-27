// The learner profile: who learns, name, birth date, language; for a child
// also the adult's consent (DSGVO Art. 8) and the adult PIN.

import type { AppLocale } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn } from '../components/lb/Btn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { Icon } from '../components/lb/Icon.js';
import { LbTextInput } from '../components/lb/LbTextInput.js';
import { Screen } from '../components/lb/Screen.js';
import { Segmented } from '../components/lb/Segmented.js';
import { toast } from '../components/lb/Toast.js';
import { ApiError } from '../lib/api/client.js';
import { createLearner, getMe } from '../lib/api/endpoints.js';
import { keys, queryClient } from '../lib/api/queries.js';
import { ageOf, birthDateOf } from '../lib/birthDate.js';
import { messageFor } from '../lib/errors.js';
import { applyLocale, currentLocale } from '../lib/i18n/index.js';
import { signOutHere } from '../lib/leave.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

const LANGUAGES: Array<{ value: AppLocale; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
];

export default function Profile() {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
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
  const [leaving, setLeaving] = useState(false);
  // For a child two short steps, each fitting the screen: the child, then the parents.
  const [step, setStep] = useState<'learner' | 'parent'>('learner');

  const birthDate = birthDateOf(day, month, year);
  const dateComplete = day.length > 0 && month.length > 0 && year.length === 4;
  const minor = birthDate !== null && ageOf(birthDate) < 16;
  const tooYoungSelf = relation === 'self' && minor;
  const pinOk = /^\d{4}$/.test(pin) && pin === pinRepeat;
  const learnerReady =
    relation !== null && name.trim().length > 0 && birthDate !== null && !tooYoungSelf;
  const ready = learnerReady && (relation === 'self' || (consent && pinOk));
  const parentStep = relation === 'child' && step === 'parent';

  async function submit() {
    if (!relation || !birthDate || busy) return;
    setBusy(true);
    try {
      // One request: the child's profile, the parents' consent and their PIN
      // together, so nothing is left half done (H-20).
      await createLearner({
        relation,
        display_name: name.trim(),
        birth_date: birthDate,
        locale,
        minor_consent: relation === 'child' ? consent : false,
        ...(relation === 'child' ? { pin } : {}),
      });
      applyLocale(locale);
      await goOn();
    } catch (err) {
      // The profile exists already (e.g. the answer to the first tap got lost): go on.
      if (err instanceof ApiError && err.reason === 'learner_exists') {
        await goOn().catch(() => toast.show(messageFor(err), 'error'));
        return;
      }
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  /** Loads the fresh state before routing, so the gate never decides on stale data. */
  async function goOn() {
    await queryClient.fetchQuery({ queryKey: keys.me, queryFn: getMe, staleTime: 0 });
    router.replace('/');
  }

  /** Wrong account or not now: always a way out (H-22). */
  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await signOutHere();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, gap: 22 }}
          keyboardShouldPersistTaps="handled"
        >
          {parentStep ? (
            <>
              <Btn variant="ghost" size="sm" pill icon="back" onPress={() => setStep('learner')}>
                {t('profile.back')}
              </Btn>
              <Text accessibilityRole="header" style={TYPE.display}>
                {t('profile.parent_title')}
              </Text>
            </>
          ) : (
            <Text accessibilityRole="header" style={TYPE.display}>
              {t('profile.title')}
            </Text>
          )}
          {parentStep ? null : (
            <Segmented
              options={[
                { value: 'self', label: t('profile.self') },
                { value: 'child', label: t('profile.child') },
              ]}
              value={relation}
              onChange={setRelation}
            />
          )}
          {relation && !parentStep ? (
            <>
              <View style={{ gap: 8 }}>
                <Text style={[TYPE.label, { paddingHorizontal: 4 }]}>
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
                <Text style={[TYPE.label, { paddingHorizontal: 4 }]}>
                  {t('profile.birth_date')}
                </Text>
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
                  <Text style={[TYPE.small, { color: LB.danger, paddingHorizontal: 4 }]}>
                    {t('profile.birth_date_invalid')}
                  </Text>
                ) : (
                  <Text style={[TYPE.small, { paddingHorizontal: 4 }]}>
                    {relation === 'child'
                      ? t('profile.birth_date_hint_child')
                      : t('profile.birth_date_hint')}
                  </Text>
                )}
                {tooYoungSelf ? (
                  <Text style={[TYPE.small, { color: LB.danger, paddingHorizontal: 4 }]}>
                    {t('profile.too_young_self')}
                  </Text>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <Text style={[TYPE.label, { paddingHorizontal: 4 }]}>{t('profile.language')}</Text>
                <Segmented options={LANGUAGES} value={locale} onChange={setLocale} />
              </View>
            </>
          ) : null}
          {parentStep ? (
            <Card tone="lavender" padding={20}>
              <View style={{ gap: 12 }}>
                <Checkbox
                  checked={consent}
                  onChange={setConsent}
                  label={t('profile.child_consent')}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: LB.paper,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="shield" size={18} color={LB.primaryDk} />
                  </View>
                  <Text style={[TYPE.title, { flex: 1 }]}>{t('profile.pin_title')}</Text>
                </View>
                <Text style={[TYPE.small, { color: LB.ink }]}>{t('profile.pin_body')}</Text>
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
        </ScrollView>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 16),
            gap: 4,
          }}
        >
          {relation === 'child' && !parentStep ? (
            <Btn size="lg" pill full disabled={!learnerReady} onPress={() => setStep('parent')}>
              {t('profile.next')}
            </Btn>
          ) : (
            <Btn size="lg" pill full disabled={!ready || busy} onPress={() => void submit()}>
              {t('profile.cta')}
            </Btn>
          )}
          <Btn
            variant="ghost"
            size="sm"
            pill
            center
            disabled={busy || leaving}
            onPress={() => void leave()}
          >
            {t('profile.sign_out')}
          </Btn>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
