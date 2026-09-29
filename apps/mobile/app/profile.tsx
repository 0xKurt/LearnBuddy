// The learner profile: who learns, name, birth date, language; for a child
// also the adult's consent (DSGVO Art. 8) and the adult PIN, and then a short
// hand-over: what is set, and "give the phone to your child" (user feedback #10). Last, once
// the profile exists, one short step: how Buddy should sound (tap to hear, a voice is already
// chosen, so she can simply go on; ADR 0008 §Amendment).
// Someone under 16 setting up alone is not stopped at a dead end: an adult who is
// there does the parents' step on this phone (user feedback #5,
// docs/DESIGN-BRIEF.md §Onboarding "Erwachsene Person ist hier"). No age checks
// beyond the birth date: the app says what applies and offers the real next step.

import type { AppLocale } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { Icon } from '../components/lb/Icon.js';
import { LanguageFlags } from '../components/lb/LanguageFlags.js';
import { LbTextInput } from '../components/lb/LbTextInput.js';
import { Screen } from '../components/lb/Screen.js';
import { Segmented } from '../components/lb/Segmented.js';
import { Bone, SkeletonGroup } from '../components/lb/Skeleton.js';
import { toast } from '../components/lb/Toast.js';
import { VoicePicker } from '../components/voice/VoicePicker.js';
import { useAnnounce } from '../lib/announce.js';
import { ApiError } from '../lib/api/client.js';
import { createLearner, getMe } from '../lib/api/endpoints.js';
import { keys, queryClient, useSettings } from '../lib/api/queries.js';
import { ageOf, birthDateOf } from '../lib/birthDate.js';
import { messageFor } from '../lib/errors.js';
import { applyLocale, currentLocale } from '../lib/i18n/index.js';
import { currentSession } from '../lib/auth/session.js';
import { signOutHere } from '../lib/leave.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';

/** Android number pads emit "-", "," and spaces too; a date or PIN is digits only. */
const onlyDigits = (value: string) => value.replace(/\D+/g, '');

