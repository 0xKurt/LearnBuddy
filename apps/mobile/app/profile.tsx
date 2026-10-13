// The learner profile: who learns, name, birth date, language; for a child
// also the adult's consent (DSGVO Art. 8) and the adult PIN; then one question — may Buddy send
// notifications? — whose answer saves the profile (issue #518; under 16 the adults answer, in the
// same request as their PIN); for a child a short hand-over: what is set, and "give the phone to
// your child" (user feedback #10). Last, once the profile exists and only where Buddy's own
// voices are there to tell apart (issue #526): how Buddy should sound (a voice is already chosen,
// so she can simply go on; ADR 0008 §Amendment).
// Someone under 16 setting up alone is not stopped at a dead end: an adult who is
// there does the parents' step on this phone (user feedback #5,
// docs/DESIGN-BRIEF.md §Onboarding "Erwachsene Person ist hier"). No age checks
// beyond the birth date: the app says what applies and offers the real next step.

import { CurriculumRegion, type AppLocale } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';

import { BirthDateFields, type DateParts } from '../components/auth/BirthDateFields.js';
import { CheckPoints } from '../components/auth/CheckPoints.js';
import { Btn } from '../components/lb/Btn.js';
import { Checkbox } from '../components/lb/Checkbox.js';
import { ContactStep, type ContactAnswer } from '../components/auth/ContactStep.js';
import { SetupStep } from '../components/auth/SetupStep.js';
import { noteVoiceStep } from '../components/auth/setupSteps.js';
import { Icon } from '../components/lb/Icon.js';
import { LanguageChoice } from '../components/lb/LanguageChoice.js';
import { LANGUAGES } from '../lib/i18n/languages.js';
import { Field } from '../components/lb/Field.js';
import type { LbTextInputRef } from '../components/lb/LbTextInput.js';
import { PROFILE } from '../lib/theme/profile.js';
import { PickerField, picked } from '../components/lb/PickerField.js';
import { Segmented } from '../components/lb/Segmented.js';
import { toast } from '../components/lb/Toast.js';
import { WaitHint } from '../components/lb/WaitHint.js';
import { VoicePicker } from '../components/voice/VoicePicker.js';
import { useAnnounce } from '../lib/announce.js';
import { handoverContactKey } from '../lib/contact/state.js';
import { ApiError } from '../lib/api/client.js';
import { createLearner, getMe, getSettings } from '../lib/api/endpoints.js';
import { keys, prefetchHome, queryClient, useMe, useSettings } from '../lib/api/queries.js';
import { ageOf, birthDateOf } from '../lib/birthDate.js';
import { messageFor } from '../lib/errors.js';
import { profileLeavesTo } from '../lib/gate.js';
import { applyLocale, currentLocale } from '../lib/i18n/index.js';
import { currentSession } from '../lib/auth/session.js';
import { signOutHere } from '../lib/leave.js';
import { useBuddyVoice } from '../lib/speech/useBuddyVoice.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { UI } from '../lib/theme/components.js';
import { RHYTHM, SPACE } from '../lib/theme/space.js';
import { useFormDraft } from '../lib/drafts.js';

/** Android number pads emit "-", "," and spaces too; a date or PIN is digits only. */
const onlyDigits = (value: string) => value.replace(/\D+/g, '');

