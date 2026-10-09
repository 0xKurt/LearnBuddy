// What the practice screen measures to share its room (issues #96, #286, #232), and what it then
// decides with `threadRoom`: the conversation's box, the free room above the answer, each turn's
// top, the question's own height, the card before it grew, the board, and how far the column runs
// past its end. The screen hands the setters to the parts that lay out; `layout` turns the
// measurements into the conversation's box, the card's growth and the drawing's caps for the
// question on screen. Moved out of `app/practice/[id].tsx` (issue #402) so the screen stays
// within its size (docs/engineering-guards.md, rule 4) — the rules themselves are unchanged.

import type { ItemView, PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { View } from 'react-native';

import { answerFolds, formDensity } from '../keyboard.js';
import { useFigureSizing } from '../math/figureSizing.js';
import { useVisibleHeight } from '../useVisibleHeight.js';
import { boardKeeps, threadRoom, type Room } from './threadRoom.js';
import { visualCaps, visualGrows, visualReach } from './visuals.js';

/** The question on screen, and the window it is laid out in. */
type Question = {
  item: ItemView;
  open: boolean;
  /** A spoken question: its card shows the sentence, never a drawing to grow. */
  speaking: boolean;
  /** The conversation as shown (`ItemThread`'s turns). */
  threadTurns: readonly PracticeTurnView[];
  /** No turn yet. */
  quiet: boolean;
  /** The Diktat card is one row (`DictationCard` `compact`). */
  dictationCompact: boolean;
  viewHeight: number;
  windowWidth: number;
  safeBottom: number;
};

/**
 * A part of the room the screen measures — the conversation's box (`ThreadBox`), the free room
 * (`FreeSpace`): its layout event, and its node, read again after every render (issue #484).
 */
export type RoomPart = { ref: RefObject<View | null>; onHeight: (height: number) => void };

export function useScreenRoom() {
  /** Her question's field has the focus (`AskRoute`): with the keyboard up the answer folds. */
  const [asking, setAsking] = useState(false);
  const seen = useVisibleHeight();
  /** The conversation's box and the free room above the answer (issue #286, `threadCap`). */
  const [threadBox, setThreadBox] = useState(0);
  const [freeSpace, setFreeSpace] = useState(0);
  const threadRef = useRef<View>(null);
  const freeRef = useRef<View>(null);
  const thread = useMemo<RoomPart>(() => ({ ref: threadRef, onHeight: setThreadBox }), []);
  const free = useMemo<RoomPart>(() => ({ ref: freeRef, onHeight: setFreeSpace }), []);
  const [turnTops, setTurnTops] = useState<Readonly<Record<string, number>>>({});
  /** Where the conversation's parts start — the help chips, a card under the replies (#403). */
  const [partTops, setPartTops] = useState<readonly number[]>([]);
  const [threadNeed, setThreadNeed] = useState(0);
  const [questionContentHeight, setQuestionContentHeight] = useState(0);
  /** The question card as laid out, and its own height before it grew (issue #96). */
  const [cardHeight, setCardHeight] = useState(0);
  const [natural, setNatural] = useState<{ key: string; height: number } | null>(null);
  /** The structured board's height as laid out; null until it has been (issue #232). */
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);
  /** The column's height and where its content ends: what runs past is `overrun`. */
  const [column, setColumn] = useState(0);
  const [columnEnd, setColumnEnd] = useState(0);
  const [columnTop, setColumnTop] = useState(0);
  const columnRef = useRef<View>(null);
  /** The column's end mark: where its content ends, below the bar. */
  const endRef = useRef<View>(null);
  /** The growth the card was given in the last layout (its minHeight now). */
  const granted = useRef(0);
  /**
   * The card's own drawing still sizes itself (`figureSizing`, issue #501): its height then holds
   * the drawing's placeholder, not its own. Taken as its own height, the card grew from a number
   * 200 pt too small, and how far depended on which measurement landed first — a dark shot of
   * the Hunderterfeld stood grown in one run and not in the next.
   */
  const figures = useFigureSizing();
  /** The card's box, read once its drawing has its size (below); what to do with a height. */
  const cardRef = useRef<View>(null);
  const cardMeasured = useRef<{ key: string; onCard: (h: number) => void } | null>(null);
  // Where the content ends, read after every render (issue #402). The mark's own layout event
  // missed it on the web, which reports a change of SIZE only (a ResizeObserver): a mark of height
  // 0 that moved up when the answer folded away left a stale overrun, and the conversation, given
  // no room, took its whole height past the window. The same value twice changes nothing.
  // The room's two parts — the conversation's box and the free room — are read again the same way
  // (issue #484): on the web a layout event measures its view a moment AFTER the resize it reports
  // (react-native-web: a ResizeObserver, then `measure` in a timeout). A render in between gives a
  // passing size — both read 0 while the window shrank to the keyboard's room — and when the view
  // returns to the size the observer last saw, no event follows. The room stayed 0, the box took
  // its height undecided, and the "Tipp" row stood cut (37 of 44 pt) after 3 of 14 resizes to
  // 360×440; a screen built at that size never showed it (0 of 14).
  useEffect(() => {
    const column = columnRef.current;
    if (column)
      endRef.current?.measureLayout(
        column,
        (_x, y) => setColumnEnd(Math.round(y)),
        () => undefined,
      );
    threadRef.current?.measure((_x, _y, _w, h) => setThreadBox(Math.round(h)));
    freeRef.current?.measure((_x, _y, _w, h) => setFreeSpace(Math.round(h)));
    // The card's own height, once more when its drawing stops sizing itself: the drawing may end
    // at the height its frame already had, and then no layout event of the card follows.
    if (!figures.sizing && cardMeasured.current && natural?.key !== cardMeasured.current.key)
      cardRef.current?.measure((_x, _y, _w, h) => cardMeasured.current?.onCard(Math.round(h)));
  });

  function layout(q: Question): Room & {
    caps: { figure: number; image: number };
    cardNatural: number;
    tops: number[];
    /** Where the conversation rests: the top of a reply she reads through (`ThreadBox`, #258). */
    readFrom: number | undefined;
    /** The card laid out at height `h`. */
    onCard: (h: number) => void;
  } {
    const { item, open, viewHeight } = q;
    // Per question AND per window: a narrower phone wraps the prompt onto another line and gives
    // the drawing a smaller cap, so its own height measured on another size is wrong here.
    const naturalKey = `${item.id}:${q.windowWidth}x${viewHeight}`;
    const cardNatural = natural?.key === naturalKey ? natural.height : 0;
    // What the card grew is room it gives back — but only growth it was GIVEN (issue #403): a grown
    // card that stands taller than its minHeight stands at its content (the prompt rewrapped, the
    // drawing came in), and counting that as growth promised the conversation room it never got;
    // squeezed below its cap, it showed a sliver of the orb before under the card at 390.
    const given = granted.current > 0 ? cardNatural + granted.current : 0;
    const cardDelta =
      cardNatural > 0 && !(given > 0 && cardHeight > given + 1) ? cardHeight - cardNatural : 0;
    // When something below grows (the voice bar, the keyboard's room) and the column runs past
    // its end, that overrun comes off the room too — a grown card gives it back first.
    // Two ways to see it: past the column's own end (phones, where a flex child may shrink below
    // its content), and past the window (the web, where the column grows with its content and
    // the page itself would scroll).
    const overrun =
      column > 0
        ? Math.max(0, columnEnd - column, columnTop > 0 ? columnTop + columnEnd - viewHeight : 0)
        : 0;
    // What the conversation would have next to the card at its own height — and, below 0, how far
    // the column runs past its end even without it (`short`: the card gives that first, #402).
    const left = threadBox + freeSpace + cardDelta - overrun;
    const room = Math.max(0, left);
    // An open structured board gives way under Buddy's reply, down to what it keeps (#232).
    // Not while it is folded away (`answerFolds`): it holds nothing to give, and the reply's floor
    // pushed the bar past the window.
    const boardGives =
      open &&
      item.task_view !== null &&
      item.task_view !== undefined &&
      !answerFolds(asking, seen.window, seen.overlap);
    // The tops are in ItemThread's coordinates; it starts after the thread's padding.
    const tops = q.threadTurns
      .map((turn) => turnTops[turn.id])
      .filter((y): y is number => y !== undefined);
    // Buddy's feedback on her long text is read through, from its top (#258, `threadRoom`).
    const newest = q.threadTurns[q.threadTurns.length - 1];
    const reads = item.kind === 'essay' && Boolean(newest?.essay);
    const shared = threadRoom({
      room,
      short: Math.max(0, -left),
      threadNeed,
      tops,
      parts: partTops,
      quiet: q.quiet,
      boardGives,
      boardSpare:
        boardGives && surfaceHeight !== null
          ? Math.max(0, surfaceHeight - boardKeeps(q.safeBottom))
          : Infinity,
      cardNatural,
      cardDelta,
      visual: cardNatural > 0 && Boolean(item.figure || item.image) && !q.speaking,
      // While she types the drawing folds to one row (`Question`, `formDensity` tight): growing
      // the card then only made an empty band under that row and squeezed the conversation — a
      // short question beside a map or picture left "Tipp" half shown at 360×440 (#252).
      growable: visualGrows(item.figure) && formDensity(seen.window, seen.overlap) !== 'tight',
      reach: visualReach(item.figure),
      // A Diktat card before her first answer holds only the way to hear the word (issue #242):
      // it takes all the room the conversation does not use, so no empty band is left under it.
      fills: cardNatural > 0 && item.kind === 'spelling_dictation' && !q.dictationCompact,
      viewHeight,
      reads,
    });
    granted.current = shared.cardGrowTo;
    const onCard = (h: number) => {
      setCardHeight(h);
      // Its own height before it grows: measured only while it has no minHeight. (While it
      // shrinks back its height lags a render behind; taking that as its own height made it
      // never give the room back. A picture that loads while it is grown pushes the column
      // past its end — the overrun takes the growth away, and then it measures itself again.)
      // Not while its drawing sizes itself: that is the drawing's placeholder (#501).
      if (shared.cardGrowTo === 0 && !figures.sizing)
        setNatural((now) =>
          now?.key === naturalKey && now.height === h ? now : { key: naturalKey, height: h },
        );
    };
    cardMeasured.current = { key: naturalKey, onCard };
    return {
      ...shared,
      caps: visualCaps(viewHeight, shared.cardGrowTo),
      cardNatural,
      // ThreadBox rests its edge on any of them.
      tops: [...tops, ...partTops],
      readFrom: reads ? tops[tops.length - 1] : undefined,
      onCard,
    };
  }

  return {
    layout,
    /** The card's box (`cardRef`) and where its drawings report their sizing (`figureSizing`). */
    cardRef,
    reportSizing: figures.report,
    questionContentHeight,
    setQuestionContentHeight,
    /** The conversation's box and the free room above the answer (`RoomPart`). */
    thread,
    free,
    setThreadNeed,
    setTurnTops,
    setPartTops,
    setSurfaceHeight,
    columnRef,
    endRef,
    asking,
    setAsking,
    /** The column laid out: its height, and where it starts in the window. */
    onColumn: (height: number) => {
      setColumn(height);
      columnRef.current?.measureInWindow((_x, y) => setColumnTop(Math.round(y)));
    },
  };
}

/** The practice screen's measurements and setters (`useScreenRoom`). */
export type ScreenRoom = ReturnType<typeof useScreenRoom>;
