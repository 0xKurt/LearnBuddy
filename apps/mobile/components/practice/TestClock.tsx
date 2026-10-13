// The clock of a practice test she asked to sit with time (issue #241). It ticks here, in its own
// component under the head's progress bar, so the rest of the practice screen is not rendered
// again every second — and says what it knows through `useTestClock`: the screen puts the time
// left into the head's subtitle ("Frage 1 von 3 · noch 10 Min.") and the test's rule into the
// question card's meta line (design components/practice/Tasks.prompt.md "clock sits in the header
// subtitle", ui_kits/app/Tasks.jsx `test`).
//
// Calm on purpose (lib/practice/testClock.ts): whole minutes, no red, no seconds ticking. The
// card's line changes once, at five minutes, to a gentle sentence — said once to a screen reader
// too. Nothing else moves.

import type { TestTimer } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';

import { announce } from '../../lib/announce.js';
import { clockLine, leftNow } from '../../lib/practice/testClock.js';
import { ProgressRow } from './Question.js';

/** How often it looks at the clock. A display in whole minutes needs no more. */
const TICK_MS = 1_000;

/**
 * What the running clock shows right now (null: no test with time is on screen). One test is on
 * screen at a time; its clock says so here and takes it back when it goes (as `useSpeakPhase`).
 */
export const useTestClock = create<{ minutes: number | null; soon: boolean }>(() => ({
  minutes: null,
  soon: false,
}));

export function TestClockHeader({
  timer,
  receivedAt,
  onTimeUp,
  progress,
}: {
  timer: TestTimer;
  /** When the view carrying `timer` arrived (the query's `dataUpdatedAt`). */
  receivedAt: number;
  /** Once, when the time is up: the screen hands the test in. */
  onTimeUp: () => void;
  /** The progress row as every run shows it. */
  progress: ComponentProps<typeof ProgressRow>;
}) {
  const { t } = useTranslation('practice');
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const hinted = useRef(false);
  const line = clockLine(leftNow(timer.remaining_ms, receivedAt, now));
  const soon = line?.soon === true;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const up = line === null;
  useEffect(() => {
    if (up && !fired.current) {
      fired.current = true;
      onTimeUp();
    }
  }, [up, onTimeUp]);

  // The quiet hint, said once when it first appears — not every minute after it.
  const count = line?.count ?? 0;
  useEffect(() => {
    if (soon && !hinted.current) {
      hinted.current = true;
      announce(`${t('timer.left', { count })} ${t('timer.soon')}`);
    }
  }, [soon, count, t]);

  // Only a new minute (or the gentle sentence) reaches the screen, never every tick.
  useEffect(() => {
    useTestClock.setState({ minutes: count, soon });
    return () => useTestClock.setState({ minutes: null, soon: false });
  }, [count, soon]);

  return <ProgressRow {...progress} />;
}
