// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them — and the one state that is the
// same under every one of them ("nur hier in der App") is said once, under the newest.
// What Buddy did with a message stands right under it as ONE receipt for the turn, not one
// line per action (issue #204): in the chat (`undoScope="last"`) the newest step carries
// "Rückgängig" and everything older is a tap on a receipt away (UndoSheet), so three buttons
// stop stacking up while nothing becomes unreachable; History keeps a line and a way back per
// step, which is what she opens it for. Where a new day starts
// a quiet line names it (never how many days passed). Where a new session starts
// Buddy greets her in a bubble of his own (issue #104) and, with the room the screen
// gives it, that greeting is what the view opens on. Where the greeting tells about something
// she can look at — the practice she just finished — its button rides with that bubble
// (`sessionStart.action`, issue #195), not in a second card repeating it.
// Motion: what arrives fades in with a small rise (the bubble first, then its
// cards and chips, subtly staggered); what was already there when the screen
// opened stands still, and the list glides when something is added. A long
// press on a message opens "Kopieren" / "Vorlesen" (MessageMenu).

import { isValidElement, useRef, useState, type ReactNode } from 'react';
import { speakMathText } from '../../lib/math/speak.js';
import { useSpokenWords } from '../math/useSpokenMath.js';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { Pressable, Text, View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';
import { OfferCard } from '../learn/OfferCard.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { AreaCard } from './AreaCard.js';
import { ConfirmCard } from './ConfirmCard.js';
import { RoleplayCard } from './RoleplayCard.js';
import { deliveryText, describeAction, onlyInApp } from './describe.js';
import { UndoSheet } from './UndoSheet.js';
import { i18n } from '../../lib/i18n/index.js';
import { dayBreaks, formatDay, localDateOf } from '../../lib/time.js';
import { closedStream, markdownPlain } from '../../lib/buddy/markdown.js';
import { haptic } from '../../lib/haptics.js';
import { glide, riseIn } from '../../lib/theme/enter.js';
import { MessageMenu, type MenuMessage } from './MessageMenu.js';
import { ReadAlongBubble } from './ReadAlongBubble.js';
import { RichText } from './RichText.js';
import { TypingBubble } from './TypingBubble.js';
import { useReveal } from './useReveal.js';
import { SPACE } from '../../lib/theme/space.js';

/**
 * One bubble geometry for everything said in the thread — a message, the message being
 * sent, the answer being written, a notice (issue #51: one scale, no near-misses per
 * bubble). paddingVertical 11 is off the scale on purpose: with TYPE.body's 23-point
 * line a one-liner closes at 45, just over the 44 pt touch height (space.ts TOUCH).
 */
export const BUBBLE = {
  borderRadius: 22,
  paddingHorizontal: SPACE.lg,
  paddingVertical: 11,
} as const;

/** One empty set for "nothing is carried on top": a fresh one each render is a new prop. */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * What Buddy DID in this turn (the ✓ receipt). Offers are not done yet, and a proposed
 * deletion is a question waiting for her — both have a card of their own.
 */
function receiptOf(m: MessageView): MessageView['actions'] {
  return m.actions.filter(
    (a) =>
      a.summary.tool !== 'offer_learning' &&
      a.summary.tool !== 'open_area' &&
      a.summary.tool !== 'confirm_delete' &&
      a.summary.tool !== 'start_roleplay',
  );
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
  /** Undo is locked while this is true (default: busy); history locks only while undoing. */
  undoBusy?: boolean;
  /**
   * Where "Rückgängig" stands (issue #204). 'last': on the newest step she can still take
   * back, and only there — three buttons under three receipts were the wall the owner saw.
   * Everything else is a tap on a receipt away (UndoSheet), so nothing becomes unreachable.
   * 'all' (the default): every step carries its own, which is what History is for.
   */
  undoScope?: 'last' | 'all';
  /**
   * Action ids whose receipt the bar on top already says word for word (issue #204, the
   * prepared practice): their line leaves the conversation while that bar stands — they stay
   * in what can be taken back, and closing the bar brings the line back.
   */
  carriedOnTop?: ReadonlySet<string>;
  /**
   * The conversation is being spoken (app/talk.tsx, issue #18): Buddy's newest bubble
   * follows his voice — the sentence being read stands out (ReadAlongBubble) — and a
   * tapped offer keeps the voice on (OfferCard `spoken`, issue #40).
   */
  spoken?: boolean;
  /**
   * Whether Buddy's typing bubble may show while a turn is underway (default yes). Talk
   * hides it while she is still speaking: her forming words are no writing of Buddy's.
   */
  showTyping?: boolean;
};

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
  undoScope = 'all',
  carriedOnTop = EMPTY_IDS,
  // The screen labels of each message use `spoken` inside the map: bind the prop apart.
  spoken: spokenMode = false,
  showTyping = true,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // Screen readers hear formulas in words, not raw LaTeX (p2-buddy-bubble-a11y-reads-raw-latex).
  const words = useSpokenWords();
  const [menu, setMenu] = useState<MenuMessage | null>(null);
  /** The sheet with everything that can still be taken back (issue #204). */
  const [undoOpen, setUndoOpen] = useState(false);
  const last = messages[messages.length - 1];
  const lastBuddy = [...messages].reverse().find((m) => m.role === 'buddy');
  const breaks = dayBreaks(messages.map((m) => m.created_at));
  const thinking =
    pending !== null || messages.some((m) => m.role === 'learner' && m.status === 'processing');
  const shownLive = useReveal(thinking && live ? closedStream(live) : null);
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
  const enterOf = (m: MessageView, index: number) =>
    arrivedInPlace(m) ? undefined : riseIn(index);

  // ── What can still be taken back, and where that is offered (issue #204) ──────────────
  // Newest first, inside a turn too: that is the order she reads them back in.
  const takeable = showActions
    ? [...messages].reverse().flatMap((m) => receiptOf(m).filter(takeableBack).reverse())
    : [];
  // What the bar on top already says has no line here, so its button cannot stand here either.
  const takeableHere = takeable.filter((a) => !carriedOnTop.has(a.id));
  /** The one step whose "Rückgängig" is in view ('last'); null = every step carries its own. */
  const liveUndoId = undoScope === 'last' ? (takeableHere[0]?.id ?? null) : null;
  const buttonsInView = undoScope === 'last' ? (liveUndoId === null ? 0 : 1) : takeableHere.length;
  /** More can be taken back than stands in view: the receipts open the rest (UndoSheet). */
  const moreToUndo = onUndo !== undefined && takeable.length > buttonsInView;
  const openUndo = () => setUndoOpen(true);
  /** What a step that was taken back reads like now. */
  const undoneText = (a: MessageView['actions'][number]): string =>
    a.summary.tool === 'request_material'
      ? t('action.request_material_undone', { title: a.summary.title })
      : `${describeAction(a.summary)} – ${t('done.undone')}`;
  /** The way back for one step, or nothing where there is none. */
  const undoButton = (a: MessageView['actions'][number] | null): ReactNode => {
    if (!onUndo || a === null || !takeableBack(a)) return null;
    const what = describeAction(a.summary);
    return (
      <Btn
        size="sm"
        variant="outline"
        pill
        onPress={() => {
          haptic.tap();
          onUndo(a.id);
        }}
        disabled={undoBusy ?? busy}
        accessibilityLabel={t('done.undo_label', { what })}
      >
        {/* Taking back a request for a photo: "no photo needed" (#14). */}
        {a.summary.tool === 'request_material' ? t('done.undo_request_material') : t('done.undo')}
      </Btn>
    );
  };
  // "nur hier in der App" is explained once, not under every card (issue #204): under the
  // newest receipt it applies to, and under the newest of Buddy's messages that only ever
  // existed here. Everything older carries the same truth without repeating the sentence.
  const inAppReceipt =
    messages.filter((m) => receiptOf(m).some((a) => onlyInApp(a.summary, { contactOn }))).at(-1)
      ?.id ?? null;
  const inAppDelivery = messages.filter(saysOnlyInApp).at(-1)?.id ?? null;

  const view = (
    // The thread's air rides one scale (issue #51): sm from turn to turn, and the same
    // sm from a bubble to its card or chips (the block's xs gap + an xs margin there);
    // only a bubble's own status line sits closer, at the bare xs.
    <View style={{ gap: SPACE.sm }}>
      {messages.map((m, index) => {
        const mine = m.role === 'learner';
        const day = breaks[index] ?? null;
        // One turn, one receipt (issue #204): what the bar on top already says has no line.
        const done = receiptOf(m).filter((a) => !carriedOnTop.has(a.id));
        const applied = done.filter((a) => a.status !== 'undone');
        const takenBack = done.filter((a) => a.status === 'undone');
        const spoken = `${mine ? t('thread.you') : t('thread.buddy')}: ${speakMathText(markdownPlain(m.text, { spoken: true }), words)}`;
        const stopped = mine && m.status === 'failed' && m.failure_code === 'stopped';
        const opensHere = sessionStart?.afterMessageId === m.id;
        return (
          <Animated.View
            key={m.id}
            layout={glide}
            style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: SPACE.xs }}
          >
            {day ? <DayLine day={day} /> : null}
            <Animated.View
              entering={enterOf(m, 0)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                gap: SPACE.sm,
                maxWidth: '92%',
              }}
            >
              <Pressable
                accessibilityRole="text"
                accessibilityLabel={spoken}
                accessibilityHint={t('thread.message_hint')}
                accessibilityActions={[
                  { name: 'copy', label: t('message.copy') },
                  ...(mine ? [] : [{ name: 'speak', label: t('message.speak') }]),
                ]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'copy' || e.nativeEvent.actionName === 'speak')
                    setMenu({ text: m.text, role: m.role });
                }}
                onLongPress={() => {
                  haptic.tap();
                  setMenu({ text: m.text, role: m.role });
                }}
                delayLongPress={350}
                style={{ flexShrink: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      BUBBLE,
                      {
                        backgroundColor: mine ? palette.primary : palette.paper,
                        borderBottomRightRadius: mine ? 6 : BUBBLE.borderRadius,
                        borderBottomLeftRadius: mine ? BUBBLE.borderRadius : 6,
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                      mine ? null : SHADOW.soft,
                    ]}
                  >
                    {m.outreach ? (
                      <Text style={[TYPE.label, { marginBottom: 2 }]}>{m.outreach.title}</Text>
                    ) : null}
                    {!mine && spokenMode && m === lastBuddy ? (
                      <ReadAlongBubble text={m.text} style={[TYPE.body, { color: palette.ink }]} />
                    ) : (
                      <RichText
                        text={m.text}
                        style={[TYPE.body, { color: mine ? palette.paper : palette.ink }]}
                      />
                    )}
                  </View>
                )}
              </Pressable>
            </Animated.View>
            {/* What really happened to a message Buddy also sent outside the app. "Nur hier
                in der App" is the one state that is the same for every one of them, so it is
                said once — under the newest (issue #204); it used to stand under every card. */}
            {m.outreach && (m.id === inAppDelivery || !saysOnlyInApp(m)) ? (
              <Text style={[TYPE.small, { fontSize: 12 }]}>{deliveryText(m.outreach)}</Text>
            ) : null}
            {m.actions.map((a) =>
              // Buddy's offers to start something: always shown, one tap starts it.
              a.summary.tool === 'offer_learning' ? (
                <Animated.View
                  key={a.id}
                  entering={riseIn(1)}
                  // Block gap xs + this xs = sm, the same air as between two bubbles —
                  // a card glued to its sentence was the complaint (owner 28.09., issue #51).
                  style={{ width: '86%', marginTop: SPACE.xs }}
                >
                  <OfferCard actionId={a.id} offer={a.summary} spoken={spokenMode} />
                </Animated.View>
              ) : a.summary.tool === 'open_area' ? (
                <Animated.View
                  key={a.id}
                  entering={riseIn(1)}
                  style={{ width: '86%', marginTop: SPACE.xs }}
                >
                  <AreaCard area={a.summary.area} />
                </Animated.View>
              ) : a.summary.tool === 'confirm_delete' ? (
                // Nothing is deleted until she answers this (issue #151).
                <Animated.View
                  key={a.id}
                  entering={riseIn(1)}
                  style={{ width: '86%', marginTop: SPACE.xs }}
                >
                  <ConfirmCard confirm={a.summary} />
                </Animated.View>
              ) : a.summary.tool === 'start_roleplay' ? (
                // The role card: the scene, her tasks and the way out (issue #244).
                <Animated.View
                  key={a.id}
                  entering={riseIn(1)}
                  style={{ width: '86%', marginTop: SPACE.xs }}
                >
                  <RoleplayCard roleplay={a.summary} />
                </Animated.View>
              ) : null,
            )}
            {showActions && done.length > 0 ? (
              <Animated.View
                entering={riseIn(1)}
                // Block gap xs + xs = sm: same breathing room as between bubbles — the
                // chips sat glued to their bubble (owner feedback 2026-09-28).
                style={{
                  gap: SPACE.sm,
                  // Stretch, not shrink-to-fit: the column stands in a block that aligns
                  // its children to the side, so without this each receipt was only as
                  // wide as its "Rückgängig" button and the sentence broke after three
                  // words (issue #191). The cap keeps it inside the bubble column.
                  alignSelf: 'stretch',
                  maxWidth: '88%',
                  marginTop: SPACE.xs,
                }}
              >
                {/* One turn, one receipt (issue #204). Two things done in one answer used
                    to be two ticks, two sentences and two "Rückgängig" under each other —
                    "das sind drei Rückgängig-Knöpfe und vier Statuszeilen für zwei Dinge,
                    die sie getan hat". In the chat the turn now says what it did in one
                    line with one way back; History keeps a line per step, because looking
                    back at the single steps is what she opens it for. */}
                {undoScope === 'last' ? (
                  <>
                    {applied.length > 0 ? (
                      <Receipt
                        text={applied.map((a) => describeAction(a.summary)).join(' · ')}
                        onOpenAll={moreToUndo ? openUndo : null}
                        openHint={t('done.undo_hint')}
                        undo={undoButton(applied.find((a) => a.id === liveUndoId) ?? null)}
                      />
                    ) : null}
                    {takenBack.length > 0 ? (
                      <Receipt
                        undone
                        text={takenBack.map(undoneText).join(' · ')}
                        openHint={t('done.undo_hint')}
                      />
                    ) : null}
                  </>
                ) : (
                  done.map((a) => (
                    <Receipt
                      key={a.id}
                      undone={a.status === 'undone'}
                      text={a.status === 'undone' ? undoneText(a) : describeAction(a.summary)}
                      openHint={t('done.undo_hint')}
                      undo={a.status === 'undone' ? null : undoButton(a)}
                    />
                  ))
                )}
                {/* Said once, not under every card (issue #204): that what was agreed can
                    only reach her here, because messages to the phone are off. */}
                {m.id === inAppReceipt ? (
                  <Text
                    style={[
                      TYPE.small,
                      { fontSize: 12, color: palette.ink3, paddingLeft: 14 + SPACE.xs },
                    ]}
                  >
                    {t('done.in_app_only')}
                  </Text>
                ) : null}
              </Animated.View>
            ) : null}
            {mine && m.status === 'failed' ? (
              <Animated.View
                entering={riseIn(0)}
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
              </Animated.View>
            ) : null}
            {onOption && m === last && m.role === 'buddy' && m.options && m.options.length > 0 ? (
              <View
                // Block gap xs + xs = sm to the bubble, like the cards above.
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: SPACE.sm,
                  marginTop: SPACE.xs,
                }}
              >
                {m.options.map((o, i) => (
                  <Animated.View key={o} entering={riseIn(2 + i)}>
                    <Btn
                      size="sm"
                      variant="soft"
                      onPress={() => {
                        haptic.tap();
                        onOption(m.id, o);
                      }}
                      disabled={busy}
                    >
                      {o}
                    </Btn>
                  </Animated.View>
                ))}
              </View>
            ) : null}
            {opensHere ? (
              <SessionGreeting
                text={sessionStart!.text}
                room={sessionRoom}
                action={sessionStart!.action}
              />
            ) : null}
          </Animated.View>
        );
      })}
      {notices.map((n, i) => (
        <Animated.View
          key={isValidElement(n) && n.key !== null ? n.key : `notice-${i}`}
          entering={riseIn(1)}
          layout={glide}
        >
          {n}
        </Animated.View>
      ))}
      {pending ? (
        <Animated.View key="pending" entering={riseIn(0)} style={{ alignItems: 'flex-end' }}>
          <View
            style={[
              BUBBLE,
              {
                maxWidth: '86%',
                backgroundColor: palette.primary,
                borderBottomRightRadius: 6,
                opacity: 0.8,
              },
            ]}
          >
            <Text style={[TYPE.body, { color: palette.paper }]}>{pending.text}</Text>
          </View>
        </Animated.View>
      ) : null}
      {thinking && shownLive ? (
        <Animated.View
          key="live"
          entering={riseIn(0)}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, maxWidth: '92%' }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={[
              BUBBLE,
              {
                flexShrink: 1,
                backgroundColor: palette.paper,
                borderBottomLeftRadius: 6,
              },
              SHADOW.soft,
            ]}
          >
            <RichText text={shownLive} style={[TYPE.body, { color: palette.ink }]} />
          </View>
        </Animated.View>
      ) : thinking && showTyping ? (
        // Buddy is thinking: his bubble with soft dots (the text is for screen readers).
        <TypingBubble key="typing" label={t('thread.typing')} />
      ) : null}
      <MessageMenu message={menu} onClose={() => setMenu(null)} />
      {/* Everything that can still be taken back, where more can than stands in view. */}
      {onUndo ? (
        <UndoSheet
          actions={takeable}
          visible={undoOpen}
          busy={undoBusy ?? busy}
          onUndo={onUndo}
          onClose={() => setUndoOpen(false)}
        />
      ) : null}
    </View>
  );
  // Remember what stands on screen now, for the stored message that replaces it.
  if (pending) onScreen.current.pending = pending.text;
  if (thinking && live) onScreen.current.live = live;
  // What was there when the conversation opened stands still; only what arrives moves.
  return <LayoutAnimationConfig skipEntering>{view}</LayoutAnimationConfig>;
}

