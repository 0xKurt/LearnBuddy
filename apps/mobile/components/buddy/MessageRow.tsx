// One message of the conversation and what hangs under it (components/buddy/Conversation.tsx):
// her bubble or Buddy's line, its delivery, the receipt of what he did with the way back, his
// cards, her quick answers, Buddy's notices at their moment, and the greeting of a new visit.
// Drawn again only when something of THIS message changes (#637): the conversation renders for
// every piece of a reply while it is written, and on the POCO X3 one render of the whole thread
// took ~150 ms (dev JS) — every row, every formula, every time.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { isValidElement, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { closedStream, markdownPlain } from '../../lib/buddy/markdown.js';
import { haptic } from '../../lib/haptics.js';
import { useSay } from '../../lib/speech/say.js';
import { CHAT } from '../../lib/theme/chat.js';
import { UI } from '../../lib/theme/components.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { formatDay, localDateOf } from '../../lib/time.js';
import { Appear, Rise } from '../lb/Motion.js';
import { PressArea } from '../lb/PressArea.js';
import { deliveryText, describeAction } from './describe.js';
import { actionCard, hasCard, messageCard, messageExtra, readAlong } from './extensions.js';
import type { MenuMessage } from './MessageMenu.js';
import { RichText } from './RichText.js';
import {
  BuddyLine,
  FailedLine,
  Receipt,
  receiptIcon,
  ReplyOptions,
  TakeBack,
  UNDER_LINE,
} from './ThreadParts.js';
import { TypingBubble } from './TypingBubble.js';
import { useReveal } from './useReveal.js';
/** A card of Buddy's takes the thread's whole width. */
const CARD_WIDTH = { width: CHAT.cardWidth };

export const Entrance = Platform.OS === 'web' ? Appear : Rise;

type Action = MessageView['actions'][number];

/**
 * What Buddy DID in this turn (the ✓ receipt). Offers are not done yet, and a proposed
 * deletion is a question waiting for her — both have a card of their own. What has neither a
 * card nor words (a domain's tool without that domain) is not shown at all.
 */
export function receiptOf(m: MessageView): MessageView['actions'] {
  return m.actions.filter((a) => !hasCard(a.summary.tool) && describeAction(a.summary) !== '');
}

/** Still takeable back right now. */
export function takeableBack(a: Action): boolean {
  return a.undoable && a.status !== 'undone';
}

/**
 * Whether this message's delivery line would read "nur hier in der App" — the one state that
 * is the same under every such message, and therefore said once (issue #204). Opened, sent,
 * failed and the rest stay with their own message: those are facts about that one message.
 */
export function saysOnlyInApp(m: MessageView): boolean {
  return m.outreach?.status === 'in_app' && m.outreach.opened_at === null;
}

/** One of Buddy's notices, wherever in the thread it stands (issue #630). */
export function noticeEntrance(n: ReactNode, fallback: string, enters: boolean) {
  return (
    <Entrance
      key={isValidElement(n) && n.key !== null ? n.key : fallback}
      animate={enters}
      index={1}
    >
      {n}
    </Entrance>
  );
}

type RowProps = {
  m: MessageView;
  /** The day a new part of the conversation starts with, above this message. */
  day: string | null;
  /** Buddy's mini orb stands beside this line (his newest). */
  orb: boolean;
  /** The conversation is being spoken (app/talk.tsx): see Conversation's `spoken`. */
  spokenMode: boolean;
  /** This line follows Buddy's voice (his newest line, while spoken). */
  readsAlong: boolean;
  /** It arrives now (fades in); what stood there when the screen opened stands still. */
  enter: boolean;
  /** What hangs under it may arrive now (the conversation was on screen before). */
  enters: boolean;
  /** Its delivery line shows ("nur hier in der App" only under the newest, issue #204). */
  delivery: boolean;
  /** "Nur hier in der App" for what was agreed is said under this receipt (issue #204). */
  inAppNote: boolean;
  /** The action whose card's start is the filled one (`loudCard`). */
  loud: string | null;
  /** Ids of its actions the bar on top already says word for word, comma-joined. */
  carried: string;
  showActions: boolean;
  receipts: 'turn' | 'step';
  busy: boolean;
  /** "Zurücknehmen" under it, locked while `undoLocked`. */
  takeBack: boolean;
  undoLocked: boolean;
  /** Her quick answers under it (Buddy's newest line). */
  options: boolean;
  /** Buddy's notices said after this message (issue #630). */
  after: readonly ReactNode[] | undefined;
  /** The greeting of a new visit stands after this message (issues #34, #104, #195). */
  greeting: { orb: boolean; text: string; room: number; action?: ReactNode } | null;
  onMenu: (message: MenuMessage) => void;
  onTakeBack: (messageId: string) => void;
  onOption: ((messageId: string, option: string) => void) | undefined;
  onResend: ((message: MessageView) => void) | undefined;
};

