// The time left in a practice test she asked to sit with time (issue #241): one quiet line in
// the place the test note always stands, so the header neither grows nor jumps.
//
// No countdown red, no seconds ticking (lib/practice/testClock.ts): whole minutes, and at five
// minutes one gentle sentence, said once to a screen reader too. The line ticks in its own
// component so the rest of the practice screen is not rendered again every second.

import type { TestTimer } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { announce } from '../../lib/announce.js';
import { clockLine, leftNow } from '../../lib/practice/testClock.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** How often the line looks at the clock. A minute display needs no more. */
const TICK_MS = 1_000;

export function TestClock({
  timer,
  receivedAt,
  onTimeUp,
}: {
  timer: TestTimer;
  /** When the view carrying `timer` arrived (the query's `dataUpdatedAt`). */
  receivedAt: number;
  /** Once, when the time is up: the screen hands the test in. */
  onTimeUp: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const hinted = useRef(false);
  const left = leftNow(timer.remaining_ms, receivedAt, now);
  const line = clockLine(left);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (line === null && !fired.current) {
      fired.current = true;
      onTimeUp();
    }
  }, [line === null]);

  const soon = line?.key === 'timer.soon';
  const text = line ? t(line.key, { count: line.count }) : t('timer.up');
  // The quiet hint, said once when it first appears — not every minute after it.
  useEffect(() => {
    if (soon && !hinted.current) {
      hinted.current = true;
      announce(text);
    }
  }, [soon]);

  return (
    <Text
      testID="test-clock"
      style={[TYPE.small, { color: palette.primaryDk, fontWeight: soon ? '600' : '500' }]}
    >
      {text}
    </Text>
  );
}
