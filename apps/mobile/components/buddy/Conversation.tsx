// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them — and the one state that is the
// same under every one of them ("nur hier in der App") is said once, under the newest.
// What Buddy did with a message stands right under it as ONE receipt for the turn, not one
// line per action (issue #204). Chat and History expose a separate action chooser per turn;
// receipt words remain factual text. Where a new day starts
// a quiet line names it (never how many days passed). Where a new session starts
// Buddy greets her in a bubble of his own (issue #104) and, with the room the screen
// gives it, that greeting is what the view opens on. Where the greeting tells about something
// she can look at — the practice she just finished — its button rides with that bubble
// (`sessionStart.action`, issue #195), not in a second card repeating it.
// Buddy's lines are plain text beside his mini orb — the orb stands at the newest one only, older
// lines keep its column (design components/buddy/Message.jsx, #599); what hangs under a line is
// drawn by ./ThreadParts.tsx.
// Motion: what arrives fades in with a small rise (the bubble first, then its
// cards and chips, subtly staggered); what was already there when the screen
// opened stands still, and neighboring content reflows immediately. A long
// press on a message opens "Kopieren" / "Vorlesen" (MessageMenu).

import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { Platform, Text, View } from 'react-native';
import { Appear, Rise } from '../lb/Motion.js';
import { UI } from '../../lib/theme/components.js';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { PressArea } from '../lb/PressArea.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { CHAT } from '../../lib/theme/chat.js';
import { AreaCard } from './AreaCard.js';
import { ConfirmCard } from './ConfirmCard.js';
import { deliveryText, describeAction, onlyInApp } from './describe.js';
import { actionCard, addActionCard, hasCard, messageCard, readAlong } from './extensions.js';
import { i18n } from '../../lib/i18n/index.js';
import { dayBreaks, formatDay, localDateOf } from '../../lib/time.js';
import { closedStream, markdownPlain } from '../../lib/buddy/markdown.js';
import { haptic } from '../../lib/haptics.js';

import { MessageMenu, type MenuMessage } from './MessageMenu.js';
import { RichText } from './RichText.js';
import { UndoSheet } from './UndoSheet.js';
import {
  BuddyLine,
  Receipt,
  receiptIcon,
  ReplyOptions,
  TakeBack,
  UNDER_LINE,
} from './ThreadParts.js';
import { TypingBubble } from './TypingBubble.js';
import { useReveal } from './useReveal.js';

import { SPACE } from '../../lib/theme/space.js';
import { useSay } from '../../lib/speech/say.js';

// The core's own cards; a domain adds its offers, its roleplay and its rehearsal the same way
// (components/buddy/extensions.ts, lib/learning/register.tsx).
addActionCard('open_area', (s) => <AreaCard area={s.area} />);
// Nothing is deleted until she answers this (issue #151).
addActionCard('confirm_delete', (s) => <ConfirmCard confirm={s} />);

/** One empty set for "nothing is carried on top": a fresh one each render is a new prop. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * What Buddy DID in this turn (the ✓ receipt). Offers are not done yet, and a proposed
 * deletion is a question waiting for her — both have a card of their own. What has neither a
 * card nor words (a domain's tool without that domain) is not shown at all.
 */
function receiptOf(m: MessageView): MessageView['actions'] {
  return m.actions.filter((a) => !hasCard(a.summary.tool) && describeAction(a.summary) !== '');
}

/** Still takeable back right now. */
function takeableBack(a: MessageView['actions'][number]): boolean {
  return a.undoable && a.status !== 'undone';
}

/**
 * Whether this message's delivery line would read "nur hier in der App" — the one state that
 * is the same under every such message, and therefore said once (issue #204). Opened, sent,
 * failed and the rest stay with their own message: those are facts about that one message.
 */
function saysOnlyInApp(m: MessageView): boolean {
  return m.outreach?.status === 'in_app' && m.outreach.opened_at === null;
}

