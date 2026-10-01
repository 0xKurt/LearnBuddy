// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them. What Buddy did
// with a message stands right under it, with "Rückgängig" while that still
// applies — there is no separate list of it on the home. Where a new day starts
// a quiet line names it (never how many days passed). Where a new session starts
// Buddy greets her in a bubble of his own (issue #104) and, with the room the screen
// gives it, that greeting is what the view opens on.
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
import { deliveryText, describeAction } from './describe.js';
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
   */
  sessionStart?: { afterMessageId: string; text: string } | null;
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
  // The screen labels of each message use `spoken` inside the map: bind the prop apart.
  spoken: spokenMode = false,
  showTyping = true,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  // Screen readers hear formulas in words, not raw LaTeX (p2-buddy-bubble-a11y-reads-raw-latex).
  const words = useSpokenWords();
  const [menu, setMenu] = useState<MenuMessage | null>(null);
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
  const view = (
    // The thread's air rides one scale (issue #51): sm from turn to turn, and the same
    // sm from a bubble to its card or chips (the block's xs gap + an xs margin there);
    // only a bubble's own status line sits closer, at the bare xs.
    <View style={{ gap: SPACE.sm }}>
      {messages.map((m, index) => {
        const mine = m.role === 'learner';
        const day = breaks[index] ?? null;
        // What Buddy did (✓ list); offers are not done yet, and a proposed deletion is a
        // question waiting for her — both have their own card.
        const done = m.actions.filter(
          (a) =>
            a.summary.tool !== 'offer_learning' &&
            a.summary.tool !== 'open_area' &&
            a.summary.tool !== 'confirm_delete',
        );
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
            {m.outreach ? (
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
                {done.map((a) => {
                  const what = describeAction(a.summary, { contactOn });
                  const undone = a.status === 'undone';
                  return (
                    <Animated.View
                      key={a.id}
                      layout={glide}
                      // A receipt, not a label. It used to be a green pill with the text
                      // squeezed into whatever the "Rückgängig" button left over — on a
                      // phone that came out as "✓" on one line and "Ein" on the next, and
                      // two of them stacked read as green blobs nobody could place (owner
                      // 01.10.: "ich weiss auch nicht was die gruenen felder da sein
                      // sollen und es sieht auch haesslich aus", issue #191).
                      //
                      // Now it is a quiet line in the conversation's own tones: a tick,
                      // the sentence with room to breathe, and the way back under it.
                      // Taking something back is a principle here (UX-PRINCIPLES: undo
                      // over confirmation), so it stays — it just stops shouting.
                      style={{ gap: SPACE.xs }}
                    >
                      <View
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
                          {!undone
                            ? what
                            : a.summary.tool === 'request_material'
                              ? t('action.request_material_undone', { title: a.summary.title })
                              : `${what} – ${t('done.undone')}`}
                        </Text>
                      </View>
                      {onUndo && a.undoable && !undone ? (
                        <View style={{ paddingLeft: 14 + SPACE.xs }}>
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
                            {a.summary.tool === 'request_material'
                              ? t('done.undo_request_material')
                              : t('done.undo')}
                          </Btn>
                        </View>
                      ) : null}
                    </Animated.View>
                  );
                })}
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
            {opensHere ? <SessionGreeting text={sessionStart!.text} room={sessionRoom} /> : null}
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
    </View>
  );
  // Remember what stands on screen now, for the stored message that replaces it.
  if (pending) onScreen.current.pending = pending.text;
  if (thinking && live) onScreen.current.live = live;
  // What was there when the conversation opened stands still; only what arrives moves.
  return <LayoutAnimationConfig skipEntering>{view}</LayoutAnimationConfig>;
}

/**
 * Where this visit starts (issues #34, #104): Buddy wakes up and says hello — his own bubble,
 * looking like everything else he says, so it reads as being greeted and not as a divider.
 * It lives on this phone only: nothing is stored, nothing was asked of the model.
 * `room`: the height the block takes so the greeting stands at the top of the view and the
 * rest of it is free (the screen passes it while nothing follows the greeting). Everything
 * older is then one swipe above — hidden from neither eye nor screen reader.
 */
function SessionGreeting({ text, room = 0 }: { text: string; room?: number }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  return (
    <View
      // Stretch: the block above aligns to her side when she spoke last; the greeting is
      // Buddy's and starts at the left whatever came before it.
      // Block gap xs + this xs = sm, the same air as between two turns.
      style={{ alignSelf: 'stretch', marginTop: SPACE.xs, minHeight: room }}
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
