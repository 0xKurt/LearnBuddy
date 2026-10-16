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
// drawn by ./ThreadParts.tsx, and each message with what hangs under it by ./MessageRow.tsx — drawn
// again only when that message changes (#637), and the reply being written only at the end.
// Motion: what arrives fades in with a small rise (the bubble first, then its
// cards and chips, subtly staggered); what was already there when the screen
// opened stands still, and neighboring content reflows immediately. A long
// press on a message opens "Kopieren" / "Vorlesen" (MessageMenu).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { CHAT } from '../../lib/theme/chat.js';
import { AreaCard } from './AreaCard.js';
import { describeAction, onlyInApp } from './describe.js';
import { addActionCard, loudCard, type Quiet } from './extensions.js';
import { dayBreaks } from '../../lib/time.js';

import { MessageMenu, type MenuMessage } from './MessageMenu.js';
import {
  Entrance,
  MessageRow,
  noticeEntrance,
  receiptOf,
  ReplyTail,
  saysOnlyInApp,
  takeableBack,
} from './MessageRow.js';
import { SeenWhenShown } from './SeenOutreach.js';
import { UndoSheet } from './UndoSheet.js';

import { SPACE } from '../../lib/theme/space.js';

// The core's own card; a domain adds its offers, its roleplay, its rehearsal and the deletion it
// asks her to confirm the same way (components/buddy/extensions.ts, lib/learning/register.tsx).
addActionCard('open_area', (s) => <AreaCard area={s.area} />);

/** One empty set for "nothing is carried on top": a fresh one each render is a new prop. */
const EMPTY_IDS: ReadonlySet<string> = new Set();
const NOTHING_PLACED: { before: ReactNode[]; after: ReadonlyMap<string, ReactNode[]> } = {
  before: [],
  after: new Map(),
};

type Props = {
  messages: MessageView[];
  /** Local message being sent right now (optimistic). */
  pending: { text: string } | null;
  /** What Buddy tells now, with buttons (`ChatCard`), after the messages. */
  notices?: ReactNode[];
  /**
   * What Buddy tells at its own moment inside the conversation (issue #630, `placeByTime`):
   * `after` by the message it follows, `before` above the first message. Never under what was
   * said later — the finished practice at the end read as his answer to her next message.
   */
  placed?: { before: ReactNode[]; after: ReadonlyMap<string, ReactNode[]> };
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
  /** Something else on the screen holds the one primary: no card's start is filled (`loudCard`). */
  quiet?: Quiet;
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

export function Conversation({
  messages,
  contactOn,
  pending,
  notices = [],
  placed = NOTHING_PLACED,
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
  quiet = 'primary',
  // The screen labels of each message use `spoken` inside the map: bind the prop apart.
  spoken: spokenMode = false,
  showTyping = true,
}: Props) {
  const { palette } = useTheme();
  // Match initial-subtree skipping: later mounted descendants may still enter.
  const committed = useRef(false);
  useEffect(() => {
    committed.current = true;
  }, []);
  const { t } = useTranslation('buddy');
  const [menu, setMenu] = useState<MenuMessage | null>(null);
  /** Only the chosen sheet action shows request progress. */
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const undoLocked = undoBusy ?? busy;
  const [undoTurnId, setUndoTurnId] = useState<string | null>(null);
  const undoStarted = useRef<string | null>(null);
  const undoTurn = messages.find((m) => m.id === undoTurnId);
  // The rows are drawn again only when their own message changes (#637), so what they call
  // back with is held here and stays the same function from render to render.
  const callbacks = useRef({ onOption, onResend });
  callbacks.current = { onOption, onResend };
  const option = useCallback(
    (messageId: string, picked: string) => callbacks.current.onOption?.(messageId, picked),
    [],
  );
  const resend = useCallback((m: MessageView) => callbacks.current.onResend?.(m), []);
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
  // Buddy's orb stands beside the newest thing he says, once (ui_kits/app/Chat.jsx:12, :21): the
  // reply being written and the typing dots bring their own. The greeting of this visit stays
  // where it was said (lib/buddy/useSessionStart.ts) and is his newest line only until he says
  // something after it — then the orb moves on to that line.
  const greetedAt = sessionStart
    ? messages.findIndex((m) => m.id === sessionStart.afterMessageId)
    : -1;
  const greets = greetedAt >= 0 && !messages.slice(greetedAt + 1).some((m) => m.role === 'buddy');
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
  // "nur hier in der App" is explained once, not under every card (issue #204): under the
  // newest receipt it applies to, and under the newest of Buddy's messages that only ever
  // existed here. Everything older carries the same truth without repeating the sentence.
  const inAppReceipt =
    messages.filter((m) => receiptOf(m).some((a) => onlyInApp(a.summary, { contactOn }))).at(-1)
      ?.id ?? null;
  const inAppDelivery = messages.filter(saysOnlyInApp).at(-1)?.id ?? null;

  const loud = loudCard(messages, quiet);
  const view = (
    // One rhythm for the thread (ui_kits/app/Chat.jsx:16, `gap: 16`): lines, cards, receipts and
    // chips stand lg apart. Only what belongs to one piece sits closer: a line's own status (xs),
    // and the way back, whose 44 pt target reaches into the gap above it.
    <View style={{ gap: SPACE.lg }}>
      {placed.before.map((n, i) => noticeEntrance(n, `before-${i}`, enters))}
      {messages.map((m, index) => {
        const row = (
          <MessageRow
            key={m.id}
            m={m}
            day={breaks[index] ?? null}
            orb={m.id === orbAt}
            spokenMode={spokenMode}
            readsAlong={m === lastBuddy}
            enter={enters && !arrivedInPlace(m)}
            enters={enters}
            delivery={m.id === inAppDelivery || !saysOnlyInApp(m)}
            inAppNote={m.id === inAppReceipt}
            loud={loud}
            carried={m.actions
              .filter((a) => carriedOnTop.has(a.id))
              .map((a) => a.id)
              .join(',')}
            showActions={showActions}
            receipts={receipts}
            busy={busy}
            takeBack={showActions && onUndo !== undefined && m.actions.some(takeableBack)}
            undoLocked={undoLocked}
            options={
              onOption !== undefined &&
              m === last &&
              m.role === 'buddy' &&
              (m.options?.length ?? 0) > 0
            }
            after={placed.after.get(m.id)}
            greeting={
              sessionStart?.afterMessageId === m.id
                ? {
                    orb: greets && !thinking,
                    text: sessionStart.text,
                    room: sessionRoom,
                    action: sessionStart.action,
                  }
                : null
            }
            onMenu={setMenu}
            onTakeBack={setUndoTurnId}
            onOption={onOption ? option : undefined}
            onResend={onResend ? resend : undefined}
          />
        );
        // Buddy reaching out: opened once she has seen it here (#805).
        return m.outreach ? (
          <SeenWhenShown key={m.id} id={m.outreach.id} watch={m.outreach.opened_at === null}>
            {row}
          </SeenWhenShown>
        ) : (
          row
        );
      })}
      {notices.map((n, i) => noticeEntrance(n, `notice-${i}`, enters))}
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
      {thinking ? (
        <ReplyTail
          live={live}
          typing={showTyping}
          label={t('thread.typing')}
          slow={t('thread.slow')}
          enters={enters}
        />
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
