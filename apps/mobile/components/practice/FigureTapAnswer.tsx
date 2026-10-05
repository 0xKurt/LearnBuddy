// A question she answers by tapping a place in its figure (issue #248), as a board in the answer
// shell like the fraction bar (#162, #402): the figure stands at the bottom, where every answer
// stands; the place she tapped is her answer, "Prüfen" sends it, and the bar's field is her
// question to Buddy. The figure is here INSTEAD of in the question card — one drawing, the one she
// works on. The tapping itself is `TapFigure` (components/math), the one mechanism for every
// tappable figure.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import type { Tappable } from '../../../../packages/shared-math/src/tap.js';
import { TapFigure } from '../math/TapFigure.js';
import { boardCap } from '../../lib/practice/visuals.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { AnswerShell } from './AnswerShell.js';

type Props = {
  figure: Tappable & Figure;
  /** Her answer so far: the place she tapped, written as a key is (the screen keeps the draft). */
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onCheck: (text: string) => void;
};

export function FigureTapAnswer({ figure, value, disabled, onChange, onCheck }: Props) {
  const { t } = useTranslation('practice');
  // A tall figure — the map of Germany — is drawn narrower rather than push "Prüfen" away.
  const maxHeight = boardCap(useVisibleHeight().visible);
  return (
    <AnswerShell
      keeps="whole"
      answer={
        <TapFigure
          figure={figure}
          value={value}
          disabled={disabled}
          onChange={onChange}
          maxHeight={maxHeight}
        />
      }
      action={{
        ready: value !== '',
        disabled,
        onPress: () => onCheck(value),
        waitsHint: t('tap.check_waits'),
      }}
    />
  );
}
