// The one screen, Buddy first: the one thing that matters now (if any), the
// one open decision, and the conversation — what Buddy did stands in it, with
// undo. Starting something is a tap on a suggestion, the camera, or just
// saying it. No lists, no menus to learn. docs/architecture.md §Home.
// Taps are direct API calls (no model); only free text goes to Buddy.
// Voice mode (speaker switch next to the menu): Buddy's reply to what she
// just sent is read aloud, and the mic is the composer's main control.
// At most one card on top and one violet button; everything else Buddy asks in
// the conversation, which stands at its newest message unless she scrolled up to read
// (lib/homeLayout.ts, user feedback #6). The card floats over the greeting and the row of
// ways to start and can be closed (components/buddy/TopOverlay.tsx): nothing below it moves
// when it comes or goes.
// While Buddy writes, the send button is "Stopp" (the turn ends stopped, §Turns); scrolled up to
// read, "↓ Neue Antwort" brings her to a reply that came meanwhile (lib/buddy/newReply.ts).

import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import { Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuddyOrb } from '../components/lb/BuddyOrb.js';
import { Composer } from '../components/buddy/Composer.js';
import { Conversation } from '../components/buddy/Conversation.js';
import { DecisionCard, optInRules, type OptInDecision } from '../components/buddy/DecisionCard.js';
import { whenText } from '../components/buddy/describe.js';
import { SLIM_CLOSE_TOP } from '../components/buddy/SlimBar.js';
import { TopEdgeFade, topEdgeMask } from '../components/lb/EdgeFade.js';
import { NowCard } from '../components/buddy/NowCard.js';
import { NoticeBubble } from '../components/buddy/NoticeBubble.js';
import { CLOSE_INSET, TopOverlay } from '../components/buddy/TopOverlay.js';
import { WorkingNote } from '../components/buddy/WorkingNote.js';
import { ChoiceSheet } from '../components/learn/ChoiceSheet.js';
import { TopicSheet } from '../components/learn/TopicSheet.js';
import type { TopicKind } from '../components/learn/useStartTopic.js';
import { Banner } from '../components/lb/Banner.js';
import { Btn } from '../components/lb/Btn.js';
import { CircleBtn } from '../components/lb/CircleBtn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Glow } from '../components/lb/Glow.js';
import { Icon } from '../components/lb/Icon.js';
import { OrbitMenu, type OrbitItem } from '../components/lb/OrbitMenu.js';
import { StartRow } from '../components/lb/StartRow.js';
import { HomeSkeleton } from '../components/lb/Skeletons.js';
import { Sheet } from '../components/lb/Sheet.js';
import { toast } from '../components/lb/Toast.js';
import { useSpokenWords } from '../components/math/useSpokenMath.js';
import { VoiceModeToggle } from '../components/voice/VoiceModeToggle.js';
import { announce, useAnnounce } from '../lib/announce.js';
import { clearAdminToken } from '../lib/admin.js';
import { requestAdmin } from '../lib/adminFlow.js';
import { useClosedCard } from '../lib/homeCard.js';
import { followsEnd, homeLayout, topKey } from '../lib/homeLayout.js';
import { ApiError, newId } from '../lib/api/client.js';
import { newestBuddyId, seenAfter, showNewReply, type ReplySeen } from '../lib/buddy/newReply.js';
import { haptic } from '../lib/haptics.js';
import { fadeOut, riseIn } from '../lib/theme/enter.js';
import { SHADOW } from '../lib/theme/shadow.js';
import {
  acceptMissingPages,
  answerContactOptIn,
  reportOutcome,
  retryMaterial,
  sendMessageStreamed,
  skipStep,
  stopMessage,
  startStep,
  undoAction,
} from '../lib/api/endpoints.js';
import {
  keys,
  queryClient,
  seedSession,
  setHome,
  useHome,
  usePrefetchSession,
} from '../lib/api/queries.js';
import type { CaptureDraft } from '../lib/capture/draft.js';
import { inThread } from '../lib/buddy/unsent.js';
import { dayPart, greetingVariant, startsNewSession } from '../lib/buddy/sessionAnchor.js';
import { drafts } from '../lib/capture/draftStorage.js';
import { messageFor, turnFailureText } from '../lib/errors.js';
import { currentLocale } from '../lib/i18n/index.js';
import { registerDeviceForPush } from '../lib/push.js';
import { speakInOrder, stop as stopListening } from '../lib/speech/listen.js';
import { replyAfter, spokenText } from '../lib/speech/spoken.js';
import { createStreamSpeaker, type StreamSpeaker } from '../lib/speech/streamSpeaker.js';
import { useVoiceMode } from '../lib/speech/voiceMode.js';
import { LB } from '../lib/theme/colors.js';
import { TYPE } from '../lib/theme/type.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';
import { reacted, tapped } from '../lib/perf.js';