type Props = {
  messages: MessageView[];
  /** Local message being sent right now (optimistic). */
  pending: { text: string } | null;
  /** What Buddy tells now, with buttons (NoticeBubble), after the messages. */
  notices?: ReactNode[];
  /**
   * Buddy's reply while it is still being written (only for an answer that changes
   * nothing — docs/architecture.md §Speed); the stored message replaces it.
   */
  live?: string | null;
  busy: boolean;
  showActions?: boolean;
  /** Whether Buddy may message her phone (agreed reminders say where they arrive). */
  contactOn?: boolean;
  /** Quick answers and "Nochmal senden"; left out (History), they are not shown at all. */
  onOption?: (messageId: string, option: string) => void;
  onResend?: (message: MessageView) => void;
  /**
   * A fresh page when she comes back (issues #34, #104): Buddy's greeting goes after this
   * message, so everything older sits above it and the new turn starts below.
   * Null = the conversation just goes on.
   *
   * `action`: what the greeting itself offers, where it tells about something she can look at
   * — the practice she just finished (issue #195). It rides with the bubble instead of
   * standing in a second card that says the same thing.
   */
  sessionStart?: { afterMessageId: string; text: string; action?: ReactNode } | null;
  /**
   * How much room the greeting's block gets (issue #104): the thread stands at its end, so a
   * block as tall as the view puts the greeting at the top and leaves the rest free — the
   * empty page she opens on (lib/buddy/sessionAnchor.ts `greetingRoom`). 0 or absent: the
   * greeting simply closes the conversation, as the line did.
   */
  sessionRoom?: number;
  /** Undo one of Buddy's actions (only offered where the API says it still applies). */
  onUndo?: (actionId: string) => void;
  undoError?: { actionId: string; text: string } | null;
  /** Undo is locked while this is true (default: busy); history locks only while undoing. */
  undoBusy?: boolean;
  /** 'turn': combined receipt; 'step': individual receipts. Both use one action chooser. */
  receipts?: 'turn' | 'step';
  /**
   * Action ids whose receipt the bar on top already says word for word (issue #204, the
   * prepared practice): their line leaves the conversation while that bar stands — closing
   * the bar brings the factual line back; the action remains in the turn chooser.
   */
  carriedOnTop?: ReadonlySet<string>;
  /**
   * The conversation is being spoken (app/talk.tsx, issue #18): Buddy's newest bubble
   * follows his voice — the sentence being read stands out (`readAlong`, a domain's) — and a
   * tapped offer keeps the voice on (its card's `spoken`, issue #40).
   */
  spoken?: boolean;
  /**
   * Whether Buddy's typing bubble may show while a turn is underway (default yes). Talk
   * hides it while she is still speaking: her forming words are no writing of Buddy's.
   */
  showTyping?: boolean;
};

const Entrance = Platform.OS === 'web' ? Appear : Rise;

