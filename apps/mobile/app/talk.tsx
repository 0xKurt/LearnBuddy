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
// The orb is the stage (design ui_kits/app/Talk.jsx:22–45, #599): Buddy's state is the moon's
// movement (components/voice/TalkOrb.tsx, lib/buddy/moon.ts) plus one small status line, and under
// it stands ONE line of words — her own while she speaks, the sentence Buddy is saying while he
// speaks (components/voice/TalkCaption.tsx). The screen is still a camera angle on the one thread
// (issue #18): where the thread holds something to tap or to look at — a card Buddy offered, a
// result — or a roleplay runs (ui_kits/app/Extra.jsx:186–195), its newest messages stand as the
// chat's own bubbles and cards (components/buddy/Conversation.tsx) in place of the line. Two soft
// tones mark listening starting and ending (lib/speech/cues.ts). The camera shows Buddy a photo:
// it goes into the same conversation through the chat's bar.
//
// A roleplay spoken here is the design's live scene: its name on top, the smaller orb, who Buddy
// plays, the lines as bubbles, and "Gespräch beenden", which ends the scene and goes back to the
// chat, where the feedback stands. The microphone stays: here it is how a turn ends in the
// browser and how she interrupts him.

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Conversation } from '../components/buddy/Conversation.js';
import { hasCard, messageCard } from '../components/buddy/extensions.js';
import { roleplayLabel, useEndRoleplay } from '../components/buddy/RoleplayLive.js';
import { Btn } from '../components/lb/Btn.js';
import { IconBtn } from '../components/lb/IconBtn.js';
import { Glow } from '../components/lb/Glow.js';
import { TalkCaption } from '../components/voice/TalkCaption.js';
import { talkLine, type TalkReply } from '../components/voice/talkLine.js';
import { TalkOrb, talkOrbRoom, type OrbMode } from '../components/voice/TalkOrb.js';
import { VoiceRow } from '../components/voice/VoiceRow.js';
import { talkMode } from '../lib/buddy/moon.js';
import { useBuddyVoice } from '../lib/speech/useBuddyVoice.js';
import { useVoiceInput } from '../components/voice/useVoiceInput.js';
import { newId } from '../lib/api/client.js';
import { sendMessageStreamed } from '../lib/api/endpoints.js';
import { keys } from '../lib/api/keys.js';
import { queryClient, setHome, useHome } from '../lib/api/queries.js';
import { useAnnounce } from '../lib/announce.js';
import { useScreenReader } from '../lib/useScreenReader.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { haptic } from '../lib/haptics.js';
import { playCue } from '../lib/speech/cues.js';
import { AppearText } from '../components/lb/Motion.js';
import { currentLocale } from '../lib/i18n/index.js';
import { dropped, reacted, tapped } from '../lib/perf.js';
import { speak, stop as stopSpeaking, type ListenEnd } from '../lib/speech/listen.js';
import { createStreamSpeaker, type StreamSpeaker } from '../lib/speech/streamSpeaker.js';
import { talkListensByItself } from '../lib/speech/handsFree.js';
import { warmRecognition } from '../lib/speech/recognize.js';
import { BargeGate } from '../lib/speech/bargeIn.js';
import { bargeSupported, useBargeMonitor } from '../lib/speech/bargeMonitor.js';
import { voiceStore } from '../lib/speech/voiceState.js';
import {
  heardHim,
  newerHome,
  talkHeadline,
  talkStatus,
  type TalkPhase,
} from '../lib/speech/talkState.js';
import { afterReply } from '../lib/speech/talkTurn.js';
import { voiceLocale } from '../lib/speech/voice.js';
import { useSay } from '../lib/speech/say.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';
import { TALK } from '../lib/theme/talk.js';
import { useEndScroll } from '../lib/useEndScroll.js';
import { CHAT } from '../lib/theme/chat.js';
import { TYPE } from '../lib/theme/type.js';
import { RADIUS } from '../lib/theme/radius.js';
import { SPACE, TOUCH, bottomRoom } from '../lib/theme/space.js';
import { attachInChat } from '../lib/capture/attachRequest.js';
import { pageHandler } from '../lib/capture/pages.js';

type Phase = TalkPhase;