/**
 * One turn's receipt: a tick, what Buddy did in one quiet line, and under it the way back
 * where that is offered here (issue #204).
 *
 * It used to be a green pill with the text squeezed into whatever the "Rückgängig" button
 * left over — on a phone that came out as "✓" on one line and "Ein" on the next, and two of
 * them stacked read as green blobs nobody could place (owner 01.10.: "ich weiss auch nicht
 * was die gruenen felder da sein sollen und es sieht auch haesslich aus", issue #191). It is
 * a line in the conversation's own tones since.
 *
 * `onOpenAll`: a tap (or a long press) opens everything that can still be taken back — the
 * older steps whose buttons left the chat so three of them stop shouting at once. Taking
 * something back is a principle here (docs/UX-PRINCIPLES.md: undo over confirmation), so the
 * capability stays whole; only the buttons go.
 */
function Receipt({
  text,
  undone = false,
  undo = null,
  onOpenAll = null,
  openHint,
}: {
  text: string;
  undone?: boolean;
  undo?: ReactNode;
  onOpenAll?: (() => void) | null;
  openHint: string;
}) {
  const { palette } = useTheme();
  return (
    <Animated.View layout={glide} style={{ gap: SPACE.xs }}>
      <Pressable
        accessibilityRole={onOpenAll ? 'button' : 'text'}
        accessibilityLabel={text}
        accessibilityHint={onOpenAll ? openHint : undefined}
        disabled={onOpenAll === null}
        onPress={onOpenAll ?? undefined}
        onLongPress={
          onOpenAll
            ? () => {
                haptic.tap();
                onOpenAll();
              }
            : undefined
        }
        delayLongPress={350}
        // A one-line receipt is about 22 pt tall, and the way in must still be hittable
        // (CLAUDE.md §Design system, 44 pt): the reach grows, the line does not — padding
        // here would put empty air between every turn and its receipt.
        hitSlop={{ top: SPACE.md, bottom: SPACE.md, left: SPACE.xs, right: SPACE.xs }}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.xs }}
      >
        <View style={{ paddingTop: 2 }}>
          <Icon
            name={undone ? 'close' : 'check'}
            size={14}
            color={undone ? palette.ink3 : palette.successText}
          />
        </View>
        <Text
          style={[
            TYPE.small,
            { flex: 1, fontSize: 13, color: undone ? palette.ink3 : palette.ink2 },
          ]}
        >
          {text}
        </Text>
      </Pressable>
      {/* 14 (the tick) + xs: the way back starts where the sentence does. */}
      {undo ? <View style={{ paddingLeft: 14 + SPACE.xs }}>{undo}</View> : null}
    </Animated.View>
  );
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
  room = 0,
  action = null,
}: {
  text: string;
  room?: number;
  action?: ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  return (
    <View
      // Stretch: the block above aligns to her side when she spoke last; the greeting is
      // Buddy's and starts at the left whatever came before it.
      // Block gap xs + this xs = sm, the same air as between two turns.
      // sm again between the bubble and its button, like a notice (NoticeBubble).
      style={{ alignSelf: 'stretch', marginTop: SPACE.xs, minHeight: room, gap: SPACE.sm }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          alignSelf: 'flex-start',
          gap: SPACE.sm,
          maxWidth: '92%',
        }}
      >
        <View
          accessibilityRole="text"
          accessibilityLabel={`${t('thread.buddy')}: ${text}`}
          style={[
            BUBBLE,
            {
              flexShrink: 1,
              backgroundColor: palette.paper,
              borderBottomLeftRadius: 6,
            },
            SHADOW.soft,
          ]}
        >
          <Text style={[TYPE.body, { color: palette.ink }]}>{text}</Text>
        </View>
      </View>
      {action ? (
        // Flush with the bubble's left edge — like the cards and chips under a message.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>{action}</View>
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
        { alignSelf: 'center', color: palette.ink2, fontSize: 12, marginVertical: SPACE.xs },
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
