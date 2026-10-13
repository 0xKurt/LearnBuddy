// Practice header adapters: honest progress under the title — with the clock of a timed test
// ticking behind it — and the existing flag/dispute confirmation flow behind its menu. What a
// run says about itself stands in the page, not in a strip under the head: a test's rule in the
// question card's meta line, homework's hint as a quiet line above the card (design
// ui_kits/app/Tasks.jsx `test`, Flows.jsx:50).

import type { ItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formDensity } from '../../lib/keyboard.js';
import type { QuestionView } from '../../lib/practice/questionView.js';
import type { CornerAction } from '../../lib/practice/useCornerConfirm.js';
import { QUESTION } from '../../lib/theme/question.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { canDisputeVerdict } from './DisputeVerdict.js';
import { Hint, ProgressRow } from './Question.js';
import { QuestionCorner } from './QuestionCorner.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { Sheet } from '../lb/Sheet.js';
import { TestClockHeader } from './TestClock.js';

type Props = {
  /** Count is already visible below the shared header title. */
  inHeader?: boolean;
  session: SessionView;
  item: ItemView;
  open: boolean;
  /** A running test (`questionOffers`). */
  testing: boolean;
  /** "Frage passt nicht" is offered (`questionOffers`). */
  flaggable: boolean;
  progress: QuestionView['progress'];
  disabled: boolean;
  /** Her tap on the corner's action; the sheet confirms it (`useCornerConfirm`). */
  onCorner: (action: CornerAction) => void;
  /** When the view carrying the test's timer arrived (the query's `dataUpdatedAt`). */
  receivedAt: number;
  onTimeUp: () => void;
};

export function QuestionProgress({
  session,
  inHeader = false,
  open,
  testing,
  progress,
  receivedAt,
  onTimeUp,
}: Props) {
  if (testing && session.timer)
    return (
      <TestClockHeader
        timer={session.timer}
        receivedAt={receivedAt}
        onTimeUp={onTimeUp}
        progress={{ ...progress, hideLabel: inHeader, active: open }}
      />
    );
  return <ProgressRow {...progress} hideLabel={inHeader} active={open} />;
}

/**
 * The head's second line: where she is and, in a test with time, how much of it is left
 * ("Frage 1 von 3 · noch 10 Min."; design ui_kits/app/Tasks.jsx:185). `minutes`: what the running
 * clock shows (`useTestClock`), null without one.
 */
export function progressLine(
  t: TFunction,
  progress: QuestionView['progress'],
  minutes: number | null,
): string {
  const where = progress.preparing
    ? t('practice:progress_more_coming', { current: progress.position })
    : t('practice:progress', { current: progress.position, total: progress.total });
  return minutes === null ? where : `${where} · ${t('practice:timer.chip', { count: minutes })}`;
}

/**
 * What a test says about itself in the question card's meta line: its rule, and from five
 * minutes on the one gentle sentence (null: not a test).
 */
export function testMeta(t: TFunction, testing: boolean, soon: boolean): string | null {
  if (!testing) return null;
  return t(soon ? 'practice:timer.soon' : 'practice:test_meta');
}

/**
 * Homework's quiet hint above the question (Flows.jsx:50), a body's step from the card. It steps
 * aside while she types in tight keyboard room, like the card's meta line.
 */
export function HomeworkHint() {
  const { t } = useTranslation('practice');
  const seen = useVisibleHeight();
  if (formDensity(seen.window, seen.overlap) === 'tight') return null;
  return (
    <View style={{ marginBottom: QUESTION.hintGap }}>
      <Hint testID="homework-hint">{t('help_note')}</Hint>
    </View>
  );
}

/** The question menu delegates to the same confirm flow as the former corner button. */
export function QuestionMenu({
  session,
  item,
  open,
  testing,
  flaggable,
  disabled,
  onCorner,
}: Pick<Props, 'session' | 'item' | 'open' | 'testing' | 'flaggable' | 'disabled' | 'onCorner'>) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation(['buddy', 'common']);
  const canDispute = canDisputeVerdict({
    open,
    sessionStatus: session.status,
    testing,
    mode: session.mode,
    origin: item.origin,
    kind: item.kind,
  });
  if (!flaggable && !canDispute) return null;
  const choose = (action: CornerAction) => {
    setVisible(false);
    onCorner(action);
  };
  return (
    <>
      <CircleBtn plain icon="more" disabled={disabled} onPress={() => setVisible(true)} />
      <Sheet
        visible={visible}
        title={t('buddy:menu.title')}
        closeLabel={t('common:actions.close')}
        onClose={() => setVisible(false)}
      >
        <QuestionCorner
          flaggable={flaggable}
          canDispute={canDispute}
          disabled={disabled}
          onFlag={() => choose('flag')}
          onDispute={() => choose('dispute')}
        />
      </Sheet>
    </>
  );
}