export default function Profile() {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  // A small phone (360×740) gets tighter spacing so each step fits (CLAUDE.md rule 16).
  const compact = useWindowDimensions().height < 780;
  const [relation, setRelation] = useState<'self' | 'child' | null>(null);
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [locale, setLocale] = useState<AppLocale>(currentLocale());
  const [consent, setConsent] = useState(false);
  // Contact opt-in, decided at registration (owner 2026-09-28): for a child by
  // the adult in the parents' step, from 16 by the learner. Off by default.
  const [contactOk, setContactOk] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  // The number pad has no return key: a filled field hands focus to the next one.
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const pinRepeatRef = useRef<TextInput>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // For a child two short steps, each fitting the screen: the child, then the parents —
  // and once saved, the hand-over. Then (for everyone) Buddy's voice: it needs the profile,
  // because the sample is read and the choice saved for her.
  const [step, setStep] = useState<'learner' | 'parent' | 'handover' | 'voice'>('learner');
  /** Came from "Ich selbst" under 16: an adult took over on this phone. */
  const [handedOver, setHandedOver] = useState(false);

  const birthDate = birthDateOf(day, month, year);
  const dateComplete = day.length > 0 && month.length > 0 && year.length === 4;
  const minor = birthDate !== null && ageOf(birthDate) < 16;
  const tooYoungSelf = relation === 'self' && minor;
  const pinOk = /^\d{4}$/.test(pin) && pin === pinRepeat;
  const learnerReady =
    relation !== null && name.trim().length > 0 && birthDate !== null && !tooYoungSelf;
  // Under 16 the parents consent and set the PIN; from 16 she decides herself (ADR 0006).
  const needsParents = relation === 'child' && minor;
  const ready = learnerReady && (!needsParents || (consent && pinOk));
  const parentStep = needsParents && step === 'parent';

  // iOS has no live regions: the two inline problems say themselves (lib/announce.ts).
  useAnnounce(dateComplete && !birthDate ? t('profile.birth_date_invalid') : null);
  useAnnounce(pinRepeat.length === 4 && pin !== pinRepeat ? t('profile.pin_mismatch') : null);

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
        minor_consent: needsParents ? consent : false,
        contact_enabled: contactOk,
        ...(needsParents ? { pin } : {}),
      });
      applyLocale(locale);
      // The parents set it up: first what is set now, then the phone goes to the child.
      setStep(needsParents ? 'handover' : 'voice');
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
    // Three short cards on how to use Buddy, then the first conversation.
    router.replace('/onboarding');
  }

  /** Under 16 alone: an adult is here and does the parents' step for this profile. */
  function adultIsHere() {
    setHandedOver(true);
    setRelation('child');
    setStep('parent');
  }

  async function finish() {
    setBusy(true);
    try {
      await goOn();
    } catch (err) {
      toast.show(messageFor(err), 'error');
    } finally {
      setBusy(false);
    }
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

  if (step === 'handover') {
    return <Handover name={name.trim()} busy={busy} onDone={() => setStep('voice')} />;
  }
  if (step === 'voice') {
    return <VoiceStep busy={busy} onDone={() => void finish()} />;
  }

  return (
    <Screen>
      <KeyboardSafe style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: compact ? 8 : 16,
            gap: compact ? 10 : 18,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {parentStep ? (
            // One row for the way back and the headline: the stacked pair overflowed a
            // 360×740 phone by 28 px with the wider Linux fonts CI renders with (#98).
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <CircleBtn
                icon="back"
                onPress={() => setStep('learner')}
                accessibilityLabel={t('profile.back')}
              />
              <Text accessibilityRole="header" style={[TYPE.displaySm, { flexShrink: 1 }]}>
                {t('profile.parent_title')}
              </Text>
            </View>
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
                  // Autocorrect must never rewrite the name Buddy will call her by.
                  autoCorrect={false}
                  spellCheck={false}
                  autoCapitalize="words"
                  // The phones want RN's token, the browser the HTML one — "name-given" is
                  // not a valid autocomplete value in HTML (axe: autocomplete-valid, #73).
                  autoComplete={Platform.OS === 'web' ? 'given-name' : 'name-given'}
                  textContentType="givenName"
                  returnKeyType="done"
                  accessibilityLabel={
                    relation === 'self' ? t('profile.name_self') : t('profile.name_child')
                  }
                />
              </View>
              {/* Language before the date: the date fields open the keyboard, and a
                  section below them was simply never seen (user feedback 2026-09-28 —
                  "Let's go" was tappable while fields still hid under the keyboard).
                  Same action, same component: the welcome screen's flags. */}
              <View style={{ gap: 8 }}>
                <Text style={[TYPE.label, { paddingHorizontal: 4 }]}>{t('profile.language')}</Text>
                <LanguageFlags value={locale} onChange={setLocale} compact />
              </View>
              {relation === 'self' && !minor ? (
                <Checkbox
                  checked={contactOk}
                  onChange={setContactOk}
                  label={t('profile.contact_optin')}
                />
              ) : null}
              <View style={{ gap: 8 }}>
                <Text style={[TYPE.label, { paddingHorizontal: 4 }]}>
                  {t('profile.birth_date')}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <FieldLabel>{t('profile.day_label')}</FieldLabel>
                    <LbTextInput
                      value={day}
                      onChangeText={(v) => {
                        const d = onlyDigits(v);
                        setDay(d);
                        if (d.length === 2) monthRef.current?.focus();
                      }}
                      placeholder={t('profile.day')}
                      accessibilityLabel={t('profile.day_label')}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <FieldLabel>{t('profile.month_label')}</FieldLabel>
                    <LbTextInput
                      ref={monthRef}
                      value={month}
                      onChangeText={(v) => {
                        const m = onlyDigits(v);
                        setMonth(m);
                        if (m.length === 2) yearRef.current?.focus();
                      }}
                      placeholder={t('profile.month')}
                      accessibilityLabel={t('profile.month_label')}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  </View>
                  <View style={{ flex: 1.6, gap: 4 }}>
                    <FieldLabel>{t('profile.year_label')}</FieldLabel>
                    <LbTextInput
                      ref={yearRef}
                      value={year}
                      onChangeText={(v) => setYear(onlyDigits(v))}
                      placeholder={t('profile.year')}
                      accessibilityLabel={t('profile.year_label')}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                </View>
                {dateComplete && !birthDate ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[TYPE.small, { color: LB.danger, paddingHorizontal: 4 }]}
                  >
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
                  // Not a dead end: what applies, and the real next step (user feedback #5).
                  <Card tone="lavender" padding={16}>
                    <View style={{ gap: 10 }}>
                      <Text style={[TYPE.body, { color: LB.ink }]}>
                        {t('profile.too_young_self')}
                      </Text>
                      <Btn pill variant="outline" icon="shield" onPress={adultIsHere}>
                        {t('profile.adult_here')}
                      </Btn>
                    </View>
                  </Card>
                ) : null}
              </View>
            </>
          ) : null}
          {parentStep && handedOver ? (
            // The account was made by the teenager: say whose e-mail it runs on.
            <Text style={[TYPE.small, { color: LB.ink, paddingHorizontal: 4 }]}>
              {t('profile.handover_email', { email: currentSession()?.email ?? '' })}
            </Text>
          ) : null}
          {parentStep ? (
            // The parents' card carries consent, contact and the PIN: on a small phone it
            // only fits when every step is the tighter one (tests/web/fit.ts).
            <Card tone="lavender" padding={compact ? 12 : 20}>
              <View style={{ gap: compact ? 8 : 12 }}>
                <Checkbox
                  checked={consent}
                  onChange={setConsent}
                  label={t('profile.child_consent')}
                />
                <Checkbox
                  checked={contactOk}
                  onChange={setContactOk}
                  label={t('profile.contact_optin')}
                />
                {/* On a small phone the badge stays within the title's line height. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: compact ? 0 : 6,
                  }}
                >
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: compact ? 24 : 32,
                      height: compact ? 24 : 32,
                      borderRadius: compact ? 12 : 16,
                      backgroundColor: LB.paper,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="shield" size={compact ? 15 : 18} color={LB.primaryDk} />
                  </View>
                  <Text style={[TYPE.title, { flex: 1 }]}>{t('profile.pin_title')}</Text>
                </View>
                <Text style={[TYPE.small, { color: LB.ink }]}>{t('profile.pin_body')}</Text>
                {/* Visible labels: the second field is the repetition (user feedback #20). */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <FieldLabel>{t('profile.pin_label')}</FieldLabel>
                    <LbTextInput
                      value={pin}
                      onChangeText={(v) => {
                        const p = onlyDigits(v);
                        setPinValue(p);
                        if (p.length === 4) pinRepeatRef.current?.focus();
                      }}
                      placeholder="••••"
                      accessibilityLabel={t('profile.pin_title')}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <FieldLabel>{t('profile.pin_repeat')}</FieldLabel>
                    <LbTextInput
                      ref={pinRepeatRef}
                      value={pinRepeat}
                      onChangeText={(v) => setPinRepeat(onlyDigits(v))}
                      placeholder="••••"
                      accessibilityLabel={t('profile.pin_repeat')}
                      keyboardType="number-pad"
                      maxLength={4}
                      secureTextEntry
                    />
                  </View>
                </View>
                {/* While the two PINs differ, that is what matters; the reset hint returns after. */}
                {pinRepeat.length === 4 && pin !== pinRepeat ? (
                  <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: LB.danger }]}>
                    {t('profile.pin_mismatch')}
                  </Text>
                ) : (
                  <Text style={[TYPE.small, { color: LB.ink2 }]}>{t('profile.pin_forgot')}</Text>
                )}
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
          {needsParents && !parentStep ? (
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
      </KeyboardSafe>
    </Screen>
  );
}

