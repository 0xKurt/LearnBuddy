// The one screen, Buddy first: the one thing that matters now (if any), the
// one open decision, and the conversation — what Buddy did stands in it, with
// undo. Starting something is a tap on a suggestion, the camera, or just
// saying it. No lists, no menus to learn. docs/architecture.md §Home.
// Taps are direct API calls (no model); only free text goes to Buddy.
// Voice mode (speaker switch next to the menu): Buddy's reply to what she
// just sent is read aloud, and the mic is the composer's main control.
// At most one slim bar on top (≤ ~64 pt, issue #17) and one violet button; everything Buddy
// tells or asks stands in the conversation, which stands at its newest message unless she
// scrolled up to read (lib/homeLayout.ts, user feedback #6). The bar floats over the greeting
// and the row of ways to start and can be closed (components/buddy/TopOverlay.tsx): nothing
// below it moves when it comes or goes.
// While Buddy writes, the send button is "Stopp" (the turn ends stopped, §Turns); scrolled up to
// read, "↓ Neue Antwort" brings her to a reply that came meanwhile (lib/buddy/newReply.ts).
// A visit that begins a session — the app was started, or the break was long enough
// (lib/buddy/sessionAnchor.ts, lib/buddy/appStart.ts, issue #104) — ends the conversation with
// a greeting of Buddy's and opens on it: the greeting stands on top, everything earlier one
// swipe above. Client-side only; no model is asked and nothing is stored for it. That greeting
// names the practice she just finished when there is one, and then carries the way into it
// itself — the thread's one card in the greeting's own block, which says nothing twice (#195).
//
// This file puts the screen together (issue #311); each part has one job:
//   · lib/buddy/useHomeSend — what she writes and Buddy's reply (Stopp, Vorlesen);
//   · lib/buddy/useThreadFollow — where the conversation stands, "↓ Neue Antwort";
//   · lib/buddy/useSessionStart, homeThread — the greeting, and what the thread shows;
//   · lib/buddy/useHomePhotos, useHomeAct, useContactOptIn — photos, taps, the opt-in;
//   · components/buddy/HomeTop, HomeThread, HomeIntro, HomeNotices, StartSheets — what is drawn.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { router, useFocusEffect } from 'expo-router';
import { tapped } from '../lib/perf.js';
import { useShown } from '../lib/perfShown.js';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '../components/buddy/Composer.js';
import { Conversation } from '../components/buddy/Conversation.js';
import { DecisionCard } from '../components/buddy/DecisionCard.js';
import { Header } from '../components/buddy/Header.js';
import { HeaderMenu } from '../components/lb/HeaderMenu.js';
import { HomeIntro } from '../components/buddy/HomeIntro.js';
import { homeNotices } from '../components/buddy/HomeNotices.js';
import { HomeThread } from '../components/buddy/HomeThread.js';
import { HomeTop } from '../components/buddy/HomeTop.js';
import { greetingAction, homeScope } from '../components/buddy/extensions.js';
import { SendingSheetBubble } from '../components/buddy/SheetBubble.js';
import { StartSheets } from '../components/buddy/StartSheets.js';
import { Btn } from '../components/lb/Btn.js';
import { EDGE_FADE } from '../components/lb/EdgeFade.js';
import { Glow } from '../components/lb/Glow.js';
import { KeyboardSafe } from '../components/lb/KeyboardSafe.js';
import { LoadFailed } from '../components/lb/LoadFailed.js';
import { HomeSkeleton } from '../components/lb/Skeletons.js';
import { useAnnounce } from '../lib/announce.js';
import { newId } from '../lib/api/client.js';
import { answerContactOptIn, reportOutcome, undoAction } from '../lib/api/endpoints.js';
import { useHome } from '../lib/api/queries.js';
import { headState, useThreadRecording } from '../lib/buddy/headState.js';
import {
  greetingOnScreen,
  placeByTime,
  threadOnScreen,
  VISIBLE_MESSAGES,
} from '../lib/buddy/homeThread.js';
import { newestBuddyId, showNewReply } from '../lib/buddy/newReply.js';
import { greetingRoom } from '../lib/buddy/sessionAnchor.js';
import { useContactOptIn } from '../lib/buddy/useContactOptIn.js';
import { useHomeAct } from '../lib/buddy/useHomeAct.js';
import { useHomePhotos } from '../lib/buddy/useHomePhotos.js';
import { useHomeSend } from '../lib/buddy/useHomeSend.js';
import { useSessionStart } from '../lib/buddy/useSessionStart.js';
import { useThreadFollow } from '../lib/buddy/useThreadFollow.js';
import { useClosedCard } from '../lib/homeCard.js';
import { homeLayout, homeTop, topKey } from '../lib/homeLayout.js';
import { askAttach } from '../lib/capture/attachRequest.js';
import { useSendingInThread } from '../lib/capture/sending.js';
import { SPACE } from '../lib/theme/space.js';
import { warmRecognition } from '../lib/speech/recognize.js';
import { voiceLocale } from '../lib/speech/voice.js';
import { currentLocale } from '../lib/i18n/index.js';
import { useTheme } from '../lib/theme/ThemeProvider.js';