export const MessageRow = memo(function MessageRow({
  m,
  day,
  orb,
  spokenMode,
  readsAlong,
  enter,
  enters,
  delivery,
  inAppNote,
  loud,
  carried,
  showActions,
  receipts,
  busy,
  takeBack,
  undoLocked,
  options,
  after,
  greeting,
  onMenu,
  onTakeBack,
  onOption,
  onResend,
}: RowProps) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const { t } = useTranslation('buddy');
  // Screen readers hear formulas in words, not raw LaTeX (p2-buddy-bubble-a11y-reads-raw-latex).
  const say = useSay();
  const ReadAlong = readAlong.get();
  const mine = m.role === 'learner';
  // One turn, one receipt (issue #204): what the bar on top already says has no line.
  const carriedIds = carried === '' ? [] : carried.split(',');
  const done = receiptOf(m).filter((a) => !carriedIds.includes(a.id));
  const applied = done.filter((a) => a.status !== 'undone');
  const takenBack = done.filter((a) => a.status === 'undone');
  const spoken = `${mine ? t('thread.you') : t('thread.buddy')}: ${say(markdownPlain(m.text, { spoken: true }))}`;
  /** What a step that was taken back reads like now. */
  const undoneText = (a: Action): string =>
    a.summary.tool === 'request_material'
      ? t('action.request_material_undone', { title: a.summary.title })
      : `${describeAction(a.summary)} – ${t('done.undone')}`;
  // A message a domain draws itself: the feedback after a roleplay or what a rehearsal
  // measured, as the "So lief's" list (issues #264, #384). The text stays for reading
  // aloud and copying.
  const own = messageCard(m);
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'stretch', gap: SPACE.lg }}>
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
          <Entrance animate={enter} style={{ width: CHAT.cardWidth }}>
            {own}
          </Entrance>
        ) : (
          <Entrance
            animate={enter}
            // Her bubble is as wide as her words, up to its share of the thread: a row
            // lets it shrink to them (a column squeezed "danke" into two lines).
            style={
              mine ? { flexDirection: 'row', maxWidth: CHAT.mineWidth } : { alignSelf: 'stretch' }
            }
          >
            <Line orb={mine ? null : orb}>
              <PressArea
                accessibilityRole="text"
                accessibilityLabel={spoken}
                accessibilityHint={t('thread.message_hint')}
                accessibilityActions={[
                  { name: 'copy', label: t('message.copy') },
                  ...(mine ? [] : [{ name: 'speak', label: t('message.speak') }]),
                ]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === 'copy' || e.nativeEvent.actionName === 'speak')
                    onMenu({ text: m.text, role: m.role });
                }}
                onLongPress={() => {
                  haptic.tap();
                  onMenu({ text: m.text, role: m.role });
                }}
                delayLongPress={CHAT.longPress}
                style={{ flexShrink: 1 }}
              >
                {(pressed) => (
                  <View
                    collapsable={false}
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
                    {!mine && spokenMode && readsAlong && ReadAlong ? (
                      <ReadAlong text={m.text} style={[TYPE.body, { color: palette.ink }]} />
                    ) : (
                      <RichText
                        text={m.text}
                        style={[
                          TYPE.body,
                          {
                            color: mine && m.status !== 'failed' ? palette.onPrimary : palette.ink,
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
        {m.outreach && delivery ? (
          <Text style={[TYPE.small, TYPE.meta, UNDER_LINE]}>{deliveryText(m.outreach)}</Text>
        ) : null}
        {mine && m.status === 'failed' ? (
          <Entrance animate={enters} index={0}>
            <FailedLine message={m} busy={busy} onResend={onResend} />
          </Entrance>
        ) : null}
      </View>
      {m.actions.map((a) => {
        const card = actionCard(a, spokenMode, a.id === loud ? 'primary' : 'soft');
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
      {/* What a domain hangs under it: the start a background message announces (#632). */}
      {messageExtra(m, 'soft').map((card, i) => (
        <Entrance key={`extra-${i}`} animate={enters} index={1} style={CARD_WIDTH}>
          {card}
        </Entrance>
      ))}
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
          {inAppNote ? (
            <Text style={[TYPE.small, TYPE.meta, { color: palette.ink2 }]}>
              {t('done.in_app_only')}
            </Text>
          ) : null}
        </Entrance>
      ) : null}
      {takeBack ? (
        <TakeBack
          label={t('done.take_back')}
          disabled={undoLocked}
          onPress={() => onTakeBack(m.id)}
        />
      ) : null}
      {options && onOption && m.options ? (
        <ReplyOptions
          options={m.options}
          disabled={busy}
          onPick={(option) => {
            haptic.tap();
            onOption(m.id, option);
          }}
          wrap={(chip, i, key) => (
            <Entrance key={key} animate={enters} index={Math.min(2 + i, UI.entrance.staggerCap)}>
              {chip}
            </Entrance>
          )}
        />
      ) : null}
      {(after ?? []).map((n, i) => noticeEntrance(n, `${m.id}-${i}`, enters))}
      {greeting ? (
        <SessionGreeting
          orb={greeting.orb}
          text={greeting.text}
          room={greeting.room}
          action={greeting.action}
        />
      ) : null}
    </View>
  );
});

/**
 * The end of the conversation while Buddy answers: his reply while it is still being written,
 * shown smoothly (`useReveal`), or — until its first words show — his typing dots. Its own
 * component (#637): the reveal draws a new piece every frame, and only this end is drawn for
 * it; the conversation above stays as it is.
 */
export const ReplyTail = memo(function ReplyTail({
  live,
  typing,
  label,
  enters,
}: {
  /** What arrived of the reply so far (only for an answer that changes nothing). */
  live: string | null;
  /** The dots may show (Talk hides them while she still speaks). */
  typing: boolean;
  label: string;
  enters: boolean;
}) {
  const { palette } = useTheme();
  const shown = useReveal(live ? closedStream(live) : null);
  if (shown)
    return (
      <Entrance animate={enters} index={0}>
        <BuddyLine orb>
          <View accessibilityLiveRegion="polite">
            <RichText text={shown} style={[TYPE.body, { color: palette.ink }]} />
          </View>
        </BuddyLine>
      </Entrance>
    );
  // Buddy is thinking: his mini orb and the dots (the text is for screen readers).
  return typing ? <TypingBubble label={label} /> : null;
});

/** Her bubble stands alone at the right; Buddy's line gets his orb's column. */
function Line({ orb, children }: { orb: boolean | null; children: ReactNode }) {
  return orb === null ? children : <BuddyLine orb={orb}>{children}</BuddyLine>;
}

type Tool = Action['summary']['tool'];

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
 * `action`: what the greeting itself carries — the card of the practice it just named, with
 * "Ansehen" (issue #195) — as wide as every card of the thread, a turn's gap under the line.
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
      style={{ alignSelf: 'stretch', minHeight: room, gap: SPACE.lg }}
    >
      <BuddyLine orb={orb}>
        <View accessibilityRole="text" accessibilityLabel={`${t('thread.buddy')}: ${text}`}>
          <Text style={[TYPE.body, { color: palette.ink }]}>{text}</Text>
        </View>
      </BuddyLine>
      {action ? <View style={{ width: CHAT.cardWidth }}>{action}</View> : null}
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