export default function Profile() {
  const { palette } = useTheme();
  const { t } = useTranslation('auth');
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
  /**
   * The answer to the notification question (issue #518): being saved, then what was saved.
   * Asked of the adults for a child under 16, of her from 16 — never ticked in advance.
   */
  const [answering, setAnswering] = useState<ContactAnswer | null>(null);
  const [answered, setAnswered] = useState<ContactAnswer | null>(null);
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
  // A learner that exists already and was not made here (a reload right after the setup, decided
  // from the copy kept on the device): she leaves as soon as `/me` says so (lib/gate.ts, #599).
  const me = useMe();
  const leavesTo = profileLeavesTo(me.data, answering !== null || answered !== null);
  useEffect(() => {
    if (leavesTo) router.replace(leavesTo);
  }, [leavesTo]);
  // A child has separate learner and parent forms with reachable scroll content. Then the
  // notification question, whose answer saves the profile — and for a child the hand-over. Then
  // Buddy's voice where there are voices to choose: it needs the profile, because the sample is
  // read and the choice saved for her.
  const [step, setStep] = useState<'learner' | 'parent' | 'contact' | 'handover' | 'voice'>(
    'learner',
  );
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
  // the note under the date explains; the hint points there instead of repeating the fields.
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

  async function submit(contact: ContactAnswer) {
    // The Bundesland is part of this: the server refuses a profile without one, and the
    // CTA is only live once it is chosen — nothing is sent half filled (issue #199).
    if (!relation || !birthDate || !picked(region) || answering) return;
    setAnswering(contact);
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
        contact,
        ...(needsParents ? { pin } : {}),
      });
      setAnswered(contact);
      applyLocale(locale);
      // The learner exists now: her home loads while the hand-over, the voice and the cards are
      // on screen, so it is there with its words when she arrives (issue #392).
      prefetchHome();
      // Saved on the server: the draft has done its job (issue #133 position 9).
      form.clear();
      // The parents set it up: first what is set now, then the phone goes to the child.
      if (needsParents) setStep('handover');
      else await toVoice();
    } catch (err) {
      // The profile exists already (e.g. the answer to the first tap got lost): go on.
      if (err instanceof ApiError && err.reason === 'learner_exists') {
        // Not this run's setup: what it showed is unknown, so the colours count nothing.
        noteVoiceStep(undefined);
        await goOn().catch(() => toast.show(messageFor(err), 'error'));
        return;
      }
      toast.show(messageFor(err), 'error');
    } finally {
      setAnswering(null);
    }
  }

  /**
   * Buddy's voice is a step only where there are voices to tell apart — the server says so
   * (`natural_voice`, issue #526). Without them, or when that cannot be known right now, the
   * setup goes on; the voice is the default and the settings offer it once it can be heard.
   */
  async function toVoice() {
    const settings = await queryClient
      .fetchQuery({ queryKey: keys.settings, queryFn: getSettings })
      .catch(() => null);
    const voices = settings?.natural_voice === true;
    // The colours count from this: "4 von 4" after the voice page, "3 von 3" without it.
    noteVoiceStep(voices);
    if (voices) setStep('voice');
    else await finish();
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
        contactEnabled={answered === 'yes'}
        busy={busy}
        onDone={() => void toVoice()}
      />
    );
  }
  if (step === 'contact') {
    return (
      <ContactStep
        name={name.trim()}
        forChild={needsParents}
        answering={answering}
        onAnswer={(answer) => void submit(answer)}
        onBack={() => setStep(needsParents ? 'parent' : 'learner')}
      />
    );
  }
  if (step === 'voice') {
    return <VoiceStep busy={busy} onDone={() => void finish()} />;
  }

  return (
    <SetupStep
      keyboardSafe
      scrollTestID="scroll-form"
      step="profile"
      title={parentStep ? t('profile.parent_title') : t('profile.title')}
      footer={
        <>
          {whyWait > 0 ? <WaitHint>{waitHint}</WaitHint> : null}
          {/* Continue to the parent form, or from there (and from 16) to the notification question. */}
          <Btn
            size="lg"
            pill
            full
            disabled={!(parentStep || !needsParents ? ready : learnerReady)}
            onDisabledPress={() => setWhyWait((n) => n + 1)}
            onPress={() => setStep(needsParents && !parentStep ? 'parent' : 'contact')}
          >
            {t('profile.next')}
          </Btn>
          {/* The way out, on both pages and in the same place (design Onboarding.jsx:68, H-22):
              the parents' page is where an adult reads which e-mail the account runs on and
              may find it is the wrong one. */}
          <Btn
            variant="ghost"
            size="sm"
            pill
            full
            busy={leaving}
            disabled={busy}
            onPress={() => void leave()}
          >
            {t('profile.sign_out')}
          </Btn>
          {/* The parents' page follows a page the design does not have, so it also needs the
              way back to it: a further quiet action, last, as on the notification page. */}
          {parentStep ? (
            <Btn
              variant="ghost"
              size="sm"
              pill
              full
              disabled={leaving}
              onPress={() => setStep('learner')}
            >
              {t('profile.back')}
            </Btn>
          ) : null}
        </>
      }
    >
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
          <Field
            label={relation === 'self' ? t('profile.name_self') : t('profile.name_child')}
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
          />
          {/* Language before the date: the date fields open the keyboard, and a
                  section below them was simply never seen (user feedback 2026-09-28 —
                  "Let's go" was tappable while fields still hid under the keyboard).
                  Same language choice as the welcome screen. */}
          <Labelled label={t('profile.language')}>
            <LanguageChoice
              value={locale}
              options={LANGUAGES}
              onChange={setLocale}
              label={t('profile.language')}
              closeLabel={t('common:actions.close')}
            />
          </Labelled>
          {/* The Bundesland, required (owner 2026-10-02, issue #199). It sits above the
                  date fields for the same reason the language does: those open the keyboard,
                  and anything below them was never seen. One row, because the sixteen
                  choices live in the sheet it opens — a form of sixteen would not fit a
                  360×740 phone (rule 16), and the sheet is also where the reason is said. */}
          <Labelled label={t('region.label')}>
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
          </Labelled>
          <Labelled label={t('profile.birth_date')}>
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
              // Not a dead end: what applies, and the real next step (user feedback #5). Words on
              // the page, no tinted box: lavender is Buddy's state or a choice (HANDOFF §4).
              <View style={{ gap: RHYTHM.parts, paddingTop: SPACE.xs }}>
                <Text style={[TYPE.paragraph, { paddingHorizontal: SPACE.xs }]}>
                  {t('profile.too_young_self')}
                </Text>
                <Btn pill variant="secondary" icon="shield" onPress={adultIsHere}>
                  {t('profile.adult_here')}
                </Btn>
              </View>
            ) : null}
          </Labelled>
        </>
      ) : null}
      {parentStep && handedOver ? (
        // The account was made by the teenager: say whose e-mail it runs on.
        <Text style={[TYPE.paragraph, { paddingHorizontal: SPACE.xs }]}>
          {t('profile.handover_email', { email: currentSession()?.email ?? '' })}
        </Text>
      ) : null}
      {parentStep ? (
        // The parents' page as the design has it (Onboarding.jsx:70–86): the consent as a tick
        // row, then the PIN as one block. Notifications are asked on the next page (ContactStep).
        <>
          <Checkbox checked={consent} onChange={setConsent} label={t('profile.child_consent')} />
          {/* One block, its parts 8 apart — 4 closer than the design's 12 (Onboarding.jsx:74): this
              page carries one action more than the design's (the way back to the page before),
              and with 12 it ran 7 pt past a 360×740 phone (#599, CLAUDE.md rule 16). */}
          <View style={{ gap: RHYTHM.parts }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: RHYTHM.parts }}>
              <Icon name="shield" size={PROFILE.shield} color={palette.primaryDk} />
              <Text style={[TYPE.title, { flex: 1 }]}>{t('profile.pin_title')}</Text>
            </View>
            <Text style={TYPE.paragraph}>{t('profile.pin_body')}</Text>
            {/* Visible labels: the second field is the repetition (user feedback #20). */}
            <View style={{ flexDirection: 'row', gap: SPACE.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={t('profile.pin_label')}
                  value={pin}
                  onChangeText={(v) => {
                    const p = onlyDigits(v);
                    setPinValue(p);
                    if (p.length === 4) pinRepeatRef.current?.focus();
                  }}
                  placeholder={t('profile.pin_placeholder')}
                  accessibilityLabel={t('profile.pin_title')}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry={!pinShown}
                  showToggle
                  shown={pinShown}
                  onToggle={() => setPinShown((v) => !v)}
                  toggleAccessibilityLabel={t(pinShown ? 'profile.pin_hide' : 'profile.pin_show')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={t('profile.pin_repeat')}
                  ref={pinRepeatRef}
                  value={pinRepeat}
                  onChangeText={(v) => setPinRepeat(onlyDigits(v))}
                  placeholder={t('profile.pin_placeholder')}
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
                style={[TYPE.meta, { color: palette.danger, paddingHorizontal: SPACE.xs }]}
              >
                {t('profile.pin_mismatch')}
              </Text>
            ) : (
              <Text style={[TYPE.meta, { paddingHorizontal: SPACE.xs }]}>
                {t('profile.pin_forgot')}
              </Text>
            )}
          </View>
        </>
      ) : null}
    </SetupStep>
  );
}

