// The learner profile: who learns, name, birth date, language; for a child
// also the adult's consent (DSGVO Art. 8) and the adult PIN, and then a short
// hand-over: what is set, and "give the phone to your child" (user feedback #10). Last, once
// the profile exists, one short step: how Buddy should sound (tap to hear, a voice is already
// chosen, so she can simply go on; ADR 0008 §Amendment).
// Someone under 16 setting up alone is not stopped at a dead end: an adult who is
// there does the parents' step on this phone (user feedback #5,
// docs/DESIGN-BRIEF.md §Onboarding "Erwachsene Person ist hier"). No age checks
// beyond the birth date: the app says what applies and offers the real next step.

import { CurriculumRegion, type AppLocale } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { BirthDateFields, type DateParts } from '../components/auth/BirthDateFields.js';
import { CheckPoints } from '../components/auth/CheckPoints.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { Card } from '../components/lb/Card.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { IconDisc } from '../components/lb/IconDisc.js';
import { LanguageFlags } from '../components/lb/LanguageFlags.js';
import { LbTextInput, type LbTextInputRef } from '../components/lb/LbTextInput.js';
import { PickerField, picked } from '../components/lb/PickerField.js';
import { Screen } from '../components/lb/Screen.js';
import { Segmented } from '../components/lb/Segmented.js';
import { Bone, SkeletonGroup } from '../components/lb/Skeleton.js';
import { toast } from '../components/lb/Toast.js';
import { WaitHint } from '../components/lb/WaitHint.js';
import { VoicePicker } from '../components/voice/VoicePicker.js';
import { useAnnounce } from '../lib/announce.js';
import { handoverContactKey } from '../lib/contact/state.js';
import { ApiError } from '../lib/api/client.js';
import { createLearner, getMe } from '../lib/api/endpoints.js';
import { keys, prefetchHome, queryClient, useSettings } from '../lib/api/queries.js';
import { ageOf, birthDateOf } from '../lib/birthDate.js';
import { messageFor } from '../lib/errors.js';
import { applyLocale, currentLocale } from '../lib/i18n/index.js';
import { currentSession } from '../lib/auth/session.js';
import { signOutHere } from '../lib/leave.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';
import { formDensity } from '../lib/keyboard.js';
import { useVisibleHeight } from '../lib/useVisibleHeight.js';
import { CARD_PAD, GUTTER, pinnedBar, RHYTHM, SPACE } from '../lib/theme/space.js';
import { useFormDraft } from '../lib/drafts.js';

/** Android number pads emit "-", "," and spaces too; a date or PIN is digits only. */
const onlyDigits = (value: string) => value.replace(/\D+/g, '');

