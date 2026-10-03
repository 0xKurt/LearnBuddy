// The head of a practice test she asked to sit with time (issue #241): the usual progress row
// with the time left in a small chip at its end, and one quiet line under it.
//
// Calm on purpose (lib/practice/testClock.ts): whole minutes, no red, no seconds ticking. The
// line under the row says the test's rule ("Eine Antwort pro Frage, keine Tipps.") and changes
// once, at five minutes, to a gentle sentence — said once to a screen reader too. Nothing else
// moves. It ticks in its own component, so the rest of the practice screen is not rendered
// again every second.

import type { TestTimer } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { clockLine, leftNow } from '../../lib/practice/testClock.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Chip } from '../lb/Chip.js';
import { ProgressRow } from './Question.js';

/** How often it looks at the clock. A display in whole minutes needs no more. */
const TICK_MS = 1_000;

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
  /** The progress row as every run shows it; the clock stands at its end, after its controls. */
  progress: ComponentProps<typeof ProgressRow>;
}) {
  const { palette } = useTheme();
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

  return (
    <>
      <ProgressRow
        {...progress}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            {progress.right}
            {/* Its own box: a Chip aligns itself to the top, the row centres its parts. */}
            <View>
              <Chip
                tone="primary"
                icon="clock"
                accessibilityLabel={line ? t('timer.left', { count: line.count }) : t('timer.up')}
              >
                {line ? t('timer.chip', { count: line.count }) : t('timer.chip', { count: 0 })}
              </Chip>
            </View>
          </View>
        }
      />
      <Text
        testID="test-clock"
        style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}
      >
        {soon ? t('timer.soon') : t('timer.note')}
      </Text>
    </>
  );
}
