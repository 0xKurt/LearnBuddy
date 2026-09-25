// Conversation mode: talking with Buddy hands-free, in the same conversation
// as the chat (one assistant, one context — docs/UX-PRINCIPLES.md §22, §34).
// She speaks → it is written down → Buddy answers → the answer is read aloud →
// Buddy listens again. On the phone, listening ends by itself when she pauses;
// on the recording path (the browser) she taps the mic when she is done.
// Tapping the mic while Buddy speaks interrupts it. When Buddy offers
// something to tap (start learning, open a part of the app), the loop pauses
// so she can tap it. The mic is only on while this screen is open, which she
// opened herself; "Beenden" or the keyboard ends it.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AreaCard } from '../components/buddy/AreaCard.js';
import { BuddyOrb } from '../components/buddy/BuddyOrb.js';
import { OfferCard } from '../components/learn/OfferCard.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { Glow } from '../components/lb/Glow.js';
import { useSpokenWords } from '../components/math/useSpokenMath.js';
import { MicButton } from '../components/voice/MicButton.js';
import { useVoiceInput } from '../components/voice/useVoiceInput.js';
import { newId } from '../lib/api/client.js';
import { sendMessage } from '../lib/api/endpoints.js';
import { setHome } from '../lib/api/queries.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { speak, stop as stopSpeaking } from '../lib/speech/listen.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';

type Phase = 'listening' | 'thinking' | 'speaking' | 'paused';

/** A button to tap in Buddy's answer: the loop waits for her. */
function hasCard(m: MessageView | null): boolean {
  return (
    m?.actions.some((a) => a.summary.tool === 'offer_learning' || a.summary.tool === 'open_area') ??
    false
  );
}