export default function Profile() {
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  // A small phone (360×740) gets tighter spacing so each step fits (CLAUDE.md rule 16).
  const view = useVisibleHeight();
  // From what is visible: the keyboard keeps the window's height (issue #289).
  const compact = formDensity(view.window, view.overlap) !== 'roomy';
  const [relation, setRelation] = useState<'self' | 'child' | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState<DateParts>({ day: '', month: '', year: '' });
  const [locale, setLocale] = useState<AppLocale>(currentLocale());
  /**
   * The Bundesland her school is in — a required field at registration (owner 2026-10-02,
   * issue #199): "Einfach bei der Registrierung als Pflichtfeld abfragen". It decides what
   * counts as a right answer at twelve verified places
   * (docs/lehrplan-und-uebungsformen.md), so it is asked, never guessed: no preselection,
   * and the CTA waits for it.
   */
  const [region, setRegion] = useState<CurriculumRegion | null>(null);
  const [consent, setConsent] = useState(false);
  // Contact opt-in, decided at registration (owner 2026-09-28): for a child by
  // the adult in the parents' step, from 16 by the learner. Off by default.
  const [contactOk, setContactOk] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  /**
   * Four dots typed blind, twice, on a phone — and a mismatch sends the adult back to the
   * start with no way to see which digit went wrong (audit 30.09., #133 position 17).
   * Off by default; the child is usually sitting right there.
   */
  const [pinShown, setPinShown] = useState(false);
  /**
   * What they typed, kept on the device (issue #133 position 9). This is where a parent
   * and a child sit together over a name and a birth date; Android kills a backgrounded
   * app without warning, and losing it means doing it again in the one moment they were
   * already being patient. The PIN is not in here — a secret does not belong in a draft —
   * and neither is the consent box: agreement is given, not restored.
   */
  const form = useFormDraft('profile', {
    relation: '',
    name: '',
    day: '',
    month: '',
    year: '',
    locale: '',
    region: '',
  });
  const restored = useRef(false);
  useEffect(() => {
    if (!form.ready || restored.current || !form.draft) return;
    restored.current = true;
    const d = form.draft;
    if (d.relation === 'self' || d.relation === 'child') setRelation(d.relation);
    if (d.name) setName(d.name);
    setDate({ day: d.day, month: d.month, year: d.year });
    if (d.locale) setLocale(d.locale as AppLocale);
    // A kept draft is device data, not a trusted value: anything that is not one of the
    // sixteen keys (an older draft, a changed list) is dropped and asked again.
    const kept = CurriculumRegion.safeParse(d.region);
    if (kept.success) setRegion(kept.data);
  }, [form.ready, form.draft]);
  useEffect(() => {
    if (!form.ready) return;
    form.keep({ relation: relation ?? '', name, ...date, locale, region: region ?? '' });
    // `form` is stable per key; keeping it out of the list avoids a write per render.
  }, [form.ready, relation, name, date, locale, region]);
  // The number pad has no return key: a filled field hands focus to the next one.
  const pinRepeatRef = useRef<LbTextInputRef>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // For a child two short steps, each fitting the screen: the child, then the parents —
  // and once saved, the hand-over. Then (for everyone) Buddy's voice: it needs the profile,
  // because the sample is read and the choice saved for her.
  const [step, setStep] = useState<'learner' | 'parent' | 'handover' | 'voice'>('learner');
  /** Came from "Ich selbst" under 16: an adult took over on this phone. */
  const [handedOver, setHandedOver] = useState(false);
  // She tapped the waiting CTA: from then on the line above it says what is still
  // missing (issue #97). Counted, so every further tap announces it again.
  const [whyWait, setWhyWait] = useState(0);

  const birthDate = birthDateOf(date.day, date.month, date.year);
  const dateComplete = date.day.length > 0 && date.month.length > 0 && date.year.length === 4;
  const minor = birthDate !== null && ageOf(birthDate) < 16;
  const tooYoungSelf = relation === 'self' && minor;
  const pinOk = /^\d{4}$/.test(pin) && pin === pinRepeat;
  const learnerReady =
    relation !== null &&
    name.trim().length > 0 &&
    // The Bundesland is required (issue #199): no preselection, so the CTA waits for a tap.
    picked(region) &&
    birthDate !== null &&
    !tooYoungSelf;
  // Under 16 the parents consent and set the PIN; from 16 she decides herself (ADR 0006).
  const needsParents = relation === 'child' && minor;
  const ready = learnerReady && (!needsParents || (consent && pinOk));
  const parentStep = needsParents && step === 'parent';

  // The first thing this step still needs, in screen order — shown once she asked (tap
  // on the waiting CTA, issue #97). Under 16 with "Ich selbst" everything is filled and
  // the lavender card explains; the hint points there instead of repeating the fields.
  const waitHint = parentStep
    ? !consent
      ? t('profile.cta_hint_consent')
      : !pinOk
        ? t('profile.cta_hint_pin')
        : null
    : relation === null
      ? t('profile.cta_hint_who')
      : name.trim().length === 0
        ? t('profile.cta_hint_name')
        : !picked(region)
          ? t('region.cta_hint')
          : birthDate === null
            ? t('profile.cta_hint_birth')
            : tooYoungSelf
              ? t('profile.cta_hint_adult')
              : null;

  // iOS has no live regions: the two inline problems say themselves (lib/announce.ts).
  useAnnounce(dateComplete && !birthDate ? t('profile.birth_date_invalid') : null);
  useAnnounce(pinRepeat.length === 4 && pin !== pinRepeat ? t('profile.pin_mismatch') : null);
  useAnnounce(whyWait > 0 ? waitHint : null, { key: whyWait });

  async function submit() {
    // The Bundesland is part of this: the server refuses a profile without one, and the
    // CTA is only live once it is chosen — nothing is sent half filled (issue #199).
    if (!relation || !birthDate || !picked(region) || busy) return;
    setBusy(true);
    try {
      // One request: the child's profile, the parents' consent and their PIN
      // together, so nothing is left half done (H-20).
      await createLearner({
        relation,
        display_name: name.trim(),
        birth_date: birthDate,
        locale,
        curriculum_region: region,
        minor_consent: needsParents ? consent : false,
        contact_enabled: contactOk,
        ...(needsParents ? { pin } : {}),
      });
      applyLocale(locale);
      // The learner exists now: her home loads while the hand-over, the voice and the cards are
      // on screen, so it is there with its words when she arrives (issue #392).
      prefetchHome();
      // Saved on the server: the draft has done its job (issue #133 position 9).
      form.clear();
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
    // Also on the way in for a profile that already existed (no-op while the one above is fresh).
    prefetchHome();
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
    return (
      <Handover
        name={name.trim()}
        contactEnabled={contactOk}
        busy={busy}
        onDone={() => setStep('voice')}
      />
    );
  }
  if (step === 'voice') {
    return <VoiceStep busy={busy} onDone={() => void finish()} />;
  }

  return (
    <Screen>
      <KeyboardSafe style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: GUTTER,
            paddingVertical: compact ? SPACE.sm : SPACE.lg,
            // token-exempt: the form's rhythm, 10 tight (fits 360×740, rule 16), 18 roomy
            gap: compact ? 10 : 18,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {parentStep ? (
            // One row for the way back and the headline: the stacked pair overflowed a
            // 360×740 phone by 28 px with the wider Linux fonts CI renders with (#98).
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: RHYTHM.parts }}>
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
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
                  {relation === 'self' ? t('profile.name_self') : t('profile.name_child')}
                </Text>
                <LbTextInput
                  clearable
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
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
                  {t('profile.language')}
                </Text>
                <LanguageFlags value={locale} onChange={setLocale} compact />
              </View>
              {/* The Bundesland, required (owner 2026-10-02, issue #199). It sits above the
                  date fields for the same reason the language does: those open the keyboard,
                  and anything below them was never seen. One row, because the sixteen
                  choices live in the sheet it opens — a form of sixteen would not fit a
                  360×740 phone (rule 16), and the sheet is also where the reason is said. */}
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
                  {t('region.label')}
                </Text>
                <PickerField
                  label={t('region.label')}
                  placeholder={t('region.choose')}
                  title={relation === 'self' ? t('region.title') : t('region.title_child')}
                  body={relation === 'self' ? t('region.why') : t('region.why_child')}
                  options={CurriculumRegion.options.map((value) => ({
                    value,
                    label: t(`region.names.${value}`),
                  }))}
                  value={region}
                  onChange={setRegion}
                />
              </View>
              {relation === 'self' && !minor ? (
                <Checkbox
                  checked={contactOk}
                  onChange={setContactOk}
                  label={t('profile.contact_optin')}
                />
              ) : null}
              <View style={{ gap: SPACE.sm }}>
                <Text style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
                  {t('profile.birth_date')}
                </Text>
                <BirthDateFields value={date} onChange={setDate} />
                {dateComplete && !birthDate ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[TYPE.small, { color: palette.danger, paddingHorizontal: SPACE.xs }]}
                  >
                    {t('profile.birth_date_invalid')}
                  </Text>
                ) : (
                  <Text style={[TYPE.small, { paddingHorizontal: SPACE.xs }]}>
                    {relation === 'child'
                      ? t('profile.birth_date_hint_child')
                      : t('profile.birth_date_hint')}
                  </Text>
                )}
                {tooYoungSelf ? (
                  // Not a dead end: what applies, and the real next step (user feedback #5).
                  <Card tone="lavender" padding={SPACE.lg}>
                    <View style={{ gap: RHYTHM.parts }}>
                      <Text style={[TYPE.body, { color: palette.ink }]}>
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
            <Text style={[TYPE.small, { color: palette.ink, paddingHorizontal: SPACE.xs }]}>
              {t('profile.handover_email', { email: currentSession()?.email ?? '' })}
            </Text>
          ) : null}
          {parentStep ? (
            // The parents' card carries consent, contact and the PIN: on a small phone it
            // only fits when every step is the tighter one (tests/web/fit.ts).
            <Card tone="lavender" padding={compact ? SPACE.md : CARD_PAD.roomy}>
              <View style={{ gap: compact ? SPACE.sm : SPACE.md }}>
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
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: RHYTHM.parts,
                    marginTop: 6, // token-exempt: the PIN part set off from the checkboxes
                  }}
                >
                  <IconDisc name="shield" size={32} iconSize={18} />
                  <Text style={[TYPE.title, { flex: 1 }]}>{t('profile.pin_title')}</Text>
                </View>
                <Text style={[TYPE.small, { color: palette.ink }]}>{t('profile.pin_body')}</Text>
                {/* Visible labels: the second field is the repetition (user feedback #20). */}
                <View style={{ flexDirection: 'row', gap: RHYTHM.parts }}>
                  <View style={{ flex: 1 }}>
                    <LbTextInput
                      label={t('profile.pin_label')}
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
                      secureTextEntry={!pinShown}
                      showToggle
                      shown={pinShown}
                      onToggle={() => setPinShown((v) => !v)}
                      toggleAccessibilityLabel={t(
                        pinShown ? 'profile.pin_hide' : 'profile.pin_show',
                      )}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <LbTextInput
                      label={t('profile.pin_repeat')}
                      ref={pinRepeatRef}
                      value={pinRepeat}
                      onChangeText={(v) => setPinRepeat(onlyDigits(v))}
                      placeholder="••••"
                      keyboardType="number-pad"
                      maxLength={4}
                      // One switch for both fields: they are one decision, and a second
                      // eye in the row beside it would only be another thing to hit.
                      secureTextEntry={!pinShown}
                    />
                  </View>
                </View>
                {/* While the two PINs differ, that is what matters; the reset hint returns after. */}
                {pinRepeat.length === 4 && pin !== pinRepeat ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[TYPE.small, { color: palette.danger }]}
                  >
                    {t('profile.pin_mismatch')}
                  </Text>
                ) : (
                  <Text style={[TYPE.small, { color: palette.ink2 }]}>
                    {t('profile.pin_forgot')}
                  </Text>
                )}
              </View>
            </Card>
          ) : null}
        </ScrollView>
        <View style={[pinnedBar(insets.bottom), { gap: SPACE.xs }]}>
          {whyWait > 0 ? <WaitHint>{waitHint}</WaitHint> : null}
          {needsParents && !parentStep ? (
            <Btn
              size="lg"
              pill
              full
              disabled={!learnerReady}
              onDisabledPress={() => setWhyWait((n) => n + 1)}
              onPress={() => setStep('parent')}
            >
              {t('profile.next')}
            </Btn>
          ) : (
            <Btn
              size="lg"
              pill
              full
              busy={busy}
              disabled={!ready}
              onDisabledPress={() => setWhyWait((n) => n + 1)}
              onPress={() => void submit()}
            >
              {t('profile.cta')}
            </Btn>
          )}
          <Btn
            variant="ghost"
            size="sm"
            pill
            center
            busy={leaving}
            disabled={busy}
            onPress={() => void leave()}
          >
            {t('profile.sign_out')}
          </Btn>
        </View>
      </KeyboardSafe>
    </Screen>
  );
}

