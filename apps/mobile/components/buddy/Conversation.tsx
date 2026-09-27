// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them. What Buddy did
// with a message stands right under it, with "Rückgängig" while that still
// applies — there is no separate list of it on the home. Where a new day starts
// a quiet line names it (never how many days passed).
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

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { OfferCard } from '../learn/OfferCard.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { AreaCard } from './AreaCard.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { deliveryText, describeAction } from './describe.js';
import { i18n } from '../../lib/i18n/index.js';
import { dayBreaks, formatDay, localDateOf } from '../../lib/time.js';
import { closedStream, markdownPlain } from '../../lib/buddy/markdown.js';
import { haptic } from '../../lib/haptics.js';
import { glide, riseIn } from '../../lib/theme/enter.js';
import { MessageMenu, type MenuMessage } from './MessageMenu.js';
import { RichText } from './RichText.js';
import { TypingBubble } from './TypingBubble.js';
import { useReveal } from './useReveal.js';

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
  /** Undo one of Buddy's actions (only offered where the API says it still applies). */
  onUndo?: (actionId: string) => void;
  /** Undo is locked while this is true (default: busy); history locks only while undoing. */
  undoBusy?: boolean;
};

export function Conversation({
  messages,
  contactOn,
  pending,
  notices = [],
  live = null,
  busy,
  showActions = false,
  onOption,
  onResend,
  onUndo,
  undoBusy,
}: Props) {
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
    <View style={{ gap: 10 }}>
      {messages.map((m, index) => {
        const mine = m.role === 'learner';
        const day = breaks[index] ?? null;
        // What Buddy did (✓ list); offers are not done yet, they have their own card.
        const done = m.actions.filter(
          (a) => a.summary.tool !== 'offer_learning' && a.summary.tool !== 'open_area',
        );
        const spoken = `${mine ? t('thread.you') : t('thread.buddy')}: ${speakMathText(markdownPlain(m.text, { spoken: true }), words)}`;
        const stopped = mine && m.status === 'failed' && m.failure_code === 'stopped';
        return (
          <Animated.View
            key={m.id}
            layout={glide}
            style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}
          >
            {day ? <DayLine day={day} /> : null}
            <Animated.View
              entering={enterOf(m, 0)}
              style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}
            >
              {mine ? null : <BuddyOrb size={26} breathe={m === lastBuddy} />}
              <Pressable
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
                      {
                        backgroundColor: mine ? LB.primary : LB.paper,
                        borderRadius: 22,
                        borderBottomRightRadius: mine ? 6 : 22,
                        borderBottomLeftRadius: mine ? 22 : 6,
                        paddingHorizontal: 16,
                        paddingVertical: 11,
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      },
                      mine ? null : SHADOW.soft,
                    ]}
                  >
                    {m.outreach ? (
                      <Text style={[TYPE.label, { marginBottom: 2 }]}>{m.outreach.title}</Text>
                    ) : null}
                    <RichText
                      text={m.text}
                      style={[TYPE.body, { color: mine ? LB.paper : LB.ink }]}
                    />
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
                  style={{ width: '86%', marginLeft: 34 }}
                >
                  <OfferCard actionId={a.id} offer={a.summary} />
                </Animated.View>
              ) : a.summary.tool === 'open_area' ? (
                <Animated.View
                  key={a.id}
                  entering={riseIn(1)}
                  style={{ width: '86%', marginLeft: 34 }}
                >
                  <AreaCard area={a.summary.area} />
                </Animated.View>
              ) : null,
            )}
            {showActions && done.length > 0 ? (
              <Animated.View
                entering={riseIn(1)}
                style={{ gap: 6, maxWidth: '88%', marginLeft: 34 }}
              >
                {done.map((a) => {
                  const what = describeAction(a.summary, { contactOn });
                  return (
                    <Animated.View
                      key={a.id}
                      layout={glide}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: a.status === 'undone' ? LB.canvas : LB.mint,
                        borderRadius: 16,
                        paddingLeft: 12,
                      }}
                    >
                      <Text
                        style={[
                          TYPE.small,
                          {
                            fontSize: 13,
                            flex: 1,
                            color: a.status === 'undone' ? LB.ink2 : LB.ink,
                          },
                        ]}
                      >
                        {a.status !== 'undone'
                          ? `✓ ${what}`
                          : a.summary.tool === 'request_material'
                            ? t('action.request_material_undone', { title: a.summary.title })
                            : `${what} – ${t('done.undone')}`}
                      </Text>
                      {onUndo && a.undoable && a.status !== 'undone' ? (
                        <Btn
                          size="sm"
                          variant="ghost"
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
                      ) : null}
                    </Animated.View>
                  );
                })}
              </Animated.View>
            ) : null}
            {mine && m.status === 'failed' ? (
              <Animated.View
                entering={riseIn(0)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {/* It arrived: say why it was not answered (CLAUDE.md rule 5). Stopped by
                    her is no failure: said calmly, not in red. */}
                <Text style={[TYPE.small, { color: stopped ? LB.ink2 : LB.danger }]}>
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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
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
            style={{
              maxWidth: '86%',
              backgroundColor: LB.primary,
              borderRadius: 22,
              borderBottomRightRadius: 6,
              paddingHorizontal: 16,
              paddingVertical: 11,
              opacity: 0.8,
            }}
          >
            <Text style={[TYPE.body, { color: LB.paper }]}>{pending.text}</Text>
          </View>
        </Animated.View>
      ) : null}
      {thinking && shownLive ? (
        <Animated.View
          key="live"
          entering={riseIn(0)}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}
        >
          <BuddyOrb size={26} />
          <View
            accessibilityLiveRegion="polite"
            style={[
              {
                flexShrink: 1,
                backgroundColor: LB.paper,
                borderRadius: 22,
                borderBottomLeftRadius: 6,
                paddingHorizontal: 16,
                paddingVertical: 11,
              },
              SHADOW.soft,
            ]}
          >
            <RichText text={shownLive} style={[TYPE.body, { color: LB.ink }]} />
          </View>
        </Animated.View>
      ) : thinking ? (
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

/** The day a part of the conversation is from: "Heute", "Gestern", or "Montag, 28. September". */
export function DayLine({ day }: { day: string }) {
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
      style={[TYPE.small, { alignSelf: 'center', color: LB.ink2, fontSize: 12, marginVertical: 4 }]}
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