/** How many of the newest messages the talk screen shows (a tail, not the history). */
const TAIL = 3;

/** Who Buddy plays in the running roleplay, from its role card in the thread (if still there). */
function roleIn(thread: readonly MessageView[], roleplayId: string): string | null {
  for (const m of thread)
    for (const a of m.actions)
      if (a.summary.tool === 'start_roleplay' && a.summary.roleplay_id === roleplayId)
        return a.summary.role;
  return null;
}

/** Something to tap or to look at: a card of one of Buddy's actions, or a message drawn as one. */
function carriesCard(m: MessageView | undefined): boolean {
  if (!m || m.role !== 'buddy') return false;
  return m.actions.some((a) => hasCard(a.summary.tool)) || messageCard(m) !== null;
}

export default function TalkScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const say = useSay();
  const scroll = useRef<ScrollView>(null);
  const endScroll = useEndScroll(scroll);
  const [phase, setPhase] = useState<Phase>('paused');
  /** Her turn on its way: her bubble until the server's thread carries the message. */
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  /** Buddy's reply while it is still being written (only an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
  /**
   * His stored answer, the line under the orb. One that was not written in front of her
   * (`whole` — how the fixed help answer arrives, rule 18) stays through her next turns until his
   * next answer takes its place (components/voice/talkLine.ts).
   */
  const [reply, setReply] = useState<TalkReply | null>(null);
  /** His voice has been heard for the reply he is on (lib/speech/talkState.ts `heardHim`). */
  const [heard, setHeard] = useState(false);
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
    // His stored reply stays: it is readable under the orb until she says something.
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
    // An answer that arrived whole stays on screen through this turn (rule 18).
    setReply((held) => (held?.whole ? held : null));
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
        (sentence) => spokenText(sentence, say),
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
      // Her tap on "Gespräch beenden" may have been answered while this turn was on its way:
      // the home it brings back is then the older one, with the scene still running, and must
      // not be written over the newer (lib/speech/talkState.ts `newerHome`).
      if (newerHome(res.home, queryClient.getQueryData<BuddyHome>(keys.home))) setHome(res.home);
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
      // Nothing of it was said while it was written: it arrived whole (an answer that changes
      // something, or the fixed help answer — the server streams neither).
      setReply({ id, text: r.text, whole: along.speaker === null });
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
          transform: (sentence) => spokenText(sentence, say),
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
  const screenReaderOn = useScreenReader();
  const screenReader = useRef<boolean | null>(null);
  screenReader.current = screenReaderOn;
  const started = useRef(false);
  useEffect(() => {
    if (started.current || screenReaderOn === null) return;
    started.current = true;
    if (talkListensByItself(screenReaderOn)) listen();
  }, [screenReaderOn]);

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
        setReply(null);
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
  // From his first audio to the end of his reply he speaks — also in the gap while the next
  // sentence's audio loads (no flip of the status and the moon between two sentences).
  const heardNow = heardHim(heard, phase, buddyVoice.phase);
  useEffect(() => {
    setHeard(heardNow);
  }, [heardNow]);

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
  const watching =
    bargeSupported && phase === 'speaking' && talkListensByItself(screenReader.current);
  useEffect(() => {
    if (watching) gate.current = new BargeGate();
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
  // own bubbles (issue #18) — where there is something to tap or to look at, or a scene runs.
  const thread = home.data?.thread ?? [];
  const tail = thread.slice(-TAIL);
  const roleplay = home.data?.roleplay ?? null;
  const role = roleplay ? roleIn(thread, roleplay.id) : null;
  const threaded = roleplay !== null || carriesCard(thread[thread.length - 1]);
  // Her words as her own bubble: the live transcript while she speaks, then what she
  // said until the server's thread carries the message.
  const confirmed = pending !== null && thread.some((m) => m.client_message_id === pending.id);
  const bubble =
    listening && voice.live
      ? { text: voice.live }
      : pending && !confirmed
        ? { text: pending.text }
        : null;
  // Without bubbles, the one line under the orb carries the words (components/voice/talkLine.ts).
  const line = threaded
    ? null
    : talkLine({
        phase,
        heard: voice.live,
        said: pending?.text ?? null,
        // His next answer, as soon as its first words are written, takes the line.
        reply: live !== null ? { id: pending?.id ?? 'live', text: live, whole: false } : reply,
      });

  // Not "Ich höre zu" until the recorder really runs (issue #158): the decision is pure
  // and tested in lib/speech/talkState.ts, because it is a claim, not a label.
  const headline = t(talkHeadline(listening ? 'listening' : phase, voice.state));
  // Paused without trouble is her turn: the moon waits (lib/buddy/moon.ts).
  const orbMode: OrbMode = talkMode({
    phase,
    hearing: listening || voice.state === 'starting',
    transcribing: voice.state === 'transcribing',
    // "Speaking" is from his first audio on: until then his voice is on its way.
    voiceLoading: !heardNow,
    trouble: !!problem || !!voice.hint || !!voice.denied,
  });
  // One status line (Talk.jsx:28), decided and tested in lib/speech/talkState.ts `talkStatus`.
  const status = t(
    talkStatus({
      phase,
      mic: voice.state,
      endsByItself: voice.endsByItself,
      voice: buddyVoice.phase,
      heard: heardNow,
    }),
  );

  // Every phase change is heard on iOS too (Android reads the live region).
  useAnnounce(headline);

  // Opened straight from a link (learnbuddy://talk), there is nothing to go back to: the
  // way out leads to the start screen (deep-link-unmatched-and-talk-back).
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // "Gespräch beenden" in a spoken roleplay (Extra.jsx:204): the scene ends, and she is back in
  // the chat, where the feedback stands as its card.
  const scene = useEndRoleplay(roleplay?.id ?? null);
  async function endScene(): Promise<void> {
    haptic.tap();
    if (await scene.end()) leave();
  }

  const compact = window.height < TALK.compactBelow;
  const stage = compact ? TALK.compactStageSize : roleplay ? TALK.liveStageSize : TALK.stageSize;

  return (
    <SafeAreaView
      // The bottom inset belongs to the button row below, not to the frame as well: both
      // together left a hand's width of nothing under the microphone (owner 28.09., #64).
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: palette.bg }}
      // VoiceOver's Magic Tap (two-finger double tap) is the mic: speak, done, interrupt.
      onMagicTap={onMic}
    >
      <Glow />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          minHeight: TOUCH,
          // Talk.jsx:22: 4 above, 8 before the close button, 12 after the title.
          paddingLeft: SPACE.sm,
          paddingRight: SPACE.md,
          paddingTop: SPACE.xs,
        }}
      >
        <IconBtn
          tone="plain"
          icon="close"
          onPress={leave}
          accessibilityLabel={t('buddy:talk.end')}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={TYPE.title}>
            {roleplay?.scene || t('buddy:talk.title')}
          </Text>
          {roleplay ? (
            <Text numberOfLines={1} style={TYPE.headerMeta}>
              {roleplayLabel(t, roleplay.language)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: SPACE.xl }}>
        {/* Conversation mode is the explicit large-Orb exception (HANDOFF §4). */}
        <View style={{ alignItems: 'center', flexShrink: 0, paddingHorizontal: SPACE.xxl }}>
          <TalkOrb
            mode={orbMode}
            size={stage}
            level={voice.level}
            {...(phase === 'speaking'
              ? // Same action as the mic while Buddy speaks, so the same words name it.
                { onPress: interrupt, pressLabel: t('buddy:talk.interrupt') }
              : {})}
          />
          {role ? (
            // Who Buddy plays, as the scene's pill (Extra.jsx:191).
            <View
              style={{
                backgroundColor: palette.paper,
                borderRadius: RADIUS.round,
                paddingVertical: SPACE.sm,
                paddingHorizontal: SPACE.md,
                marginBottom: SPACE.md,
              }}
            >
              <Text numberOfLines={1} style={TYPE.headerMeta}>
                {t('buddy:roleplay.plays', { role })}
              </Text>
            </View>
          ) : null}
          {/* The orb's box already holds the halo's room: the caption stands `groupGap` under
              the orb itself (Talk.jsx:25). Under a scene's pill it simply follows. */}
          <View
            style={{
              alignSelf: 'stretch',
              marginTop: role ? 0 : TALK.groupGap - talkOrbRoom(stage),
            }}
          >
            <TalkCaption
              status={status}
              line={line}
              lines={compact ? TALK.lineMaxCompact : TALK.lineMax}
              room={!threaded}
            />
          </View>
        </View>

        {/* The conversation's natural-height tail follows its end: the same bubbles,
          cards and streaming as the chat (issue #18), grouped with the stage. */}
        {/* Own name, not "scroll-thread": the home stays mounted under this modal, and two
          identical testIDs make every thread locator ambiguous (Playwright strict mode). */}
        {threaded ? (
          <ScrollView
            ref={scroll}
            testID="scroll-talk"
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.md,
              paddingBottom: SPACE.sm,
            }}
            onLayout={() => endScroll.toEnd(false)}
            onContentSizeChange={() => endScroll.toEnd(true)}
            onScroll={endScroll.onScroll}
            {...endScroll.inputProps}
            scrollEventThrottle={CHAT.scrollThrottle}
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
        ) : null}
      </View>

      {problem || voice.hint || voice.denied ? (
        <View
          style={{
            alignItems: 'center',
            gap: SPACE.sm,
            paddingHorizontal: SPACE.xl,
            paddingBottom: SPACE.xs,
          }}
        >
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
          {/* The same way out as everywhere else the mic is refused (talk-denied-no-settings-action).
              The design has no refused microphone on this screen, so the button keeps the look it
              has everywhere else that state shows (`MicStatus`, owner rule 2). */}
          {!problem && voice.denied && Platform.OS !== 'web' ? (
            <Btn variant="soft" pill center onPress={() => void Linking.openSettings()}>
              {t('common:voice.open_settings')}
            </Btn>
          ) : null}
        </View>
      ) : null}
      {reading ? (
        <AppearText
          style={[
            TYPE.small,
            { textAlign: 'center', paddingHorizontal: SPACE.xl, paddingBottom: SPACE.xs },
          ]}
          accessibilityLiveRegion="polite"
        >
          {t('buddy:now.processing_title')}
        </AppearText>
      ) : null}

      {roleplay ? (
        <View style={{ alignItems: 'center', paddingBottom: SPACE.xs }}>
          {/* The paper button: the microphone below is this screen's one filled action. */}
          <Btn
            variant="secondary"
            center
            busy={scene.busy}
            onPress={() => void endScene()}
            accessibilityHint={t('buddy:roleplay.end_hint')}
          >
            {t('buddy:roleplay.end_talk')}
          </Btn>
        </View>
      ) : null}

      {/* Voice first: keyboard · mic pill · camera (Talk.jsx:32–39) — the conversation's one row
          (`VoiceRow`), the same in practice (issue #386). "Beenden" is the close button on top. */}
      <View
        style={{
          // The side buttons stand 28 from the edges (Talk.jsx:32).
          paddingHorizontal: TALK.rowInset,
          // Safe-area inset or shared footer spacing, without decorative ring clearance.
          paddingBottom: bottomRoom(insets.bottom, SPACE.md),
          paddingTop: SPACE.sm,
        }}
      >
        <VoiceRow
          left={{ icon: 'keyboard', label: t('buddy:composer.keyboard'), onPress: leave }}
          size="lg"
          presentation="talk"
          mic={{
            voice,
            label:
              phase === 'speaking'
                ? t('buddy:talk.interrupt')
                : listening
                  ? t('buddy:talk.finish')
                  : t('buddy:talk.speak'),
            visibleLabel: phase === 'speaking' ? t('buddy:talk.interrupt_short') : undefined,
            disabled: phase === 'thinking',
            onPress: onMic,
          }}
          // Only where a domain takes pages (lib/capture/pages.ts, issue #107).
          right={
            pageHandler.get()
              ? {
                  icon: 'camera',
                  label: t('buddy:talk.photo'),
                  accessibilityLabel: t('buddy:talk.photo_label'),
                  onPress: () => {
                    haptic.tap();
                    // The photo goes into the same conversation: the chat's bar takes it, with
                    // the camera open at once (issue #519) — no screen of its own in between.
                    attachInChat({ open: 'camera' });
                  },
                }
              : null
          }
        />
      </View>
    </SafeAreaView>
  );
}