/**
 * The hand-over after the parents' setup: what is set now, and that the child is next
 * (user feedback #10). Everything listed is what was just saved — including the contact box,
 * which this screen used to report as "off" whatever the parents had ticked (issue #205).
 * The line comes from `handoverContactKey`, the same reading the settings section uses.
 */
function Handover({
  name,
  contactEnabled,
  busy,
  onDone,
}: {
  name: string;
  contactEnabled: boolean;
  busy: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const points = [
    t('profile.handover_consent'),
    t('profile.handover_pin'),
    t(handoverContactKey(contactEnabled), { name }),
  ];
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: GUTTER,
          paddingVertical: SPACE.xl,
          gap: RHYTHM.sections,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <BuddyOrb size={72} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t('profile.handover_title')}
        </Text>
        <CheckPoints points={points} />
        <Text style={[TYPE.title, { textAlign: 'center' }]}>
          {t('profile.handover_body', { name })}
        </Text>
      </ScrollView>
      <View style={pinnedBar(insets.bottom)}>
        <Btn size="lg" pill full busy={busy} onPress={onDone}>
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
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const view = useVisibleHeight();
  // From what is visible: the keyboard keeps the window's height (issue #289).
  const compact = formDensity(view.window, view.overlap) !== 'roomy';
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: GUTTER,
          paddingVertical: compact ? SPACE.lg : SPACE.xl,
          gap: compact ? RHYTHM.stack : RHYTHM.sections, // the voice step's rhythm
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <BuddyOrb size={compact ? 64 : 72} />
        </View>
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {t('profile.voice_title')}
        </Text>
        <Text style={[TYPE.body, { color: palette.ink2, textAlign: 'center' }]}>
          {t('profile.voice_body')}
        </Text>
        {settings.data ? (
          <VoicePicker settings={settings.data} />
        ) : settings.isError ? (
          // Not a dead end: the voice stays the default and can be changed later.
          <Text style={[TYPE.small, { color: palette.ink2, textAlign: 'center' }]}>
            {t('profile.voice_later')}
          </Text>
        ) : (
          <SkeletonGroup label={t('profile.voice_loading')} style={{ gap: SPACE.sm }}>
            <Bone height={44} radius={22} />
            <Bone height={44} radius={22} />
          </SkeletonGroup>
        )}
      </ScrollView>
      <View style={pinnedBar(insets.bottom)}>
        <Btn size="lg" pill full busy={busy} onPress={onDone}>
          {t('profile.voice_cta')}
        </Btn>
      </View>
    </Screen>
  );
}
