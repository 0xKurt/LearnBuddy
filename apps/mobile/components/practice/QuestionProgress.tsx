// The head of the question column: where she is in the run (the progress row) with the question's
// one quiet action at its end (`QuestionCorner`), and in homework help or a test the one line that
// says so. A test she asked to sit with time (issue #241) shows the time left in a small chip at
// the end of the same row, and the one line under it — the header does not grow. Moved out of
// `app/practice/[id].tsx` (issue #311).

import type { ItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { QuestionView } from '../../lib/practice/questionView.js';
import type { CornerAction } from '../../lib/practice/useCornerConfirm.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { canDisputeVerdict } from './DisputeVerdict.js';
import { ProgressRow } from './Question.js';
import { QuestionCorner } from './QuestionCorner.js';
import { TestClockHeader } from './TestClock.js';

type Props = {
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
  item,
  open,
  testing,
  flaggable,
  progress,
  disabled,
  onCorner,
  receivedAt,
  onTimeUp,
}: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const corner = (
    <QuestionCorner
      flaggable={flaggable}
      // A judgement she has been given and may disagree with (issue #164). The
      // rule lives in components/practice/DisputeVerdict.tsx.
      canDispute={canDisputeVerdict({
        open,
        sessionStatus: session.status,
        testing,
        mode: session.mode,
        origin: item.origin,
        kind: item.kind,
      })}
      disabled={disabled}
      onFlag={() => onCorner('flag')}
      onDispute={() => onCorner('dispute')}
    />
  );
  if (testing && session.timer)
    return (
      <TestClockHeader
        timer={session.timer}
        receivedAt={receivedAt}
        onTimeUp={onTimeUp}
        progress={{ ...progress, right: corner }}
      />
    );
  return (
    <>
      <ProgressRow {...progress} right={corner} />
      {session.mode === 'help' || testing ? (
        <Text style={[TYPE.small, { color: palette.primaryDk, fontWeight: '500' }]}>
          {t(testing ? 'test_note' : 'help_note')}
        </Text>
      ) : null}
    </>
  );
}
