// What the practice screen measures to share its room (issues #96, #286, #232), and what it then
// decides with `threadRoom`: the conversation's box, the free room above the answer, each turn's
// top, the question's own height, the card before it grew, the board, and how far the column runs
// past its end. The screen hands the setters to the parts that lay out; `layout` turns the
// measurements into the conversation's box, the card's growth and the drawing's caps for the
// question on screen. Moved out of `app/practice/[id].tsx` (issue #402) so the screen stays
// within its size (docs/engineering-guards.md, rule 4) — the rules themselves are unchanged.

import type { ItemView, PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useRef, useState } from 'react';
import type { View } from 'react-native';

import { boardKeeps, threadRoom, type Room } from './threadRoom.js';
import { visualCaps, visualGrows } from './visuals.js';

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

export function useScreenRoom() {
  /** The conversation's box and the free room above the answer (issue #286, `threadCap`). */
  const [threadBox, setThreadBox] = useState(0);
  const [freeSpace, setFreeSpace] = useState(0);
  const [turnTops, setTurnTops] = useState<Readonly<Record<string, number>>>({});
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

  function layout(q: Question): Room & {
    caps: { figure: number; image: number };
    cardNatural: number;
    tops: number[];
    /** The card laid out at height `h`. */
    onCard: (h: number) => void;
  } {
    const { item, open, viewHeight } = q;
    // Per question AND per window: a narrower phone wraps the prompt onto another line and gives
    // the drawing a smaller cap, so its own height measured on another size is wrong here.
    const naturalKey = `${item.id}:${q.windowWidth}x${viewHeight}`;
    const cardNatural = natural?.key === naturalKey ? natural.height : 0;
    const cardDelta = cardNatural > 0 ? cardHeight - cardNatural : 0;
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
    const boardGives = open && item.task_view !== null && item.task_view !== undefined;
    // The tops are in ItemThread's coordinates; it starts after the thread's padding.
    const tops = q.threadTurns
      .map((turn) => turnTops[turn.id])
      .filter((y): y is number => y !== undefined);
    const shared = threadRoom({
      room,
      short: Math.max(0, -left),
      threadNeed,
      tops,
      quiet: q.quiet,
      boardGives,
      boardSpare:
        boardGives && surfaceHeight !== null
          ? Math.max(0, surfaceHeight - boardKeeps(q.safeBottom))
          : Infinity,
      cardNatural,
      cardDelta,
      visual: cardNatural > 0 && Boolean(item.figure || item.image) && !q.speaking,
      growable: visualGrows(item.figure),
      // A Diktat card before her first answer holds only the way to hear the word (issue #242):
      // it takes all the room the conversation does not use, so no empty band is left under it.
      fills: cardNatural > 0 && item.kind === 'spelling_dictation' && !q.dictationCompact,
      viewHeight,
    });
    return {
      ...shared,
      caps: visualCaps(viewHeight, shared.cardGrowTo),
      cardNatural,
      tops,
      onCard: (h) => {
        setCardHeight(h);
        // Its own height before it grows: measured only while it has no minHeight. (While it
        // shrinks back its height lags a render behind; taking that as its own height made it
        // never give the room back. A picture that loads while it is grown pushes the column
        // past its end — the overrun takes the growth away, and then it measures itself again.)
        if (shared.cardGrowTo === 0) setNatural({ key: naturalKey, height: h });
      },
    };
  }

  return {
    layout,
    questionContentHeight,
    setQuestionContentHeight,
    setThreadBox,
    setThreadNeed,
    setFreeSpace,
    setTurnTops,
    setSurfaceHeight,
    setColumnEnd,
    columnRef,
    /** The column laid out: its height, and where it starts in the window. */
    onColumn: (height: number) => {
      setColumn(height);
      columnRef.current?.measureInWindow((_x, y) => setColumnTop(Math.round(y)));
    },
  };
}
