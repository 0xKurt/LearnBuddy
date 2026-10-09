// What the practice screen shows when no question is left to answer — also when the time of a
// test with time is up (issue #241): no question stays on screen to be answered into the void.
// The result once the run is finished (`RunResult`); while the next questions are still being
// written (issue #220) or the run is being finished, a calm wait; and when finishing failed (with
// a retry) or the run ended without a result, the way back to Buddy. Moved out of
// `app/practice/[id].tsx` (issue #311).

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { backToBuddy } from '../../lib/practice/useSessionEnd.js';
import { LoadingState } from '../lb/LoadingState.js';
import { Screen } from '../lb/Screen.js';
import { PracticeStuck } from './PracticeStuck.js';
import { RunResult } from './RunResult.js';

type Props = {
  session: SessionView;
  title: string;
  /** The time of a test she sat with time is up (issue #241). */
  timeUp: boolean;
  /** Finishing the run failed: it can be tried again. */
  finishFailed: boolean;
  /** The run ended while this screen was open: its end is a moment (SessionSummary). */
  celebrate: boolean;
  busy: boolean;
  onCards: () => void;
  onRetry: () => void;
};

export function NoQuestion({
  session,
  title,
  timeUp,
  finishFailed,
  celebrate,
  busy,
  onCards,
  onRetry,
}: Props) {
  const { t } = useTranslation('practice');
  if (session.status === 'finished' && session.summary) {
    return (
      <RunResult
        session={session}
        summary={session.summary}
        title={title}
        celebrate={celebrate}
        busy={busy}
        onCards={onCards}
        onBack={backToBuddy}
      />
    );
  }
  const active = session.status === 'active';
  // She answered the questions the run started with and the rest is still being written
  // (issue #220). Not a result and not an error — the next questions are on their way, and the
  // screen asks for them until they are there (`usePracticeSession`).
  const coming = active && session.preparing && !timeUp;
  if (coming || (active && !finishFailed)) {
    const waitsFor = coming ? 'more_coming' : timeUp ? 'timer.up' : 'finishing';
    return (
      <Screen title={title}>
        <LoadingState label={t(waitsFor)} />
      </Screen>
    );
  }
  // Finishing failed (retry), or the session ended without a result (abandoned).
  return (
    <PracticeStuck
      title={title}
      message={active ? t('finish_failed') : t('ended')}
      onBack={backToBuddy}
      {...(active ? { onRetry } : {})}
    />
  );
}
