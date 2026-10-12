import { useMore } from '../navigation/MoreProvider.js';
// Practice header adapters: honest progress and the timed-test clock beneath the title,
// with the existing flag/dispute confirmation flow behind its menu.

import type { ItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { useId, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { QuestionView } from '../../lib/practice/questionView.js';
import type { CornerAction } from '../../lib/practice/useCornerConfirm.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { canDisputeVerdict } from './DisputeVerdict.js';
import { ProgressRow } from './Question.js';
import { QuestionCorner } from './QuestionCorner.js';
import { CircleBtn } from '../lb/CircleBtn.js';
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
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  if (testing && session.timer)
    return (
      <TestClockHeader
        timer={session.timer}
        receivedAt={receivedAt}
        onTimeUp={onTimeUp}
        progress={{ ...progress, hideLabel: inHeader, active: open }}
      />
    );
  return (
    <>
      <ProgressRow {...progress} hideLabel={inHeader} active={open} />
      {session.mode === 'help' || testing ? (
        <Text style={[TYPE.meta, { color: palette.primaryDk }]}>
          {t(testing ? 'test_note' : 'help_note')}
        </Text>
      ) : null}
    </>
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
  const menu = useMore();
  const { t } = useTranslation(['buddy', 'common']);
  const canDispute = canDisputeVerdict({
    open,
    sessionStatus: session.status,
    testing,
    mode: session.mode,
    origin: item.origin,
    kind: item.kind,
  });
  const instance = useId();
  const identity = `${session.id}:${item.id}`;
  const menuOwner = `question:${instance}:${identity}`;
  const current = useRef({ identity, disabled, flaggable, canDispute, onCorner });
  current.current = { identity, disabled, flaggable, canDispute, onCorner };
  useLayoutEffect(
    () => () => menu?.cancel(menuOwner),
    [menu?.cancel, menuOwner, session.status, open, testing, flaggable, disabled],
  );
  const dispatch = (action: CornerAction) => {
    const now = current.current;
    if (
      now.identity !== identity ||
      now.disabled ||
      !(action === 'flag' ? now.flaggable : now.canDispute)
    )
      return;
    now.onCorner(action);
  };
  return (
    <CircleBtn
      plain
      icon="more"
      disabled={disabled}
      accessibilityLabel={t('buddy:menu.title')}
      onPress={() =>
        menu?.open({
          owner: menuOwner,
          content: (choose) => (
            <QuestionCorner
              flaggable={flaggable}
              canDispute={canDispute}
              disabled={disabled}
              onFlag={() => choose(() => dispatch('flag'))}
              onDispute={() => choose(() => dispatch('dispute'))}
            />
          ),
        })
      }
    />
  );
}