/** A visible label above a field (the field carries it for screen readers too). */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[TYPE.small, { color: LB.ink2, paddingHorizontal: 4 }]}
    >
      {children}
    </Text>
  );
}

/**
 * The hand-over after the parents' setup: what is set now, and that the child is next
 * (user feedback #10). Everything listed is what was just saved: consent and PIN in the
 * same request, and messages to the phone start off (contact is opt-in, CLAUDE.md rule 6).
 */
function Handover({ name, busy, onDone }: { name: string; busy: boolean; onDone: () => void }) {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const points = [
    t('profile.handover_consent'),
    t('profile.handover_pin'),
    t('profile.handover_contact', { name }),
  ];
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 20,
          paddingVertical: 24,
          gap: 18,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <BuddyOrb size={72} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t('profile.handover_title')}
        </Text>
        <Card padding={16}>
          <View style={{ gap: 10 }}>
            {points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: LB.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={15} color={LB.primaryDk} />
                </View>
                <Text style={[TYPE.body, { flex: 1 }]}>{p}</Text>
              </View>
            ))}
          </View>
        </Card>
        <Text style={[TYPE.title, { textAlign: 'center' }]}>
          {t('profile.handover_body', { name })}
        </Text>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <Btn size="lg" pill full disabled={busy} onPress={onDone}>
          {t('profile.handover_cta', { name })}
        </Btn>
      </View>
    </Screen>
  );
}

/**
 * How Buddy should sound: the picker with a voice already chosen (the server's default), so
 * "Weiter" is always possible. Later in the settings, or by asking Buddy ("andere Stimme").
 */
function VoiceStep({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const compact = useWindowDimensions().height < 780;
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 20,
          paddingVertical: compact ? 16 : 24,
          gap: compact ? 14 : 18,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <BuddyOrb size={compact ? 64 : 72} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t('profile.voice_title')}
        </Text>
        <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}>
          {t('profile.voice_body')}
        </Text>
        {settings.data ? (
          <VoicePicker settings={settings.data} />
        ) : settings.isError ? (
          // Not a dead end: the voice stays the default and can be changed later.
          <Text style={[TYPE.small, { color: LB.ink2, textAlign: 'center' }]}>
            {t('profile.voice_later')}
          </Text>
        ) : (
          <SkeletonGroup label={t('profile.voice_loading')} style={{ gap: 8 }}>
            <Bone height={44} radius={22} />
            <Bone height={44} radius={22} />
          </SkeletonGroup>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <Btn size="lg" pill full disabled={busy} onPress={onDone}>
          {t('profile.voice_cta')}
        </Btn>
      </View>
    </Screen>
  );
}
