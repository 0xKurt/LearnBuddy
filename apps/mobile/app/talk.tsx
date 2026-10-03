// Conversation mode: talking with Buddy hands-free, in the same conversation
// as the chat (one assistant, one context — docs/UX-PRINCIPLES.md §22, §34).
// She speaks → it is written down → Buddy answers → the answer is read aloud →
// Buddy listens again. On the phone, listening ends by itself when she pauses;
// on the recording path (the browser) she taps the mic when she is done.
// She can talk over Buddy (issue #35): where the platform cancels echo (the
// browser, Android), the mic's LEVEL is watched while he speaks — never its words
// — and her voice, clearly above his echo for long enough (lib/speech/bargeIn.ts),
// stops him and listens. Tapping the mic or Buddy himself does the same, on every
// phone. When Buddy offers something to tap
// (start learning, open a part of the app), the card stays tappable while the
// loop simply listens again (issue #40). The mic is only on while this screen
// is open, which she opened herself; "Beenden" or the keyboard ends it.
// The screen is a camera angle on that one thread (issue #18): the last few
// messages stand as the chat's own bubbles (components/buddy/Conversation.tsx),
// bottom-anchored and following the newest — her words form as her own bubble
// while she speaks, Buddy's reply streams into his, and the sentence he is
// reading aloud stands out in it (ReadAlongBubble). Buddy himself sits small
// above the button row; his state is the moon's movement plus a one-line
// caption (components/voice/TalkOrb.tsx, lib/buddy/moon.ts). Two soft tones
// mark listening starting and ending (lib/speech/cues.ts). The camera shows
// Buddy a photo: it goes into the same conversation, and she comes back here.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Linking, Platform, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Conversation } from '../components/buddy/Conversation.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { Glow } from '../components/lb/Glow.js';
import { useSpokenWords } from '../components/math/useSpokenMath.js';
import { MicButton, MIC_RING_ROOM } from '../components/voice/MicButton.js';
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
import { dropped, reacted, tapped } from '../lib/perf.js';
import { speak, stop as stopSpeaking, type ListenEnd } from '../lib/speech/listen.js';
import { createStreamSpeaker, type StreamSpeaker } from '../lib/speech/streamSpeaker.js';
import { talkListensByItself } from '../lib/speech/handsFree.js';
import { warmRecognition } from '../lib/speech/recognize.js';
import { BargeGate } from '../lib/speech/bargeIn.js';
import { bargeSupported, useBargeMonitor } from '../lib/speech/bargeMonitor.js';
import { voiceStore } from '../lib/speech/voiceState.js';
import { talkHeadline, type TalkPhase } from '../lib/speech/talkState.js';
import { afterReply } from '../lib/speech/talkTurn.js';
import { voiceLocale } from '../lib/speech/voice.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TYPE } from '../lib/theme/type.js';
import { SPACE, bottomRoom } from '../lib/theme/space.js';

type Phase = TalkPhase;

/** How many of the newest messages the talk screen shows (a tail, not the history). */
const TAIL = 3;