export default function BuddyScreen() {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'common']);
  const home = useHome();
  const { busy, act } = useHomeAct();
  const { left } = useHomePhotos();
  // What a domain keeps around the whole screen from its first frame (its sheets' pages): the
  // same element in both returns below, so loading and loaded are one instance.
  const Scope = homeScope.get() ?? Unscoped;
  const scoped = (screen: ReactNode) => <Scope h={home.data}>{screen}</Scope>;
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
  // Back from a practice: the chat on screen again (issue #711).
  useShown('practice_close', focusedScreen);
  const [menuOpen, setMenuOpen] = useState(false);
  /** She is writing or dictating a message (the Composer says so): the head's orb listens. */
  const [typing, setTyping] = useState(false);
  const [attached, setAttached] = useState(false);
  // The recogniser's service, languages and permission answer are made ready while she sees the
  // home, not only on her tap on Talk (#686, KI-Audit E-F9): the first listen no longer waits for
  // them. Process-wide and quiet (no dialog), so once per start of the app is enough.
  useEffect(() => warmRecognition(voiceLocale(currentLocale())), []);
  const recording = useThreadRecording((s) => s.on);
  const thread = home.data?.thread;
  const newestReply = thread ? newestBuddyId(thread) : null;
  const follow = useThreadFollow(newestReply);
  const { pending, live, send, stopReply } = useHomeSend({ thread, onSend: follow.followNext });
  // Her sheet from the tap on "Senden" until her stored message is there (issue #632).
  const sending = useSendingInThread(thread);
  const enableContact = useContactOptIn(home.data, act);
  const sessionStart = useSessionStart(home);

  // The card on top, unless she closed it on this phone (until it says something else).
  const closedCard = useClosedCard((s) => s.closed);
  const closeCard = useClosedCard((s) => s.close);
  const cardKey = home.data ? topKey(home.data) : null;
  const openCard = cardKey !== null && cardKey !== closedCard ? cardKey : null;
  // It lies over the greeting: VoiceOver hears that it came (Android and the web read its
  // live region).
  useAnnounce(openCard ? t('buddy:card.shown') : null, { key: openCard ?? undefined });
  /** How tall the card lying over the conversation is (0 = none); the greeting clears it. */
  const [cardHeight, setCardHeight] = useState(0);
  const [undoError, setUndoError] = useState<{ actionId: string; text: string } | null>(null);

  // A failed background refresh keeps what is on screen (audit M-71); the error screen is
  // only for a home that never loaded.
  if (home.isPending || (home.isError && !home.data)) {
    return scoped(
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
        <Glow />
        {/* The head is there before the home is (design ui_kits/app/Extra.jsx `SystemState`):
            Buddy thinks, and ⋯ already leads to the places — the ways to start need the home. */}
        <Header state="think" onMenu={() => setMenuOpen(true)} />
        {home.isPending ? (
          <HomeSkeleton label={t('common:loading')} />
        ) : (
          <LoadFailed
            error={home.error}
            busy={home.isRefetching}
            onRetry={() => void home.refetch()}
          />
        )}
        <HeaderMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
      </SafeAreaView>,
    );
  }

  const h = home.data;
  const greeting = greetingOnScreen(h, sessionStart);
  const layout = homeLayout(h, closedCard, greeting.shown ? (sessionStart?.tells ?? null) : null);
  // What Buddy tells at the end of the conversation, with its buttons: nothing on top moves.
  // The violet button belongs to the bar on top when there is one.
  const quiet = layout.bar ? 'soft' : 'primary';
  const timed = homeNotices({
    h,
    layout,
    left,
    busy,
    quiet,
    act,
    decision: h.decision ? (
      <DecisionCard
        key="decision"
        decision={h.decision}
        busy={busy}
        quiet={quiet}
        onOptIn={(enable) =>
          enable ? void enableContact(false) : void act(() => answerContactOptIn(false))
        }
        onAdultOptIn={() => void enableContact(true)}
        onOutcome={(goalId, outcome) => void act(() => reportOutcome(goalId, outcome))}
      />
    ) : null,
  });
  const { messages, captureUndo, carriedOnTop } = threadOnScreen(h, layout);
  // Each notice at its own moment among the messages (issue #630); what is about now ends it.
  const placed = placeByTime(messages, timed);
  // What is about now ends the conversation; her sheet on its way is the newest of it.
  const notices = sending
    ? [...placed.end, <SendingSheetBubble key="sending" sheet={sending} />]
    : placed.end;
  // Hide the optimistic bubble once the server has the message.
  const shownPending =
    pending && !h.thread.some((m) => m.client_message_id === pending.id)
      ? { text: pending.text }
      : null;
  /**
   * The empty page she opens on (issue #104): while nothing has happened since the greeting,
   * its block is given the height of the view, so the conversation standing at its end puts
   * the greeting on top with the rest free — everything earlier is one swipe above, deleted
   * and hidden from nothing. The room goes the moment something stands after the greeting:
   * she sent a message, or Buddy has something to tell (a notice) — what is said last has to
   * be what she sees, so then the conversation ends as it always did.
   */
  const greetingOpens =
    sessionStart !== null &&
    sessionStart.afterMessageId === h.thread[h.thread.length - 1]?.id &&
    shownPending === null &&
    live === null &&
    notices.length === 0;
  // The block ends at the bottom of the view, so a SHORTER block puts the greeting FURTHER
  // down. It has to clear two things, not one: the thread's own bottom padding and the
  // 28 pt fade that lies over the view's top edge — without the fade in this sum the
  // greeting's first line was drawn underneath it (owner twice: "die sprechblase am oberen
  // rand ist ein bisschen verdeckt", issue #129).
  // …and a card lying on top is the third thing: it is drawn over the conversation, so
  // without its height in this sum "Weiterüben" was painted straight across the greeting
  // (owner 01.10.: "meldungen wie die uebung wieter zu machen verdecken die willkommens
  // nachricht", issue #190). The block only shrinks while a card is actually open.
  const sessionRoom = greetingOpens
    ? greetingRoom(follow.view, SPACE.sm + EDGE_FADE + cardHeight)
    : 0;

  // "↓ Neue Antwort": she scrolled up and Buddy answered (or is writing) meanwhile.
  const pill = showNewReply(follow.seen, follow.atEnd, newestReply, live !== null);

  // Once there is a conversation, it gets the room; the ring shrinks to a row.
  const talking = messages.length > 0 || shownPending !== null || notices.length > 0;
  const refetch = () => void home.refetch();

  return scoped(
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: palette.bg }}>
      <Glow />
      <KeyboardSafe style={{ flex: 1 }} enabled={focusedScreen}>
        {/* Buddy, his name, and one way into everything else (issue #174). The owner drew
            it: orb left, LearnBuddy beside it, three dots right. The row of four circles
            that used to stand here moved into those dots. In the thread only his newest line
            carries the mini orb (`ThreadOrb`, design components/buddy/Message.jsx). */}
        <Header
          // What Buddy is doing, from the same facts the thread uses (issue #179):
          // `pending` alone said idle while the answer was being written.
          state={headState({
            sending: pending !== null,
            working: h.thread.some((m) => m.role === 'learner' && m.status === 'processing'),
            streaming: live !== null,
            // Buddy is reading a sheet she sent (design ui_kits/app/Flows.jsx `ChatState`).
            reading: homeTop.get()?.reading(h) ?? false,
            // She is writing or dictating in the Composer: Buddy leans in.
            typing,
            // Her talk is being recorded on the rehearsal card.
            recording,
          })}
          onMenu={() => setMenuOpen(true)}
        />
        {/* The card on top keeps its room: attached pages below never push the bar over it. */}
        <View style={{ flex: 1, minHeight: cardHeight }}>
          {/* What matters now lies on top, over the greeting and the ways to start: it never
            pushes them down, and she can close it (only on this phone). */}
          <HomeTop
            h={h}
            layout={layout}
            openCard={openCard}
            busy={busy}
            act={act}
            captureUndo={captureUndo}
            onClose={closeCard}
            onHeight={setCardHeight}
          />
          {talking ? (
            <HomeThread
              h={h}
              follow={follow}
              pill={pill}
              cardHeight={cardHeight}
              refreshing={home.isRefetching}
              onRefresh={refetch}
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
                placed={placed}
                live={live}
                busy={busy || pending !== null}
                sessionStart={
                  sessionStart && {
                    afterMessageId: sessionStart.afterMessageId,
                    text: sessionStart.text,
                    // What the greeting itself offers: the practice it just named, in full.
                    action:
                      greeting.shown && sessionStart.tells !== null
                        ? (greetingAction.get()?.(h, sessionStart.tells, { busy, quiet }) ?? null)
                        : null,
                  }
                }
                sessionRoom={sessionRoom}
                showActions
                // One action chooser per turn; factual receipt words remain plain text.
                receipts="turn"
                carriedOnTop={carriedOnTop}
                quiet={quiet}
                undoError={undoError}
                onUndo={(id) => {
                  setUndoError(null);
                  void act(
                    () => undoAction(id),
                    (text) => setUndoError({ actionId: id, text }),
                  );
                }}
                onOption={(messageId, option) => void send(option, newId(), messageId)}
                onResend={(m: MessageView) =>
                  void send(m.text, m.client_message_id ?? newId(), m.reply_to_id)
                }
              />
            </HomeThread>
          ) : (
            <HomeIntro
              h={h}
              refreshing={home.isRefetching}
              onRefresh={refetch}
              onSend={(text) => void send(text)}
              onPhoto={() => askAttach({ open: 'camera' })}
              pages={attached}
            />
          )}
        </View>
        <Composer
          disabled={pending !== null}
          writing={pending !== null}
          onStop={() => void stopReply()}
          onSend={(text) => send(text)}
          onTalk={() => {
            // The recogniser binds its service while Talk opens, not after (#644).
            warmRecognition(voiceLocale(currentLocale()));
            // Talk opened until the mic listens (#649), on the phone in lb-perf.
            tapped('talk_open');
            router.push('/talk');
          }}
          onTyping={setTyping}
          onAttached={setAttached}
        />
      </KeyboardSafe>

      <StartSheets
        menuOpen={menuOpen}
        onCloseMenu={() => setMenuOpen(false)}
        next={h.next}
        send={(text) => void send(text)}
        canStart={pending === null}
      />
    </SafeAreaView>,
  );
}

/** No domain around the home: the screen as it is. */
function Unscoped({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