const VISIBLE_MESSAGES = 6;
/** Below the start row's round buttons: two lines of label and the room under the row. */
const LABEL_ROOM = 40;

/** iOS can't present a sheet while another one is still sliding away. */
const SHEET_SWAP_MS = Platform.OS === 'ios' ? 450 : 0;

export default function BuddyScreen() {
  const { t } = useTranslation(['buddy', 'common', 'learn']);
  const home = useHome();
  // A practice to go on with is loaded while its card is on screen (gaps.md #2).
  usePrefetchSession(home.data?.now);
  const [busy, setBusy] = useState(false);
  /** Photos left from before, not sent yet (lib/capture/draft.ts), and one just let go. */
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [letGo, setLetGo] = useState<CaptureDraft | null>(null);
  /** The photo of the page Buddy could not read, while it is on the phone. */
  const [pageThumb, setPageThumb] = useState<string | null>(null);
  const letGoRef = useRef<CaptureDraft | null>(null);
  letGoRef.current = letGo;
  // The KAV adjusts only while this screen is focused: keyboard events fired on a
  // screen pushed above (practice) otherwise leave a stale gap under the composer
  // after coming back (user screenshot 2026-09-28: composer floating mid-screen).
  const [focusedScreen, setFocusedScreen] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocusedScreen(true);
      return () => setFocusedScreen(false);
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void drafts.leftBehind().then((d) => {
        if (alive) setDraft(d);
      });
      void drafts.prune();
      return () => {
        alive = false;
        // Let go and not brought back: now the photos are deleted.
        const gone = letGoRef.current;
        if (gone) void drafts.drop(gone.photos.map((p) => p.uri));
        setLetGo(null);
      };
    }, []),
  );
  const missingNow = home.data?.notice?.type === 'pages_missing' ? home.data.notice : null;
  const missingPage = missingNow ? `${missingNow.material_id}:${missingNow.pages[0]?.page}` : null;
  useEffect(() => {
    if (!missingNow?.pages[0]) {
      setPageThumb(null);
      return;
    }
    let alive = true;
    void drafts.sentPage(missingNow.material_id, missingNow.pages[0].page).then((uri) => {
      if (alive) setPageThumb(uri);
    });
    return () => {
      alive = false;
    };
    // Only when the page in question changes.
  }, [missingPage]);
  const readingId =
    home.data?.now?.type === 'material_processing' ? home.data.now.material_id : null;
  useEffect(() => {
    if (!readingId) {
      setReadingThumb(null);
      return;
    }
    let alive = true;
    void drafts.sentPage(readingId, 1).then((uri) => {
      if (alive) setReadingThumb(uri);
    });
    return () => {
      alive = false;
    };
  }, [readingId]);
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null);
  /** The message being answered right now and how to end its stream ("Stopp"). */
  const sending = useRef<{ id: string; controller: AbortController } | null>(null);
  /** Whether the conversation stands at its end (drives "↓ Neue Antwort"), and what she saw there. */
  const [atEnd, setAtEnd] = useState(true);
  const [seen, setSeen] = useState<ReplySeen>({ seen: null });
  /** Buddy's reply while it is being written (an answer that changes nothing). */
  const [live, setLive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [topic, setTopic] = useState<TopicKind | null>(null);
  const [choice, setChoice] = useState<'homework' | 'vocab' | null>(null);
  const scroll = useRef<ScrollView>(null);
  /** Where the conversation stands, and whether it follows its end. */
  const threadBox = useRef({ y: 0, following: true, view: 0, content: 0 });
  /** To its newest message, unless she scrolled up to read (lib/homeLayout.ts followsEnd). */
  function follow(): void {
    const b = threadBox.current;
    // Something she sent always brings her back to the end (a reply only while she follows it).
    if (followEnd.current) {
      b.following = true;
      setAtEnd(true);
    }
    if (b.following) scroll.current?.scrollToEnd({ animated: followEnd.current });
    followEnd.current = false;
  }
  /** The photo of the sheet being read, while it is on the phone (it arrived). */
  const [readingThumb, setReadingThumb] = useState<string | null>(null);
  // After sending, follow the conversation to its end once the new content has rendered.
  const followEnd = useRef(false);
  const voiceOn = useVoiceMode((s) => s.on);
  const words = useSpokenWords();
  /** The message she sent last whose reply hasn't been read aloud yet (voice mode). */
  const awaitingReply = useRef<string | null>(null);

  /** The home is the screen she sees (a reply is never read over practice or talk, M-79). */
  const focused = useRef(true);

  // Buddy's reply to what she just sent, once it is there (right with the answer, or later
  // when a slow turn finishes): read aloud in voice mode, otherwise announced to a screen
  // reader (audit M-81) — only while the home is on screen.
  const thread = home.data?.thread;
  // At the end of the conversation she sees Buddy's newest reply (no "↓ Neue Antwort" for it).
  const newestReply = thread ? newestBuddyId(thread) : null;
  useEffect(() => {
    setSeen((prev) => {
      const next = seenAfter(prev, atEnd, newestReply);
      return next.seen === prev.seen ? prev : next;
    });
  }, [atEnd, newestReply]);

  // The card on top, unless she closed it on this phone (until it says something else).
  const closedCard = useClosedCard((s) => s.closed);
  const closeCard = useClosedCard((s) => s.close);
  const cardKey = home.data ? topKey(home.data) : null;
  const openCard = cardKey !== null && cardKey !== closedCard ? cardKey : null;
  // It lies over the greeting: VoiceOver hears that it came (Android and the web read its
  // live region).
  useAnnounce(openCard ? t('buddy:card.shown') : null, { key: openCard ?? undefined });
  /** How tall the card is, and where the conversation starts under it. */
  const [cardHeight, setCardHeight] = useState(0);
  const [threadTop, setThreadTop] = useState(0);
  /**
   * Where this visit starts in the conversation (issue #34): decided once, when the screen
   * first sees the thread — after a break of a few hours the greeting line goes under the
   * last message she had, so the new turn starts on a fresh page with everything older
   * right above. Kept in a ref: it must not move while she is in the app.
   */
  const sessionStart = useRef<{ afterMessageId: string; text: string } | null | undefined>(
    undefined,
  );
  useEffect(() => {
    const sent = awaitingReply.current;
    if (!sent || !thread || !focused.current) return;
    const reply = replyAfter(thread, sent);
    if (!reply) return;
    awaitingReply.current = null;
    const text = spokenText(reply.text, words);
    if (voiceOn) speakInOrder([{ text, lang: currentLocale() }]);
    else announce(t('buddy:a11y.reply', { text }));
  }, [thread, voiceOn, words, t]);

  // Going to another screen ends whatever is being read, and a reply that comes later is not
  // read there.
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        awaitingReply.current = null;
        stopListening();
      };
    }, []),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.home });

  /** Runs a tap; a returned home replaces the cached one. */
  async function act(fn: () => Promise<BuddyHome | void>): Promise<void> {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setHome(next);
    } catch (err) {
      haptic.soft();
      toast.show(messageFor(err), 'error');
      if (
        err instanceof ApiError &&
        (err.code === 'conflict' || err.code === 'stale' || err.code === 'not_found')
      ) {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function send(
    text: string,
    clientMessageId: string = newId(),
    replyToId: string | null = null,
  ): Promise<boolean> {
    // Tap → her bubble on screen: the span she calls "hängt" (issue #66).
    tapped('send');
    setPending({ id: clientMessageId, text });
    reacted('send');
    setLive(null);
    followEnd.current = true;
    awaitingReply.current = clientMessageId;
    const controller = new AbortController();
    sending.current = { id: clientMessageId, controller };
    // Buddy's reply appears while it is written when the answer changes nothing
    // (docs/architecture.md §Speed) — and with voice mode on it is read along from the
    // first finished sentence (owner decision 28.09., issue #65). `speakable` is the
    // server's word that this answer changes nothing and carries no safeguarding; anything
    // else is read only once it is stored (audit M-52), by the effect above.
    let round = 0;
    const along: { speaker: StreamSpeaker | null } = { speaker: null };
    try {
      const res = await sendMessageStreamed(
        text,
        clientMessageId,
        replyToId,
        (e) => {
          if (e.round !== round) {
            // A new attempt replaces what was shown — and what was already said of it.
            round = e.round;
            setLive(null);
            along.speaker?.cancel();
            along.speaker = null;
          }
          if (!e.speakable) return;
          // Written at the end: seen there while she follows it; scrolled up to read, she
          // stays where she is and "↓ Neue Antwort" shows.
          setLive(e.text);
          if (!voiceOn) return;
          if (!along.speaker) {
            along.speaker = createStreamSpeaker(
              currentLocale(),
              (sentence) => spokenText(sentence, words),
              () => undefined,
            );
            // What is read along is not read again from the thread.
            awaitingReply.current = null;
          }
          along.speaker.feed(e.text, e.done);
        },
        controller.signal,
      );
      setHome(res.home);
      // The failed message says why in the thread, with "Nochmal senden" right there; a toast
      // would sit on top of exactly that. Screen readers still hear it.
      if (res.status === 'failed') {
        // Whatever was said of a withdrawn answer stops mid-sentence.
        along.speaker?.cancel();
        announce(turnFailureText(res.error_code));
      } else along.speaker?.feed(replyAfter(res.home.thread, clientMessageId)?.text ?? '', true);
      return true;
    } catch (err) {
      along.speaker?.cancel();
      // Nothing to read when the reply comes after a failure she was told about.
      awaitingReply.current = null;
      // She stopped it: the home from the stop says where it stands.
      if (err instanceof ApiError && err.code === 'aborted') return true;
      haptic.soft();
      toast.show(messageFor(err), 'error');
      // The message may have reached the server (then it shows as failed or processing);
      // otherwise the composer gets her text back (audit M-76).
      await refresh().catch(() => undefined);
      return inThread(queryClient.getQueryData<BuddyHome>(keys.home), clientMessageId);
    } finally {
      if (sending.current?.id === clientMessageId) sending.current = null;
      setPending(null);
      setLive(null);
    }
  }

  /**
   * "Stopp": the server ends the turn (stopped — or it was answered already, then the reply
   * is there), then this side stops listening to the stream. A message the server has not
   * stored yet is asked about once more; failing that, the answer comes as usual.
   */
  async function stopReply(): Promise<void> {
    const cur = sending.current;
    if (!cur) return;
    haptic.tap();
    const ask = () => stopMessage(cur.id);
    try {
      let res;
      try {
        res = await ask();
      } catch (err) {
        if (!(err instanceof ApiError && err.code === 'not_found')) throw err;
        await new Promise((r) => setTimeout(r, 700));
        res = await ask();
      }
      // Nothing of a stopped (or answered-and-stopped) reply is read aloud.
      awaitingReply.current = null;
      cur.controller.abort();
      setHome(res.home);
      if (res.status === 'failed') announce(t('buddy:thread.stopped'));
    } catch (err) {
      // Not found twice (it never arrived) or no connection: the reply goes on as it is.
      if (err instanceof ApiError && err.code === 'not_found') return;
      haptic.soft();
      toast.show(messageFor(err), 'error');
    }
  }

  /** "Nie nach 20:00 Uhr" from the stored rules. */
  function rulesShort(decision: OptInDecision | null): string {
    const r = decision?.rules;
    if (!r) return t('buddy:decision.rules_settings');
    return t('buddy:decision.rules_short', { time: r.quiet_start });
  }

  async function enableContact(asAdult: boolean) {
    const name = home.data?.learner.name ?? '';
    const decision = home.data?.decision?.type === 'contact_opt_in' ? home.data.decision : null;
    try {
      // The parents see what they allow (user feedback #4): the rules, not only "Buddy may".
      if (
        asAdult &&
        !(await requestAdmin(
          'contact',
          t('buddy:decision.optin_parent', {
            name,
            rules: decision ? optInRules(t, decision) : t('buddy:decision.optin_body'),
          }),
        ))
      )
        return;
      let registered = false;
      let enabled = false;
      await act(async () => {
        const next = await answerContactOptIn(true);
        enabled = next.system.contact_enabled;
        // Ask for notification permission only now, when it has a purpose.
        if (enabled) registered = await registerDeviceForPush().catch(() => false);
        return next;
      });
      // … and afterwards it is confirmed, with what was allowed. A phone that could not be set
      // up for notifications is no toast over the chat (live finding 8): the card in the chat
      // says what was allowed, and settings says calmly that this phone is not set up yet.
      if (enabled && registered) {
        const rules = rulesShort(decision);
        toast.show(
          asAdult
            ? t('buddy:decision.optin_done_minor', { name, rules })
            : t('buddy:decision.optin_done', { rules }),
        );
      }
    } finally {
      // The PIN was for this one step, also when it failed (docs/privacy.md §PIN gate).
      if (asAdult) clearAdminToken();
    }
  }

  /**
   * The ways to start, on the ring around Buddy (docs/UX-PRINCIPLES.md §6:
   * examples of what Buddy does, not a feature catalog). The first one fits her
   * situation; everything else she just says, and Buddy answers with a button.
   */
  function orbitItems(next: BuddyHome['next']): OrbitItem[] {
    const exam = next.find((i) => i.kind === 'exam');
    return [
      // Always "Arbeit" where she looks for it (user feedback #17); with a test planned it
      // prepares her for that one.
      {
        key: 'exam',
        icon: 'clock',
        label: t('buddy:suggest.exam_short'),
        onPress: () =>
          void send(
            exam ? t('buddy:suggest.test_message', { title: exam.title }) : t('buddy:suggest.exam'),
          ),
      },
      {
        key: 'homework',
        icon: 'pencil',
        label: t('buddy:suggest.homework'),
        onPress: () => setChoice('homework'),
      },
      {
        key: 'speak',
        icon: 'mic',
        label: t('buddy:suggest.speak'),
        onPress: () => setTopic('speak'),
      },
      {
        key: 'vocab',
        icon: 'book',
        label: t('buddy:suggest.vocab'),
        onPress: () => setChoice('vocab'),
      },
      // "Erklär mir was" lives in the chat itself (owner decision 2026-09-28):
      // explanations are conversation, at whatever length the question needs.
    ];
  }

  /** From a choice sheet on: first let it close, then go on. */
  function fromChoice(next: () => void): void {
    setChoice(null);
    setTimeout(next, SHEET_SWAP_MS);
  }

  if (home.isPending)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg }}>
        <HomeSkeleton label={t('common:loading')} />
      </SafeAreaView>
    );
  // A failed background refresh keeps what is on screen (audit M-71); the error screen is
  // only for a home that never loaded.
  if (home.isError && !home.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: LB.bg, justifyContent: 'center' }}>
        <EmptyState
          title={messageFor(home.error)}
          action={
            <Btn center onPress={() => void home.refetch()}>
              {t('common:actions.retry')}
            </Btn>
          }
        />
      </SafeAreaView>
    );
  }

  const h = home.data;
  const layout = homeLayout(h, closedCard);
  const decisionCard = h.decision ? (
    <DecisionCard
      key="decision"
      decision={h.decision}
      inline={layout.decisionInline}
      titleInset={layout.top === 'decision' ? CLOSE_INSET : 0}
      busy={busy}
      onOptIn={(enable) =>
        enable ? void enableContact(false) : void act(() => answerContactOptIn(false))
      }
      onAdultOptIn={() => void enableContact(true)}
      onOutcome={(goalId, outcome) => void act(() => reportOutcome(goalId, outcome))}
    />
  ) : null;
  // What Buddy tells at the end of the conversation, with its buttons: nothing on top moves.
  // The violet button belongs to the card on top when there is one.
  const quiet = layout.top ? 'soft' : 'primary';
  const shownDraft = draft ?? letGo;
  const missing = h.notice?.type === 'pages_missing' ? h.notice : null;
  const notices = [
    shownDraft ? (
      <NoticeBubble
        key="draft"
        text={
          draft
            ? t('capture:draft.title')
            : t('capture:draft.discarded', { count: shownDraft.photos.length })
        }
        detail={draft ? t('capture:draft.body', { count: draft.photos.length }) : null}
        thumb={draft ? (draft.photos.find((p) => !p.pdf)?.uri ?? null) : null}
      >
        {draft ? (
          <>
            <Btn
              size="sm"
              variant={quiet}
              onPress={() => router.push({ pathname: '/capture', params: { resume: '1' } })}
            >
              {t('capture:draft.resume')}
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onPress={() => {
                // Kept until she leaves home: "Rückgängig" brings them back.
                void drafts.save({ requestId: null, photos: [], link: draft.link });
                setLetGo(draft);
                setDraft(null);
              }}
            >
              {t('capture:draft.discard')}
            </Btn>
          </>
        ) : (
          <Btn
            size="sm"
            variant="ghost"
            accessibilityLabel={t('capture:draft.undo_label')}
            onPress={() => {
              const d = letGo;
              if (!d) return;
              void drafts.save({ requestId: d.requestId, photos: d.photos, link: d.link });
              setDraft(d);
              setLetGo(null);
            }}
          >
            {t('capture:draft.undo')}
          </Btn>
        )}
      </NoticeBubble>
    ) : null,
    missing ? (
      <NoticeBubble
        key="pages"
        text={
          missing.photo_count > 1
            ? t('buddy:now.pages_title', { count: missing.pages.length })
            : t('buddy:now.pages_title_single')
        }
        detail={[
          ...missing.pages.map((p) =>
            missing.photo_count > 1
              ? t('buddy:now.pages_line', {
                  page: p.page,
                  problem: t(`buddy:now.pages_problem.${p.problem ?? 'other'}`),
                })
              : t(`buddy:now.pages_problem.${p.problem ?? 'other'}`),
          ),
          missing.title
            ? t('buddy:now.pages_rest', { title: missing.title })
            : t('buddy:now.pages_rest_untitled'),
        ].join('\n')}
        thumb={pageThumb}
      >
        {/* A photo of something else is not worth taking again: then only "OK". */}
        {missing.pages.some((p) => p.problem !== 'not_material') ? (
          <Btn
            size="sm"
            variant={quiet}
            disabled={busy}
            onPress={() =>
              router.push({
                pathname: '/capture',
                params: {
                  completes: missing.material_id,
                  ...(missing.photo_count > 1
                    ? { pages: missing.pages.map((p) => p.page).join(',') }
                    : {}),
                },
              })
            }
          >
            {t('buddy:now.pages_retake', {
              count: missing.photo_count > 1 ? missing.pages.length : 1,
            })}
          </Btn>
        ) : null}
        <Btn
          size="sm"
          variant="ghost"
          disabled={busy}
          onPress={() =>
            void act(async () => {
              await acceptMissingPages(missing.material_id);
              await refresh();
            })
          }
        >
          {t('buddy:now.pages_ok')}
        </Btn>
      </NoticeBubble>
    ) : null,
    // The open question while another card is on top, and "Buddy is working" said once.
    layout.decisionInline ? decisionCard : null,
    layout.working === 'thread' && h.working ? (
      <WorkingNote key="working" what={h.working} />
    ) : null,
  ].filter((node) => node !== null);
  // The next test in one line; everything else Buddy says in the conversation.
  const nextExam = h.next.find((i) => i.kind === 'exam') ?? null;
  const messages = h.thread.slice(-VISIBLE_MESSAGES);
  // Decided once per visit (see the ref above); `undefined` means "not looked at yet".
  if (sessionStart.current === undefined) {
    const lastMessage = h.thread[h.thread.length - 1] ?? null;
    const lastAt = lastMessage ? new Date(lastMessage.created_at) : null;
    const now = new Date();
    sessionStart.current =
      lastMessage && startsNewSession(lastAt, now)
        ? {
            afterMessageId: lastMessage.id,
            text: t(`buddy:session.${dayPart(now.getHours())}.${greetingVariant(now.getDate())}`, {
              name: h.learner.name,
            }),
          }
        : null;
  }
  // Hide the optimistic bubble once the server has the message.
  const shownPending =
    pending && !h.thread.some((m) => m.client_message_id === pending.id)
      ? { text: pending.text }
      : null;

  // "↓ Neue Antwort": she scrolled up and Buddy answered (or is writing) meanwhile.
  const newest = newestBuddyId(h.thread);
  const pill = showNewReply(seen, atEnd, newest, live !== null);

  // Once there is a conversation, it gets the room; the ring shrinks to a row.
  const talking = messages.length > 0 || shownPending !== null || notices.length > 0;
  // The card first (the close button sits in its corner), then what the system says.
  const card =
    layout.top === 'now' && h.now ? (
      <NowCard
        key="now"
        card={h.now}
        titleInset={CLOSE_INSET}
        thumb={readingThumb}
        preparing={layout.working === 'card'}
        busy={busy}
        onResume={(id) => router.push(`/practice/${id}`)}
        onStart={(stepId) =>
          void act(async () => {
            const { session_id, session } = await startStep(stepId);
            if (session) seedSession(session);
            router.push(`/practice/${session_id}`);
          })
        }
        onSkip={(stepId) => void act(() => skipStep(stepId))}
        onCapture={({ stepId, goalId, purpose, completes }) =>
          router.push({
            pathname: '/capture',
            params: {
              ...(stepId ? { stepId } : {}),
              ...(goalId ? { goalId } : {}),
              ...(purpose === 'homework' ? { purpose } : {}),
              ...(completes ? { completes } : {}),
            },
          })
        }
        onRetryMaterial={(id) =>
          void act(async () => {
            await retryMaterial(id);
            await refresh();
          })
        }
      />
    ) : layout.top === 'decision' ? (
      decisionCard
    ) : null;
  const notes = [
    !h.system.model ? (
      <Banner key="model" tone="warning">
        {t('buddy:system.no_model')}
      </Banner>
    ) : null,
    h.system.scheduler === 'stale' ? (
      <Banner key="scheduler" tone="warning">
        {t('buddy:system.scheduler_stale')}
      </Banner>
    ) : null,
  ].filter((node) => node !== null);
  // Only system notes: the first one leaves room for the close button.
  const top = openCard
    ? card
      ? [card, ...notes]
      : notes.map((n, i) =>
          i === 0 ? (
            <View key={`inset-${n.key ?? i}`} style={{ paddingRight: CLOSE_INSET + 16 }}>
              {n}
            </View>
          ) : (
            n
          ),
        )
    : [];
  // What the card lies over at the top of the conversation stays reachable by scrolling.
  const underCard = top.length > 0 ? Math.max(0, cardHeight - threadTop) : 0;
  // While the card covers the ways to start (their round buttons; at most the ends of their
  // labels would show under it), they and the greeting are left out — no edge peeking out
  // beside the card, nothing a screen reader finds behind it — in place, so nothing moves.
  // A shorter card leaves them as they are.
  const covered = top.length > 0 && threadTop > 0 && cardHeight >= threadTop - LABEL_ROOM;
  // The first-visit layout: a card on top lies over the greeting — also the slim bar, which
  // would leave it half hidden under its fade; the greeting steps back in place (nothing moves).
  // (A position measured with onLayout goes stale on the web: it only reports size changes.)
  const greetingCovered = top.length > 0;
  // Her name lives in the top bar (issue #45): the head was a quarter of the screen —
  // a bar, not a stage. What is left here is the one line that carries information:
  // the next test, else the open question, and quietly whether she practised today.
  const headline = (
    <Text
      accessibilityRole="header"
      numberOfLines={1}
      style={[TYPE.title, { fontSize: 18, lineHeight: 24, flexShrink: 1 }]}
    >
      {t('buddy:greeting', { name: h.learner.name })}
    </Text>
  );
  const statusLine = (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        columnGap: 8,
        rowGap: 4,
      }}
    >
      <Text
        numberOfLines={talking ? 1 : 2}
        style={[TYPE.body, { color: LB.ink2, textAlign: 'center', fontWeight: '500' }]}
      >
        {nextExam
          ? t('buddy:next.line', {
              title: nextExam.title,
              when: nextExam.date ? whenText(nextExam.date, nextExam.time) : '',
            })
          : t('buddy:greeting_ask')}
      </Text>
      {h.practiced_today && !talking ? <PracticedToday label={t('buddy:practiced_today')} /> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: LB.bg }}>
      <Glow />
      <KeyboardSafe style={{ flex: 1 }} enabled={focusedScreen}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: 8,
          }}
        >
          {/* Her name sits where the wordmark was (issue #45): one row for who this is
              and the two ways out of it. A long name is cut, never wrapped. */}
          {headline}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Voice mode: Buddy reads replies aloud and the mic leads (audit M-77). */}
            <VoiceModeToggle />
            <CircleBtn
              icon="more"
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={t('buddy:menu.open')}
            />
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {/* What matters now lies on top, over the greeting and the ways to start: it never
            pushes them down, and she can close it (only on this phone). */}
          {openCard && top.length > 0 ? (
            <TopOverlay
              id={openCard}
              closeLabel={t('buddy:card.close')}
              onClose={() => closeCard(openCard)}
              onHeight={setCardHeight}
              closeTop={
                layout.top === 'now' &&
                (h.now?.type === 'practice_ready' || h.now?.type === 'material_processing')
                  ? SLIM_CLOSE_TOP
                  : undefined
              }
            >
              {top}
            </TopOverlay>
          ) : null}

          {talking ? (
            <>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 6,
                  paddingBottom: 4,
                  opacity: covered ? 0 : 1,
                }}
                // Where the conversation starts under the card.
                onLayout={(e) => setThreadTop(e.nativeEvent.layout.height)}
                pointerEvents={covered ? 'none' : 'auto'}
                accessibilityElementsHidden={covered}
                importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
              >
                {/* One row above the conversation: the ways to start. The greeting sits in
                    the bar, what is due is a card — nothing else takes height here
                    (owner 28.09., issue #45: "eine zeile mit menu buttons, thats it"). */}
                <StartRow items={orbitItems(h.next)} disabled={pending !== null} />
              </View>
              <ScrollView
                ref={scroll}
                testID="scroll-thread"
                style={[{ flex: 1 }, topEdgeMask]}
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: 'flex-end',
                  paddingHorizontal: 16,
                  paddingTop: 12 + underCard,
                  paddingBottom: 12,
                  gap: 10,
                }}
                keyboardShouldPersistTaps="handled"
                // A conversation: at its newest message, unless she scrolled up to read.
                onScroll={(e) => {
                  const b = threadBox.current;
                  const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                  const was = b.following;
                  b.following = followsEnd(
                    b.following,
                    b.y,
                    contentOffset.y,
                    layoutMeasurement.height,
                    contentSize.height,
                    undefined,
                    b.view !== layoutMeasurement.height || b.content !== contentSize.height,
                  );
                  b.y = contentOffset.y;
                  b.view = layoutMeasurement.height;
                  b.content = contentSize.height;
                  if (was !== b.following) setAtEnd(b.following);
                }}
                scrollEventThrottle={64}
                onLayout={follow}
                onContentSizeChange={follow}
                refreshControl={
                  <RefreshControl
                    refreshing={home.isRefetching}
                    onRefresh={() => void home.refetch()}
                  />
                }
              >
                {h.thread.length > VISIBLE_MESSAGES || h.thread_has_more ? (
                  <Btn size="sm" variant="ghost" center onPress={() => router.push('/history')}>
                    {t('buddy:thread.load_more')}
                  </Btn>
                ) : null}
                <Conversation
                  contactOn={h.system.contact_enabled}
                  messages={messages}
                  pending={shownPending}
                  notices={notices}
                  live={live}
                  busy={busy || pending !== null}
                  sessionStart={sessionStart.current}
                  showActions
                  onUndo={(id) => void act(() => undoAction(id))}
                  onOption={(messageId, option) => void send(option, newId(), messageId)}
                  onResend={(m: MessageView) =>
                    void send(m.text, m.client_message_id ?? newId(), m.reply_to_id)
                  }
                />
              </ScrollView>
              {/* A message scrolled up under the ways to start fades out there instead of a
                  hard-cut violet sliver (live finding 8). */}
              {!covered && threadTop > 0 ? <TopEdgeFade top={threadTop} /> : null}
              {pill ? (
                <Animated.View
                  entering={riseIn(0)}
                  exiting={fadeOut()}
                  pointerEvents="box-none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 12,
                    alignItems: 'center',
                  }}
                >
                  <View style={[{ borderRadius: 22 }, SHADOW.float]}>
                    <Btn
                      size="sm"
                      pill
                      variant="outline"
                      accessibilityLabel={t('buddy:thread.new_reply_label')}
                      onPress={() => {
                        haptic.tap();
                        threadBox.current.following = true;
                        setAtEnd(true);
                        scroll.current?.scrollToEnd({ animated: true });
                      }}
                    >
                      {`↓ ${t('buddy:thread.new_reply')}`}
                    </Btn>
                  </View>
                </Animated.View>
              ) : null}
            </>
          ) : (
            <ScrollView
              testID="scroll-home"
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'center',
                padding: 16,
                gap: 18,
              }}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={home.isRefetching}
                  onRefresh={() => void home.refetch()}
                />
              }
            >
              {/* Under a card on top the status line steps back instead of peeking out half hidden. */}
              <View
                style={{ opacity: greetingCovered ? 0 : 1 }}
                accessibilityElementsHidden={greetingCovered}
                importantForAccessibility={greetingCovered ? 'no-hide-descendants' : 'auto'}
              >
                {statusLine}
              </View>
              {/* The ring: Buddy in the middle, ways to start around it. */}
              <OrbitMenu
                items={orbitItems(h.next)}
                disabled={pending !== null}
                // Only Buddy in the middle: nothing that could run into the labels on a small phone.
                center={<BuddyOrb size={72} />}
              />
              {/* First visit: one sentence about Buddy; the ring above shows how to start. */}
              <Text
                style={[TYPE.body, { color: LB.ink2, textAlign: 'center', paddingHorizontal: 12 }]}
              >
                {t('buddy:intro.body')}
              </Text>
            </ScrollView>
          )}
        </View>
        <Composer
          disabled={pending !== null}
          writing={pending !== null}
          onStop={() => void stopReply()}
          onSend={(text) => send(text)}
          onPhoto={() => router.push('/capture')}
          onTalk={() => router.push('/talk')}
        />
      </KeyboardSafe>

      <Sheet
        visible={menuOpen}
        title={t('buddy:menu.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => setMenuOpen(false)}
      >
        {(
          [
            ['memory', '/memory'],
            ['library', '/library'],
            ['settings', '/settings'],
          ] as const
        ).map(([key, path]) => (
          <Btn
            key={key}
            variant="outline"
            full
            onPress={() => {
              setMenuOpen(false);
              router.push(path);
            }}
          >
            {t(`buddy:menu.${key}`)}
          </Btn>
        ))}
      </Sheet>

      <ChoiceSheet
        visible={choice !== null}
        title={t(choice === 'vocab' ? 'learn:vocab.title' : 'learn:homework.title')}
        body={t(choice === 'vocab' ? 'learn:vocab.body' : 'learn:homework.body')}
        onClose={() => setChoice(null)}
        choices={
          choice === 'vocab'
            ? [
                {
                  label: t('learn:vocab.photo'),
                  icon: 'camera',
                  onPress: () => fromChoice(() => router.push('/capture')),
                },
                {
                  label: t('learn:vocab.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('vocab')),
                },
              ]
            : [
                {
                  label: t('learn:homework.photo'),
                  icon: 'camera',
                  onPress: () =>
                    fromChoice(() =>
                      router.push({ pathname: '/capture', params: { purpose: 'homework' } }),
                    ),
                },
                {
                  label: t('learn:homework.type'),
                  icon: 'keyboard',
                  onPress: () => fromChoice(() => setTopic('help')),
                },
              ]
        }
      />
      <TopicSheet kind={topic} onClose={() => setTopic(null)} />
    </SafeAreaView>
  );
}

/** The quiet "Heute geübt ✓" beside the greeting: a mark of what she did, never a number. */
function PracticedToday({ label }: { label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: LB.mint,
      }}
    >
      <Icon name="check" size={13} color={LB.successText} />
      <Text style={[TYPE.label, { color: LB.successText }]}>{label}</Text>
    </View>
  );
}