/**
 * The hand-over after the parents' setup: what is set now, and that the child is next
 * (user feedback #10). Everything listed is what was just saved — including the answer to the
 * notification question, which this screen used to report as "off" whatever the parents had
 * chosen (issue #205).
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
  const points = [
    'profile.handover_consent',
    'profile.handover_pin',
    handoverContactKey(contactEnabled),
  ].map((key) => ({
    key,
    content: (
      <Trans
        t={t}
        ns="auth"
        i18nKey={key}
        values={{ name }}
        components={{ strong: <Text style={TYPE.paragraphStrong} /> }}
      />
    ),
  }));
  return (
    <SetupStep
      orbState="happy"
      title={t('profile.handover_title')}
      footer={
        <>
          <Text style={[TYPE.title, { textAlign: 'center', paddingBottom: SPACE.md }]}>
            {t('profile.handover_body', { name })}
          </Text>
          <Btn size="lg" pill full busy={busy} onPress={onDone}>
            {t('profile.handover_cta', { name })}
          </Btn>
        </>
      }
    >
      <CheckPoints points={points} />
    </SetupStep>
  );
}

/**
 * How Buddy should sound: the picker with a voice already chosen (the server's default), so
 * "Weiter" is always possible. Later in the settings, or by asking Buddy ("andere Stimme").
 * Only reached where Buddy's own voices are there, with the settings that said so already loaded
 * (`toVoice`, issue #526).
 */
function VoiceStep({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const { t } = useTranslation('auth');
  const settings = useSettings();
  // Buddy speaks while a sample is being read, and only then (design Onboarding.jsx:103 shows
  // the page mid-sample): the orb's pose follows the voice, not the page.
  const voice = useBuddyVoice();
  return (
    <SetupStep
      step="voice"
      orbState={voice.phase === 'speaking' ? 'speak' : 'idle'}
      title={t('profile.voice_title')}
      lead={t('profile.voice_body')}
      footer={
        <Btn size="lg" pill full busy={busy} onPress={onDone}>
          {t('profile.voice_cta')}
        </Btn>
      }
    >
      {settings.data ? <VoicePicker settings={settings.data} /> : null}
    </SetupStep>
  );
}

/**
 * A row of the profile step whose control has no label of its own (the language, the Bundesland,
 * the three date fields together): the label a `Field` draws, at the same distance.
 */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: UI.field.labelGap }}>
      <Text style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>{label}</Text>
      {children}
    </View>
  );
}