export default function TalkScreen() {
  const { t } = useTranslation(['buddy', 'common']);
  const words = useSpokenWords();
  const [phase, setPhase] = useState<Phase>('paused');
  const [said, setSaid] = useState('');
  const [reply, setReply] = useState<MessageView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const open = useRef(true);

  const voice = useVoiceInput({
    purpose: 'message',
    lang: null,
    untilPause: true,
    onText: (text) => void answer(text),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  function listen(): void {
    if (!open.current) return;
    stopSpeaking();
    setProblem(null);
    setPhase('listening');
    if (voiceRef.current.state === 'idle') voiceRef.current.toggle();
  }

  async function answer(text: string): Promise<void> {
    setSaid(text);
    setReply(null);
    setPhase('thinking');
    const id = newId();
    try {
      const res = await sendMessage(text, id, null);
      setHome(res.home);
      if (!open.current) return;
      const r = replyAfter(res.home.thread, id);
      if (res.status === 'failed' || !r) {
        setProblem(
          res.status === 'failed' ? turnFailureText(res.error_code) : t('buddy:talk.slow'),
        );
        setPhase('paused');
        return;
      }
      setReply(r);
      setPhase('speaking');
      void speak(spokenText(r.text, words), currentLocale(), {
        onEnd: (why) => {
          if (!open.current) return;
          // Read to the end: listen again — unless there is something to tap first.
          if (why === 'done' && !hasCard(r)) listen();
          else setPhase((p) => (p === 'speaking' ? 'paused' : p));
        },
      });
    } catch (err) {
      if (!open.current) return;
      setProblem(messageFor(err));
      setPhase('paused');
    }
  }

  // Start listening once when the screen opens (she opened it to talk).
  useEffect(() => {
    listen();
  }, []);

  // Leaving ends everything: no reading aloud, no microphone.
  useFocusEffect(
    useCallback(
      () => () => {
        open.current = false;
        stopSpeaking();
        if (voiceRef.current.state === 'recording') voiceRef.current.toggle();
      },
      [],
    ),
  );

  // Listening stopped without text (nothing heard, too short, no mic): wait for a tap.
  useEffect(() => {
    if (phase === 'listening' && voice.state === 'idle' && (voice.hint || voice.denied)) {
      setPhase('paused');
    }
  }, [phase, voice.state, voice.hint, voice.denied]);

  function onMic(): void {
    if (phase === 'listening' && voice.state === 'recording') {
      voice.toggle(); // Done speaking (or stop listening).
      return;
    }
    if (phase === 'thinking') return;
    listen(); // Paused, or interrupting Buddy.
  }

  const listening = phase === 'listening' && voice.state === 'recording';
  const headline =
    phase === 'thinking' || voice.state === 'transcribing'
      ? t('buddy:talk.thinking')
      : phase === 'speaking'
        ? t('buddy:talk.speaking')
        : listening || voice.state === 'starting'
          ? t('buddy:talk.listening')
          : t('buddy:talk.paused');
  const sub = listening
    ? voice.onDevice
      ? t('buddy:talk.listening_sub')
      : t('buddy:talk.tap_when_done')
    : phase === 'paused' && !problem && !voice.hint && !voice.denied
      ? t('buddy:talk.paused_sub')
      : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
      <Glow height={700} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 8,
        }}
      >
        <CircleBtn
          icon="close"
          onPress={() => router.back()}
          accessibilityLabel={t('buddy:talk.end')}
        />
        <Text style={[TYPE.label, { color: LB.ink2, letterSpacing: 2 }]}>
          {t('buddy:talk.title').toUpperCase()}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 24, gap: 14 }}
      >
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={[TYPE.display, { textAlign: 'center', marginTop: 12 }]}
        >
          {headline}
        </Text>
        {sub ? (
          <Text style={[TYPE.title, { color: LB.ink2, fontWeight: '500', textAlign: 'center' }]}>
            {sub}
          </Text>
        ) : null}

        <PulsingOrb active={listening || phase === 'speaking'} listening={listening} />

        {listening && voice.live ? (
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', fontStyle: 'italic' }]}>
            „{voice.live}“
          </Text>
        ) : said && !listening ? (
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}>„{said}“</Text>
        ) : null}

        {reply && phase !== 'listening' ? (
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <Text style={[TYPE.title, { textAlign: 'center', fontWeight: '500' }]}>
              {reply.text}
            </Text>
            {reply.actions.map((a) =>
              a.summary.tool === 'offer_learning' ? (
                <OfferCard key={a.id} actionId={a.id} offer={a.summary} />
              ) : a.summary.tool === 'open_area' ? (
                <AreaCard key={a.id} area={a.summary.area} />
              ) : null,
            )}
          </View>
        ) : null}

        {problem || voice.hint || voice.denied ? (
          <Text
            accessibilityRole="alert"
            style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}
          >
            {problem ??
              (voice.denied
                ? t(Platform.OS === 'web' ? 'common:voice.denied_web' : 'common:voice.denied')
                : voice.hint
                  ? t(`common:voice.problem.${voice.hint}`)
                  : '')}
          </Text>
        ) : null}
      </ScrollView>

      {/* Voice first: keyboard · big mic · end (the reference layout). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 16,
          paddingBottom: 12,
          paddingTop: 8,
        }}
      >
        <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
          <CircleBtn
            icon="keyboard"
            onPress={() => router.back()}
            accessibilityLabel={t('buddy:composer.keyboard')}
          />
          <Text style={[TYPE.label, { color: LB.ink2 }]}>{t('buddy:composer.keyboard')}</Text>
        </View>
        <MicButton
          voice={voice}
          size="lg"
          filled
          label={phase === 'speaking' ? t('buddy:talk.interrupt') : t('buddy:talk.speak')}
          disabled={phase === 'thinking'}
          onPress={onMic}
        />
        <View style={{ alignItems: 'center', width: 96 }}>
          <Btn variant="ghost" size="sm" onPress={() => router.back()}>
            {t('buddy:talk.end')}
          </Btn>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** Buddy's orb, gently breathing while it listens or speaks (still with reduced motion). */
function PulsingOrb({ active, listening }: { active: boolean; listening: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    if (!active) {
      scale.setValue(1);
      return;
    }
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.06,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: Platform.OS !== 'web',
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: Platform.OS !== 'web',
            }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [active, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }], marginVertical: 18 }}>
      <BuddyOrb size={200} listening={listening} />
    </Animated.View>
  );
}