export function Conversation({
  messages,
  contactOn,
  pending,
  notices = [],
  live = null,
  busy,
  showActions = false,
  sessionStart = null,
  sessionRoom = 0,
  onOption,
  onResend,
  onUndo,
  undoBusy,
  undoError = null,
  receipts = 'step',
  carriedOnTop = EMPTY_IDS,
  // The screen labels of each message use `spoken` inside the map: bind the prop apart.
  spoken: spokenMode = false,
  showTyping = true,
}: Props) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  // Match initial-subtree skipping: later mounted descendants may still enter.
  const committed = useRef(false);
  useEffect(() => {
    committed.current = true;
  }, []);
  const { t } = useTranslation('buddy');
  // Screen readers hear formulas in words, not raw LaTeX (p2-buddy-bubble-a11y-reads-raw-latex).
  const say = useSay();
  const ReadAlong = readAlong.get();
  const [menu, setMenu] = useState<MenuMessage | null>(null);
  /** Only the chosen sheet action shows request progress. */
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const undoLocked = undoBusy ?? busy;
  const [undoTurnId, setUndoTurnId] = useState<string | null>(null);
  const undoStarted = useRef<string | null>(null);
  const undoTurn = messages.find((m) => m.id === undoTurnId);
  // A failed request remains retryable once its controller unlocks.
  // so a later send does not show progress on a completed undo request.
  useEffect(() => {
    if (!undoLocked) {
      setUndoingId(null);
      undoStarted.current = null;
    }
  }, [undoLocked]);
  useEffect(() => {
    if (undoTurnId !== null && !undoTurn) {
      setUndoTurnId(null);
      undoStarted.current = null;
    }
    if (
      undoStarted.current &&
      undoTurn?.actions.find((a) => a.id === undoStarted.current)?.status === 'undone'
    )
      undoStarted.current = null;
  }, [undoTurnId, undoTurn]);
  const undo = (id: string) => {
    const action = undoTurn?.actions.find((a) => a.id === id);
    if (!onUndo || undoLocked || undoStarted.current || !action || !takeableBack(action)) return;
    undoStarted.current = id;
    setUndoingId(id);
    try {
      onUndo(id);
    } catch (error) {
      undoStarted.current = null;
      setUndoingId(null);
      throw error;
    }
  };
  const last = messages[messages.length - 1];
  const lastBuddy = [...messages].reverse().find((m) => m.role === 'buddy');
  const breaks = dayBreaks(messages.map((m) => m.created_at));
  const thinking =
    pending !== null || messages.some((m) => m.role === 'learner' && m.status === 'processing');
  const shownLive = useReveal(thinking && live ? closedStream(live) : null);
  // Buddy's orb stands beside the newest thing he says, once: the reply being written and the
  // typing dots bring their own, and a greeting that closes the thread is his newest line.
  const greets =
    sessionStart !== null && messages.some((m) => m.id === sessionStart.afterMessageId);
  const orbAt = thinking || greets ? null : (lastBuddy?.id ?? null);
  // What was on screen as "being sent" or "being written" does not come in a second time
  // when the stored message takes its place.
  const onScreen = useRef<{ pending: string | null; live: string | null }>({
    pending: null,
    live: null,
  });
  const arrivedInPlace = (m: MessageView): boolean => {
    const was = m.role === 'learner' ? onScreen.current.pending : onScreen.current.live;
    return was !== null && m.text.trim().startsWith(was.trim().slice(0, 40));
  };
  const enters = committed.current;
  const enterOf = (m: MessageView) => enters && !arrivedInPlace(m);

  /** What a step that was taken back reads like now. */
  const undoneText = (a: MessageView['actions'][number]): string =>
    a.summary.tool === 'request_material'
      ? t('action.request_material_undone', { title: a.summary.title })
      : `${describeAction(a.summary)} – ${t('done.undone')}`;
  // "nur hier in der App" is explained once, not under every card (issue #204): under the
  // newest receipt it applies to, and under the newest of Buddy's messages that only ever
  // existed here. Everything older carries the same truth without repeating the sentence.
  const inAppReceipt =
    messages.filter((m) => receiptOf(m).some((a) => onlyInApp(a.summary, { contactOn }))).at(-1)
      ?.id ?? null;
  const inAppDelivery = messages.filter(saysOnlyInApp).at(-1)?.id ?? null;

  const canTakeBack = (m: MessageView): boolean =>
    showActions && onUndo !== undefined && m.actions.some(takeableBack);
  /** Why her message was not answered, and the way to send it again. */
  const failedLine = (m: MessageView): ReactNode => {
    if (m.role !== 'learner' || m.status !== 'failed') return null;
    const stopped = m.failure_code === 'stopped';
    return (
      <Entrance
        animate={enters}
        index={0}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
      >
        {/* It arrived: say why it was not answered (CLAUDE.md rule 5). Stopped by
            her is no failure: said calmly, not in red. */}
        <Text style={[TYPE.small, { color: stopped ? palette.ink2 : palette.danger }]}>
          {failedLabel(m.failure_code)}
        </Text>
        {/* Resending cannot help once today's allowance is used up. */}
        {m.failure_code === 'budget' || !onResend ? null : (
          <Btn
            size="sm"
            variant="outline"
            onPress={() => {
              haptic.tap();
              onResend(m);
            }}
            disabled={busy}
          >
            {t('thread.resend')}
          </Btn>
        )}
      </Entrance>
    );
  };

  const view = (
    // One rhythm for the thread (ui_kits/app/Chat.jsx:16, `gap: 16`): lines, cards, receipts and
    // chips stand lg apart. Only what belongs to one piece sits closer: a line's own status (xs),
    // and the way back, whose 44 pt target reaches into the gap above it.
    <View style={{ gap: SPACE.lg }}>
      {messages.map((m, index) => {
        const mine = m.role === 'learner';
        const day = breaks[index] ?? null;
        // One turn, one receipt (issue #204): what the bar on top already says has no line.
        const done = receiptOf(m).filter((a) => !carriedOnTop.has(a.id));
        const applied = done.filter((a) => a.status !== 'undone');
        const takenBack = done.filter((a) => a.status === 'undone');
        const spoken = `${mine ? t('thread.you') : t('thread.buddy')}: ${say(markdownPlain(m.text, { spoken: true }))}`;
        const opensHere = sessionStart?.afterMessageId === m.id;
        // A message a domain draws itself: the feedback after a roleplay or what a rehearsal
        // measured, as the "So lief's" list (issues #264, #384). The text stays for reading
        // aloud and copying.
        const own = messageCard(m);
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'stretch', gap: SPACE.lg }}>
            {day ? <DayLine day={day} /> : null}
            {/* A line and what is only about that line: one piece. It takes the thread's whole
                width, so her bubble's share (82 %) is a share of the thread, not of itself. */}
            <View
              style={{
                alignSelf: 'stretch',
                alignItems: mine ? 'flex-end' : 'stretch',
                gap: SPACE.xs,
              }}
            >
              {own ? (
                <Entrance animate={enterOf(m)} style={{ width: CHAT.cardWidth }}>
                  {own}
                </Entrance>
              ) : (
                <Entrance
                  animate={enterOf(m)}
                  // Her bubble is as wide as her words, up to its share of the thread: a row
                  // lets it shrink to them (a column squeezed "danke" into two lines).
                  style={
                    mine
                      ? { flexDirection: 'row', maxWidth: CHAT.mineWidth }
                      : { alignSelf: 'stretch' }
                  }
                >
                  <Line orb={mine ? null : m.id === orbAt}>
                    <PressArea
                      accessibilityRole="text"
                      accessibilityLabel={spoken}
                      accessibilityHint={t('thread.message_hint')}
                      accessibilityActions={[
                        { name: 'copy', label: t('message.copy') },
                        ...(mine ? [] : [{ name: 'speak', label: t('message.speak') }]),
                      ]}
                      onAccessibilityAction={(e) => {
                        if (
                          e.nativeEvent.actionName === 'copy' ||
                          e.nativeEvent.actionName === 'speak'
                        )
                          setMenu({ text: m.text, role: m.role });
                      }}
                      onLongPress={() => {
                        haptic.tap();
                        setMenu({ text: m.text, role: m.role });
                      }}
                      delayLongPress={CHAT.longPress}
                      style={{ flexShrink: 1 }}
                    >
                      {(pressed) => (
                        <View
                          style={[
                            mine ? CHAT.mine : null,
                            {
                              backgroundColor: mine
                                ? m.status === 'failed'
                                  ? palette.canvas
                                  : palette.primary
                                : undefined,
                              borderWidth: mine && m.status === 'failed' ? CHAT.failedBorder : 0,
                              borderColor: palette.danger,
                              borderStyle: 'dashed',
                              borderBottomRightRadius: mine ? CHAT.tail : undefined,
                              borderBottomLeftRadius: mine ? CHAT.mine.borderRadius : undefined,
                              opacity: pressed ? CHAT.pressedOpacity : 1,
                              transform: [{ scale: pressed && !reduced ? CHAT.pressedScale : 1 }],
                            },
                          ]}
                        >
                          {m.outreach ? (
                            // The outreach title remains attached to its message.
                            <Text style={[TYPE.label, { marginBottom: CHAT.titleGap }]}>
                              {m.outreach.title}
                            </Text>
                          ) : null}
                          {!mine && spokenMode && m === lastBuddy && ReadAlong ? (
                            <ReadAlong text={m.text} style={[TYPE.body, { color: palette.ink }]} />
                          ) : (
                            <RichText
                              text={m.text}
                              style={[
                                TYPE.body,
                                {
                                  color:
                                    mine && m.status !== 'failed' ? palette.onPrimary : palette.ink,
                                },
                              ]}
                            />
                          )}
                        </View>
                      )}
                    </PressArea>
                  </Line>
                </Entrance>
              )}
              {/* What really happened to a message Buddy also sent outside the app. "Nur hier
                in der App" is the one state that is the same for every one of them, so it is
                said once — under the newest (issue #204); it used to stand under every card. */}
              {m.outreach && (m.id === inAppDelivery || !saysOnlyInApp(m)) ? (
                <Text style={[TYPE.small, TYPE.meta, UNDER_LINE]}>{deliveryText(m.outreach)}</Text>
              ) : null}
              {failedLine(m)}
            </View>
            {m.actions.map((a) => {
              const card = actionCard(a, spokenMode);
              return card ? (
                <Entrance
                  key={a.id}
                  animate={enters}
                  index={1}
                  // A card takes the thread's whole width, a turn's gap under its sentence — a
                  // card glued to its sentence was the complaint (owner 28.09., issue #51).
                  style={{ width: CHAT.cardWidth }}
                >
                  {card}
                </Entrance>
              ) : null;
            })}
            {showActions && done.length > 0 ? (
              // The receipt and its way back are one piece, under the line's text (issue #191:
              // the whole sentence, never clipped to its first word).
              <Entrance animate={enters} index={1} style={[UNDER_LINE, { gap: SPACE.sm }]}>
                {/* One turn, one receipt (issue #204). Two things done in one answer used
                    to be two ticks, two sentences and two "Rückgängig" under each other —
                    "das sind drei Rückgängig-Knöpfe und vier Statuszeilen für zwei Dinge,
                    die sie getan hat". In the chat the turn now says what it did in one
                    line with one way back; History keeps a line per step, because looking
                    back at the single steps is what she opens it for. */}
                {receipts === 'turn' ? (
                  <>
                    {applied.length > 0 ? (
                      <Receipt
                        icon={receiptIcon(toolsOf(applied), false)}
                        text={applied.map((a) => describeAction(a.summary)).join(' · ')}
                      />
                    ) : null}
                    {takenBack.length > 0 ? (
                      <Receipt
                        icon={receiptIcon(toolsOf(takenBack), true)}
                        text={takenBack.map(undoneText).join(' · ')}
                      />
                    ) : null}
                  </>
                ) : (
                  done.map((a) => (
                    <Receipt
                      key={a.id}
                      icon={receiptIcon([a.summary.tool], a.status === 'undone')}
                      text={a.status === 'undone' ? undoneText(a) : describeAction(a.summary)}
                    />
                  ))
                )}
                {/* Said once, not under every card (issue #204): that what was agreed can
                    only reach her here, because messages to the phone are off. */}
                {m.id === inAppReceipt ? (
                  <Text style={[TYPE.small, TYPE.meta, { color: palette.ink2 }]}>
                    {t('done.in_app_only')}
                  </Text>
                ) : null}
              </Entrance>
            ) : null}
            {canTakeBack(m) ? (
              <TakeBack
                label={t('done.take_back')}
                disabled={undoLocked}
                onPress={() => setUndoTurnId(m.id)}
              />
            ) : null}
            {onOption && m === last && m.role === 'buddy' && m.options && m.options.length > 0 ? (
              <ReplyOptions
                options={m.options}
                disabled={busy}
                onPick={(option) => {
                  haptic.tap();
                  onOption(m.id, option);
                }}
                wrap={(chip, i, key) => (
                  <Entrance
                    key={key}
                    animate={enters}
                    index={Math.min(2 + i, UI.entrance.staggerCap)}
                  >
                    {chip}
                  </Entrance>
                )}
              />
            ) : null}
            {opensHere ? (
              <SessionGreeting
                orb={!thinking}
                text={sessionStart!.text}
                room={sessionRoom}
                action={sessionStart!.action}
              />
            ) : null}
          </View>
        );
      })}
      {notices.map((n, i) => (
        <Entrance
          key={isValidElement(n) && n.key !== null ? n.key : `notice-${i}`}
          animate={enters}
          index={1}
        >
          {n}
        </Entrance>
      ))}
      {pending ? (
        <Entrance key="pending" animate={enters} index={0} style={{ alignItems: 'flex-end' }}>
          <View
            style={[
              CHAT.mine,
              {
                maxWidth: CHAT.mineWidth,
                backgroundColor: palette.primary,
                borderBottomRightRadius: CHAT.tail,
                opacity: CHAT.pendingOpacity,
              },
            ]}
          >
            <Text style={[TYPE.body, { color: palette.onPrimary }]}>{pending.text}</Text>
          </View>
        </Entrance>
      ) : null}
      {thinking && shownLive ? (
        <Entrance key="live" animate={enters} index={0}>
          <BuddyLine orb>
            <View accessibilityLiveRegion="polite">
              <RichText text={shownLive} style={[TYPE.body, { color: palette.ink }]} />
            </View>
          </BuddyLine>
        </Entrance>
      ) : thinking && showTyping ? (
        // Buddy is thinking: his mini orb and the dots (the text is for screen readers).
        <TypingBubble key="typing" label={t('thread.typing')} />
      ) : null}
      <UndoSheet
        error={
          undoError && undoTurn?.actions.some((a) => a.id === undoError.actionId)
            ? undoError.text
            : null
        }
        visible={undoTurn !== undefined}
        rows={(undoTurn?.actions ?? [])
          .filter((a) => takeableBack(a) || a.status === 'undone')
          .map((a) => ({
            id: a.id,
            title: describeAction(a.summary),
            undone: a.status === 'undone',
            busy: undoLocked && undoingId === a.id,
            disabled: undoLocked,
          }))}
        onClose={() => setUndoTurnId(null)}
        onUndo={undo}
      />
      <MessageMenu message={menu} onClose={() => setMenu(null)} />
    </View>
  );
  // Remember what stands on screen now, for the stored message that replaces it.
  if (pending) onScreen.current.pending = pending.text;
  if (thinking && live) onScreen.current.live = live;
  // What was there when the conversation opened stands still; only what arrives moves.
  return view;
}

