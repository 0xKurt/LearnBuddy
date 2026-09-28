// Conversation mode: talking with Buddy hands-free, in the same conversation
// as the chat (one assistant, one context — docs/UX-PRINCIPLES.md §22, §34).
// She speaks → it is written down → Buddy answers → the answer is read aloud →
// Buddy listens again. On the phone, listening ends by itself when she pauses;
// on the recording path (the browser) she taps the mic when she is done.
// Tapping the mic while Buddy speaks interrupts it. When Buddy offers
// something to tap (start learning, open a part of the app), the loop pauses
// so she can tap it. The mic is only on while this screen is open, which she
// opened herself; "Beenden" or the keyboard ends it.
// Buddy's orb shows the state (components/voice/TalkOrb.tsx) — listening,
// thinking, speaking, idle — and tapping it while he speaks interrupts him. Two
// soft tones mark listening starting and ending (lib/speech/cues.ts). The camera
// shows Buddy a photo: it goes into the same conversation, and she comes back here.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Linking, Platform, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaCard } from '../components/buddy/AreaCard.js';
import { OfferCard } from '../components/learn/OfferCard.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { Glow } from '../components/lb/Glow.js';
import { useSpokenWords } from '../components/math/useSpokenMath.js';
import { MicButton } from '../components/voice/MicButton.js';
import { ReadAlongText } from '../components/voice/ReadAlongText.js';
import { TalkOrb, type OrbMode } from '../components/voice/TalkOrb.js';
import { talkMode } from '../lib/buddy/moon.js';
import { useBuddyVoice } from '../lib/speech/useBuddyVoice.js';
import { useVoiceInput } from '../components/voice/useVoiceInput.js';
import { newId } from '../lib/api/client.js';
import { sendMessageStreamed } from '../lib/api/endpoints.js';
import { setHome, useHome } from '../lib/api/queries.js';
import { useAnnounce } from '../lib/announce.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { haptic } from '../lib/haptics.js';
import { playCue } from '../lib/speech/cues.js';
import { fadeIn } from '../lib/theme/enter.js';
import { currentLocale } from '../lib/i18n/index.js';
import { speak, stop as stopSpeaking, type ListenEnd } from '../lib/speech/listen.js';
import { createStreamSpeaker, type StreamSpeaker } from '../lib/speech/streamSpeaker.js';
import { talkListensByItself } from '../lib/speech/handsFree.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';
import { SPACE } from '../lib/theme/space.js';

type Phase = 'listening' | 'thinking' | 'speaking' | 'paused';