export default function TalkScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const words = useSpokenWords();
  const scroll = useRef<ScrollView>(null);
  const [phase, setPhase] = useState<Phase>('paused');
  /** Her turn on its way: her bubble until the server's thread carries the message. */
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  /** Buddy's reply while it is still being written (only an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const open = useRef(true);

  // While a roleplay runs (issue #244) she speaks its language, and the mic listens in it.
  const roleplayLang = useHome().data?.roleplay?.language ?? null;
  const voice = useVoiceInput({
    purpose: 'message',
    lang: roleplayLang,
    untilPause: true,
    onText: (text) => void answer(text),
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /** Counts her turns: listening again makes any answer still arriving a thing of the past. */
  const turnSeq = useRef(0);

  function listen(): void {
    if (!open.current) return;
    const me = ++turnSeq.current;
    stopSpeaking();
    setProblem(null);
    setLive(null);
    setPhase('listening');
    // Cue and microphone start together: the 150 ms tap is too quiet and short
    // for the recogniser to write down, and waiting for it read as a stall
    // between turns (owner feedback 2026-09-28).
    void playCue('listen');
    const start = () => {
      if (!open.current || turnSeq.current !== me) return;
      if (voiceRef.current.state === 'idle') voiceRef.current.toggle();
    };
    // On the phone the barge-in ear lets go of the mic first (two captures race for one
    // device). Otherwise the mic starts in this same tap: a deferred start would say
    // "Ich höre zu." for a frame before the recorder runs (issue #158).
    const freeing = barge.release();
    if (freeing) void freeing.then(start);
    else start();
  }

  async function answer(text: string): Promise<void> {
    void playCue('done');
    const id = newId();
    setPending({ id, text });
    setLive(null);
    setPhase('thinking');
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
      // The owner's felt pause (issue #41): his words start to show — when is the first
      // sound heard? `reacted` fires when the voice really speaks (natural or the phone's).
      tapped('first_audio');
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
      if (stale()) return;
      // Read to the end AND stored: listen again — the two endings race (a short reply can
      // be read out before the server has stored it; lib/speech/talkTurn.ts). A card in the
      // answer no longer stops the talk (owner 28.09.: "im grunde sollte sich zu 90% alles
      // im chat fenster abspielen") — it stays on screen and tappable, and she can simply
      // answer instead. Only a screen reader keeps the mic off (it would be recorded; she
      // taps the mic or uses Magic Tap).
      const next = afterReply(spokenEnd, final !== null, talkListensByItself(screenReader.current));
      if (next === 'wait') return;
      if (next === 'listen') {
        // From Buddy's last word to the mic listening again (issue #41): `reacted` fires
        // when the recogniser really runs, `dropped` when the loop pauses instead.
        tapped('relisten');
        listen();
      } else setPhase((p) => (p === 'speaking' ? 'paused' : p));
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
        // Whatever was said of a withdrawn answer stops mid-sentence. The spoken problem
        // is no first audio of a reply: the open mark would count her reading time.
        dropped('first_audio');
        along.speaker?.cancel();
        setLive(null);
        tellProblem(
          res.status === 'failed' ? turnFailureText(res.error_code) : t('buddy:talk.slow'),
        );
        return;
      }
      final = r;
      // The stored reply stands in the thread now; the live bubble made room for it.
      setLive(null);
      setPhase('speaking');
      if (along.speaker) {
        // Already speaking: the stored text is what was streamed, so this only closes it
        // (and adds the last sentence if the stream ended early). When the reading already
        // ended — a short reply read out before the store returned — goOn ran too early
        // and waited for `final`: decide again now (lib/speech/talkTurn.ts).
        along.speaker.feed(r.text, true);
        goOn();
      } else {
        // Nothing was said yet (the answer changed something, or a safeguarding reply):
        // read the stored text, sentence by sentence, so it reads along in his bubble.
        tapped('first_audio');
        // A line in a roleplay is read in the roleplay's language; once it has ended, the
        // feedback (the newest message then) is read in hers again (issue #244).
        void speak(r.text, res.home.roleplay?.language ?? currentLocale(), {
          transform: (sentence) => spokenText(sentence, words),
          onEnd: (why) => {
            spokenEnd = why;
            goOn();
          },
        });
      }
    } catch (err) {
      dropped('first_audio');
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

  // The first listen must not wait on the system (issue #41): the recogniser's answers
  // (Android service, installed languages, the permission) are fetched once now, while
  // the screen still opens — listening then starts without those round-trips, every turn.
  useEffect(() => {
    warmRecognition(voiceLocale(currentLocale()));
  }, []);

  // Leaving (or opening a card on top) ends everything: no reading aloud, no
  // microphone. Coming back makes the mic work again; she taps it to go on.
  useFocusEffect(
    useCallback(() => {
      open.current = true;
      return () => {
        open.current = false;
        // Open measurements die with the visit; nothing later may complete them.
        dropped('relisten');
        dropped('first_audio');
        stopSpeaking();
        // What she was saying is dropped, not sent: a turn started now would be ignored and
        // leave the screen stuck in "thinking" (talk-stuck-thinking-on-blur). A turn already
        // on its way is ignored as well (stale), so the screen is paused when she comes back
        // — and its optimistic bubble belongs to this visit, the thread carries the rest.
        voiceRef.current.cancel();
        setPending(null);
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
    // The mic really listens again: the `relisten` span ends here (issue #41).
    if (voice.state === 'recording') reacted('relisten');
    if (phase !== 'listening' || voice.state !== 'idle') return;
    if (voice.hint || voice.denied || was === 'transcribing') {
      dropped('relisten'); // It never listened: her tap from here on is her own time.
      setPhase('paused');
    }
  }, [phase, voice.state, voice.hint, voice.denied]);

  // While Buddy's natural voice for a sentence is still on its way, he is thinking
  // (ADR 0008); the moment a voice really speaks ends the `first_audio` span (issue #41).
  const buddyVoice = useBuddyVoice();
  useEffect(() => {
    if (buddyVoice.phase === 'speaking') reacted('first_audio');
  }, [buddyVoice.phase]);

  function onMic(): void {
    haptic.tap();
    if (phase === 'listening' && voice.state === 'recording') {
      voice.toggle(); // Done speaking (or stop listening).
      return;
    }
    if (phase === 'thinking') return;
    listen(); // Paused, or interrupting Buddy.
  }

  /**
   * A tap on Buddy while he speaks: he stops and listens at once (issue #35) — on every
   * phone, also where the barge-in ear below cannot run (iOS, a screen reader on).
   */
  function interrupt(): void {
    haptic.tap();
    listen();
  }

  // Barge-in (issue #35): while Buddy speaks — and the mic may open by itself — the mic's
  // level is watched, never its words. The gate learns his echo first and stops him only for
  // her voice: clearly louder than his residue, for long enough (lib/speech/bargeIn.ts).
  const gate = useRef(new BargeGate());
  /** The ear really hears (a first level arrived): only then may the screen say "just talk". */
  const [bargeHears, setBargeHears] = useState(false);
  const watching =
    bargeSupported && phase === 'speaking' && talkListensByItself(screenReader.current);
  useEffect(() => {
    if (!watching) return;
    gate.current = new BargeGate();
    return () => setBargeHears(false);
  }, [watching]);
  const barge = useBargeMonitor({
    // In the browser the open stream is held while the recorder starts: its own getUserMedia
    // then finds the device awake (issue #41: listening without a gap). Only while starting —
    // once it records, or writes down what she said, no second stream stays open.
    active:
      watching ||
      (Platform.OS === 'web' &&
        bargeSupported &&
        phase === 'listening' &&
        (voice.state === 'idle' || voice.state === 'starting')),
    onLevel: (db, at) => {
      if (!watching) return;
      setBargeHears(true);
      if (gate.current.observe(db, at, voiceStore.get().phase === 'speaking')) {
        // She talked over him: he stops and listens, as if she had tapped him.
        listen();
      }
    },
  });

  // Her photo is being read (she showed Buddy something): said here too.
  const home = useHome();
  const reading = home.data?.now?.type === 'material_processing';

  const listening = phase === 'listening' && voice.state === 'recording';
  // The same thread as the chat, seen from here: its newest messages as the chat's
  // own bubbles (issue #18).
  const thread = home.data?.thread ?? [];
  const tail = thread.slice(-TAIL);
  // Her words as her own bubble: the live transcript while she speaks, then what she
  // said until the server's thread carries the message.
  const confirmed = pending !== null && thread.some((m) => m.client_message_id === pending.id);
  const bubble =
    listening && voice.live
      ? { text: voice.live }
      : pending && !confirmed
        ? { text: pending.text }
        : null;

  // Not "Ich höre zu" until the recorder really runs (issue #158): the decision is pure
  // and tested in lib/speech/talkState.ts, because it is a claim, not a label.
  const headline = t(talkHeadline(listening ? 'listening' : phase, voice.state));
  const sub = listening
    ? voice.onDevice
      ? t('buddy:talk.listening_sub')
      : t('buddy:talk.tap_when_done')
    : phase === 'speaking'
      ? t(bargeHears ? 'buddy:talk.barge_sub' : 'buddy:talk.tap_orb')
      : phase === 'paused' && !problem && !voice.hint && !voice.denied
        ? t('buddy:talk.paused_sub')
        : null;
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
      style={{ flex: 1, backgroundColor: palette.bg }}
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
        <Text style={[TYPE.label, { color: palette.ink2, letterSpacing: 2 }]}>
          {t('buddy:talk.title').toUpperCase()}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {/* The conversation's tail, bottom-anchored and following its end: the same bubbles,
          cards and streaming as the chat (issue #18) — no second rendering of the thread. */}
      {/* Own name, not "scroll-thread": the home stays mounted under this modal, and two
          identical testIDs make every thread locator ambiguous (Playwright strict mode). */}
      <ScrollView
        ref={scroll}
        testID="scroll-talk"
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
        onLayout={() => scroll.current?.scrollToEnd({ animated: false })}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        <Conversation
          messages={tail}
          pending={bubble}
          live={live}
          busy={phase === 'thinking'}
          spoken
          // While she is still speaking, her forming words are no writing of Buddy's.
          showTyping={phase !== 'listening'}
        />
      </ScrollView>

      {problem || voice.hint || voice.denied ? (
        <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 4 }}>
          <Text
            accessibilityRole="alert"
            style={[TYPE.small, { color: palette.ink2, textAlign: 'center' }]}
          >
            {problem ??
              (voice.denied
                ? t(Platform.OS === 'web' ? 'common:voice.denied_web' : 'common:voice.denied')
                : voice.hint
                  ? t(`common:voice.problem.${voice.hint}`)
                  : '')}
          </Text>
          {/* The same way out as everywhere else the mic is refused (talk-denied-no-settings-action). */}
          {!problem && voice.denied && Platform.OS !== 'web' ? (
            <Btn variant="soft" pill center onPress={() => void Linking.openSettings()}>
              {t('common:voice.open_settings')}
            </Btn>
          ) : null}
        </View>
      ) : null}
      {reading ? (
        <Animated.Text
          entering={fadeIn()}
          style={[TYPE.small, { textAlign: 'center', paddingHorizontal: 24, paddingBottom: 4 }]}
          accessibilityLiveRegion="polite"
        >
          {t('buddy:now.processing_title')}
        </Animated.Text>
      ) : null}

      {/* Buddy, small and docked over the button row (issue #18): the moon's movement is the
          state, the caption names it, one quiet line under it says what she can do. The
          caption block keeps its two lines of room, so Buddy never jumps between states. */}
      <View style={{ alignItems: 'center' }}>
        <TalkOrb
          mode={orbMode}
          size={64}
          level={voice.level}
          {...(phase === 'speaking'
            ? // Same action as the mic while Buddy speaks, so the same words name it.
              { onPress: interrupt, pressLabel: t('buddy:talk.interrupt') }
            : {})}
        />
        <View style={{ minHeight: 40, alignItems: 'center', marginTop: -8 }}>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={[TYPE.caption, { fontWeight: '600', color: palette.ink, textAlign: 'center' }]}
          >
            {headline}
          </Text>
          {sub ? (
            <Animated.Text
              key={sub}
              entering={fadeIn()}
              style={[TYPE.caption, { textAlign: 'center', marginTop: 1 }]}
            >
              {sub}
            </Animated.Text>
          ) : null}
        </View>
      </View>

      {/* Voice first: keyboard · big mic · camera, like the chat's voice bar ("Beenden" is the
          close button on top). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: SPACE.lg,
          // Room for the mic's pulsing ring, which is drawn absolute and scaled and so
          // reaches past its button (MIC_RING_ROOM, 17 pt) — with SPACE.md it stuck four
          // pixels past the bottom of the phone and made the whole page scrollable.
          // With a gesture bar the device's inset replaces this instead of adding to it
          // (the fit check is exact to the pixel).
          paddingBottom: bottomRoom(insets.bottom, MIC_RING_ROOM),
          paddingTop: SPACE.sm,
        }}
      >
        <View style={{ alignItems: 'center', gap: 4, width: 96 }}>
          <CircleBtn
            icon="keyboard"
            onPress={leave}
            accessibilityLabel={t('buddy:composer.keyboard')}
          />
          <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('buddy:composer.keyboard')}</Text>
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
          <Text style={[TYPE.label, { color: palette.ink2 }]}>{t('buddy:talk.photo')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