/** Her bubble stands alone at the right; Buddy's line gets his orb's column. */
function Line({ orb, children }: { orb: boolean | null; children: ReactNode }) {
  return orb === null ? children : <BuddyLine orb={orb}>{children}</BuddyLine>;
}

type Tool = MessageView['actions'][number]['summary']['tool'];

/** The tools a receipt speaks for: they choose its sign. */
function toolsOf(actions: MessageView['actions']): Tool[] {
  return actions.map((a) => a.summary.tool);
}

/**
 * Where this visit starts (issues #34, #104): Buddy wakes up and says hello — his own bubble,
 * looking like everything else he says, so it reads as being greeted and not as a divider.
 * It lives on this phone only: nothing is stored, nothing was asked of the model.
 * `room`: the height the block takes so the greeting stands at the top of the view and the
 * rest of it is free (the screen passes it while nothing follows the greeting). Everything
 * older is then one swipe above — hidden from neither eye nor screen reader.
 * `action`: a button the greeting itself carries — "Ansehen" for the practice it just named
 * (issue #195). Flush with the bubble's left edge, the same place a notice puts its answers.
 */
function SessionGreeting({
  text,
  orb,
  room = 0,
  action = null,
}: {
  text: string;
  /** His newest line carries the orb; while he is writing, the dots do. */
  orb: boolean;
  room?: number;
  action?: ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  return (
    <View
      // Stretch: the block above aligns to her side when she spoke last; the greeting is
      // Buddy's and starts at the left whatever came before it.
      // sm between the line and its button: they are one piece.
      style={{ alignSelf: 'stretch', minHeight: room, gap: SPACE.sm }}
    >
      <BuddyLine orb={orb}>
        <View accessibilityRole="text" accessibilityLabel={`${t('thread.buddy')}: ${text}`}>
          <Text style={[TYPE.body, { color: palette.ink }]}>{text}</Text>
        </View>
      </BuddyLine>
      {action ? (
        // Under the line's text — like the chips under a message.
        <View style={[UNDER_LINE, { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }]}>
          {action}
        </View>
      ) : null}
    </View>
  );
}

/** The day a part of the conversation is from: "Heute", "Gestern", or "Montag, 28. September". */
export function DayLine({ day }: { day: string }) {
  const { palette } = useTheme();
  const { t, i18n: i } = useTranslation('buddy');
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const label =
    day === localDateOf(now)
      ? t('thread.today')
      : day === localDateOf(yesterday)
        ? t('thread.yesterday')
        : formatDay(day, i.language);
  return (
    <Text
      accessibilityRole="header"
      style={[
        TYPE.small,
        TYPE.meta,
        { alignSelf: 'center', color: palette.ink2, marginVertical: SPACE.xs },
      ]}
    >
      {label}
    </Text>
  );
}

/** Why a stored message was not answered; "not arrived" only when nothing is known. */
function failedLabel(code: string | null): string {
  const key = `buddy:thread.failed_reason.${code ?? 'internal'}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('buddy:thread.failed');
}