export default function TalkScreen() {
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const words = useSpokenWords();
  const scroll = useRef<ScrollView>(null);
  const [phase, setPhase] = useState<Phase>('paused');
  const [said, setSaid] = useState('');
  const [reply, setReply] = useState<MessageView | null>(null);
  /** Buddy's reply while it is still being written (only an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
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

  /** Counts her turns: listening again makes any answer still arriving a thing of the past. */
  const turnSeq = useRef(0);

  function listen(): void {
    if (!open.current) return;
    ++turnSeq.current;
    stopSpeaking();
    setProblem(null);
    setPhase('listening');
    // Cue and microphone start together: the 150 ms tap is too quiet and short
    // for the recogniser to write down, and waiting for it read as a stall
    // between turns (owner feedback 2026-09-28).
    void playCue('listen');
    if (voiceRef.current.state === 'idle') voiceRef.current.toggle();
  }

  async function answer(text: string): Promise<void> {
    void playCue('done');
    setSaid(text);
    setReply(null);
    setLive(null);
    setPhase('thinking');
    const id = newId();
    const me = ++turnSeq.current;
    // She spoke again (or left): this answer no longer drives the screen or the voice.
    const stale = () => turnSeq.current !== me || !open.current;
    // Buddy's reply is shown while it is written when the answer changes nothing (the
    // server says `speakable`), but read aloud only once it is stored: after the provider's
    // final safety verdict and validation, so she never hears words that are withdrawn
    // (docs/architecture.md §Speed, audit M-52 / repro-28).
    let round = 0;
    let spokenEnd: ListenEnd | null = null;
    let final: MessageView | null = null;
    /** Reads the reply while it is still being written (issue #65). */
    const along: { speaker: StreamSpeaker | null } = { speaker: null };
    const speakAlong = (): StreamSpeaker => {
      if (along.speaker) return along.speaker;
      setPhase('speaking');
      along.speaker = createStreamSpeaker(
        currentLocale(),
        (sentence) => spokenText(sentence, words),
        (why) => {
          spokenEnd = why;
          goOn();
        },
      );
      return along.speaker;
    };
    const goOn = () => {
      if (stale() || !final || !spokenEnd) return;
      // Read to the end: listen again. A card in the answer no longer stops the talk
      // (owner 28.09.: "im grunde sollte sich zu 90% alles im chat fenster abspielen") —
      // it stays on screen and tappable, and she can simply answer instead. Only a screen
      // reader keeps the mic off (it would be recorded; she taps the mic or uses Magic Tap).
      if (spokenEnd === 'done' && talkListensByItself(screenReader.current)) listen();
      else setPhase((p) => (p === 'speaking' ? 'paused' : p));
    };
    try {
      const res = await sendMessageStreamed(text, id, null, (e) => {
        if (stale()) return;
        if (e.round !== round) {
          // A new attempt replaces what was shown — and what was already said of it.
          round = e.round;
          setLive(null);
          along.speaker?.cancel();
          along.speaker = null;
          spokenEnd = null;
        }
        if (!e.speakable) return;
        setLive(e.text);
        // Speaking starts with the first finished sentence, not with the stored answer
        // (owner decision 28.09., issue #65): `speakable` means this answer changes
        // nothing and carries no safeguarding — the rest waits, as before (audit M-52).
        speakAlong().feed(e.text, e.done);
      });
      setHome(res.home);
      if (stale()) return;
      const r = replyAfter(res.home.thread, id);
      if (res.status === 'failed' || !r) {
        // Whatever was said of a withdrawn answer stops mid-sentence.
        along.speaker?.cancel();
        setLive(null);
        tellProblem(
          res.status === 'failed' ? turnFailureText(res.error_code) : t('buddy:talk.slow'),
        );
        return;
      }
      final = r;
      setReply(r);
      setLive(null);
      setPhase('speaking');
      if (along.speaker) {
        // Already speaking: the stored text is what was streamed, so this only closes it
        // (and adds the last sentence if the stream ended early).
        along.speaker.feed(r.text, true);
      } else {
        // Nothing was said yet (the answer changed something, or a safeguarding reply):
        // read the stored text, sentence by sentence, so it reads along.
        void speak(r.text, currentLocale(), {
          transform: (sentence) => spokenText(sentence, words),
          onEnd: (why) => {
            spokenEnd = why;
            goOn();
          },
        });
      }
    } catch (err) {
      along.speaker?.cancel();
      if (stale()) return;
      setLive(null);
      tellProblem(messageFor(err));
    }
  }

  /**
   * A turn that failed is said, not only shown: she may not be looking at the screen in
   * conversation mode (p2-F-journey-talk-failure-silent). Then the mic waits for a tap.
   */
  function tellProblem(text: string): void {
    setProblem(text);
    setPhase('paused');
    void speak(text, currentLocale());
  }

  // Start listening once when the screen opens (she opened it to talk) — not with a screen
  // reader on (audit M-85): the phone would hear VoiceOver itself.
  const screenReader = useRef<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    // The browser cannot tell (react-native-web always answers true): no screen reader assumed.
    const known: Promise<boolean> =
      Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isScreenReaderEnabled();
    known
      .then((on) => {
        if (!alive) return;
        screenReader.current = on;
        if (talkListensByItself(on)) listen();
      })
      .catch(() => {
        screenReader.current = null;
      });
    const sub =
      Platform.OS === 'web'
        ? null
        : AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
            screenReader.current = on;
          });
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  // Leaving (or opening a card on top) ends everything: no reading aloud, no
  // microphone. Coming back makes the mic work again; she taps it to go on.
  useFocusEffect(
    useCallback(() => {
      open.current = true;
      return () => {
        open.current = false;
        stopSpeaking();
        // What she was saying is dropped, not sent: a turn started now would be ignored and
        // leave the screen stuck in "thinking" (talk-stuck-thinking-on-blur). A turn already
        // on its way is ignored as well (stale), so the screen is paused when she comes back.
        voiceRef.current.cancel();
        setPhase('paused');
      };
    }, []),
  );

  // Listening stopped without text (nothing heard, too short, no mic, writing
  // it down failed): wait for a tap. A text moves on to 'thinking' first.
  const lastVoiceState = useRef(voice.state);
  useEffect(() => {
    const was = lastVoiceState.current;
    lastVoiceState.current = voice.state;
    if (phase !== 'listening' || voice.state !== 'idle') return;
    if (voice.hint || voice.denied || was === 'transcribing') setPhase('paused');
  }, [phase, voice.state, voice.hint, voice.denied]);

  function onMic(): void {
    haptic.tap();
    if (phase === 'listening' && voice.state === 'recording') {
      voice.toggle(); // Done speaking (or stop listening).
      return;
    }
    if (phase === 'thinking') return;
    listen(); // Paused, or interrupting Buddy.
  }

  /** A tap on Buddy while he speaks: he stops (and waits for the mic). */
  function interrupt(): void {
    haptic.tap();
    stopSpeaking();
  }

  // Once the conversation carries content, the orb makes room for it: full size it
  // pushed Buddy's reply and its card half behind the bottom bar (user screenshot
  // 2026-09-28 "der halbe content verschwindet").
  const hasContent = !!(reply ?? live ?? (said || null));
  useEffect(() => {
    if (reply || live) scroll.current?.scrollToEnd({ animated: true });
  }, [reply, live]);

  // Her photo is being read (she showed Buddy something): said here too.
  const home = useHome();
  const reading = home.data?.now?.type === 'material_processing';

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
    : phase === 'speaking'
      ? t('buddy:talk.tap_orb')
      : phase === 'paused' && !problem && !voice.hint && !voice.denied
        ? t('buddy:talk.paused_sub')
        : null;
  // While Buddy's natural voice for a sentence is still on its way, he is thinking (ADR 0008).
  const buddyVoice = useBuddyVoice();
  // Paused without trouble is her turn: the moon waits (lib/buddy/moon.ts).
  const orbMode: OrbMode = talkMode({
    phase,
    hearing: listening || voice.state === 'starting',
    transcribing: voice.state === 'transcribing',
    voiceLoading: buddyVoice.phase === 'loading',
    trouble: !!problem || !!voice.hint || !!voice.denied,
  });

  // Every phase change is heard on iOS too (Android reads the live region).
  useAnnounce(headline);

  // Opened straight from a link (learnbuddy://talk), there is nothing to go back to: the
  // way out leads to the start screen (deep-link-unmatched-and-talk-back).
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView
      // The bottom inset belongs to the button row below, not to the frame as well: both
      // together left a hand's width of nothing under the microphone (owner 28.09., #64).
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: LB.bg }}
      // VoiceOver's Magic Tap (two-finger double tap) is the mic: speak, done, interrupt.
      onMagicTap={onMic}
    >
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
        <CircleBtn icon="close" onPress={leave} accessibilityLabel={t('buddy:talk.end')} />
        <Text style={[TYPE.label, { color: LB.ink2, letterSpacing: 2 }]}>
          {t('buddy:talk.title').toUpperCase()}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', padding: 24, gap: 14 }}
      >
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={[TYPE.display, { textAlign: 'center', marginTop: 12 }]}
        >
          {headline}
        </Text>
        {/* The line under the headline keeps its room, so Buddy never jumps between states. */}
        <View style={{ minHeight: TYPE.title.lineHeight, alignSelf: 'stretch' }}>
          {sub ? (
            <Animated.Text
              key={sub}
              entering={fadeIn()}
              style={[TYPE.title, { color: LB.ink2, fontWeight: '500', textAlign: 'center' }]}
            >
              {sub}
            </Animated.Text>
          ) : null}
        </View>

        <View style={{ marginVertical: hasContent ? -26 : -10 }}>
          <TalkOrb
            mode={orbMode}
            size={hasContent ? 132 : 200}
            level={voice.level}
            {...(phase === 'speaking'
              ? { onPress: interrupt, pressLabel: t('buddy:talk.stop_speaking') }
              : {})}
          />
        </View>

        {listening && voice.live ? (
          <Text style={[TYPE.body, { color: LB.ink2, textAlign: 'center', fontStyle: 'italic' }]}>
            „{voice.live}“
          </Text>
        ) : said && !listening ? (
          <Animated.Text
            key={`said-${said}`}
            entering={fadeIn()}
            style={[TYPE.body, { color: LB.ink2, textAlign: 'center' }]}
          >
            „{said}“
          </Animated.Text>
        ) : null}

        {live && !reply && phase !== 'listening' ? (
          <Animated.Text
            entering={fadeIn()}
            style={[TYPE.title, { textAlign: 'center', fontWeight: '500' }]}
          >
            {live}
          </Animated.Text>
        ) : null}
        {reading ? (
          <Animated.Text
            entering={fadeIn()}
            style={[TYPE.small, { textAlign: 'center' }]}
            accessibilityLiveRegion="polite"
          >
            {t('buddy:now.processing_title')}
          </Animated.Text>
        ) : null}
        {reply && phase !== 'listening' ? (
          <Animated.View
            key={reply.id}
            entering={fadeIn()}
            style={{ alignSelf: 'stretch', gap: 10 }}
          >
            <ReadAlongText
              text={reply.text}
              style={[TYPE.title, { textAlign: 'center', fontWeight: '500' }]}
            />
            {reply.actions.map((a) =>
              a.summary.tool === 'offer_learning' ? (
                <OfferCard key={a.id} actionId={a.id} offer={a.summary} />
              ) : a.summary.tool === 'open_area' ? (
                <AreaCard key={a.id} area={a.summary.area} />
              ) : null,
            )}
          </Animated.View>
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
        {/* The same way out as everywhere else the mic is refused (talk-denied-no-settings-action). */}
        {!problem && voice.denied && Platform.OS !== 'web' ? (
          <Btn variant="soft" pill center onPress={() => void Linking.openSettings()}>
            {t('common:voice.open_settings')}
          </Btn>
        ) : null}
      </ScrollView>

      {/* Voice first: keyboard · big mic · camera, like the chat's voice bar ("Beenden" is the
          close button on top). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: SPACE.lg,
          // 12 like before on a phone without a gesture bar; with one, the device's inset
          // replaces it instead of adding to it (the fit check is exact to the pixel).
          paddingBottom: Math.max(insets.bottom, SPACE.md),
          paddingTop: SPACE.sm,
        }}
      >
        <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
          <CircleBtn
            icon="keyboard"
            onPress={leave}
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
        <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
          <CircleBtn
            icon="camera"
            onPress={() => {
              haptic.tap();
              // The photo goes into the same conversation; capture brings her back here.
              router.push({ pathname: '/capture', params: { from: 'talk' } });
            }}
            accessibilityLabel={t('buddy:talk.photo_label')}
          />
          <Text style={[TYPE.label, { color: LB.ink2 }]}>{t('buddy:talk.photo')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
