// Die Notenzeile, auf die sie schreibt (issue #226), in der Antworthülle wie jede andere Form
// (issue #310): oben der freie Platz, dann die Zeile, ihre Tasten im `keys`-Platz darunter (die
// eine Tastenreihe, `StaffKeys`), direkt darunter „Prüfen" in derselben Leiste wie bei Tabelle,
// Ordnen und Zuordnen — unten, wie jede Antwort (#386). Kein ScrollView (issue #275): die Zeile nimmt ihre Höhe aus dem
// Platz, der da ist (`StaffAnswer`), die Tasten darunter sind fest — und nie weniger als die
// engste Zeile (`keeps`): fehlt der Platz, sagt es der Walkthrough (`fit.ts`), statt dass die
// Tasten still unter „Prüfen" rutschen.

import type { StaffWriteSurface } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { tapped } from '../../lib/perf.js';
import { SPACE } from '../../lib/theme/space.js';
import { AnswerShell } from './AnswerShell.js';
import {
  STAFF_ANSWER_MIN,
  StaffAnswer,
  staffComplete,
  staffLineOf,
  type StaffAnswerState,
} from './StaffAnswer.js';
import { StaffKeys } from './StaffKeys.js';

type Props = {
  surface: StaffWriteSurface;
  answer: StaffAnswerState;
  disabled: boolean;
  onChange: (next: StaffAnswerState) => void;
  /** Her line, as it travels (`staffLineOf`). */
  onCheck: (line: string) => void;
};

export function StaffWriting({ surface, answer, disabled, onChange, onCheck }: Props) {
  const { t } = useTranslation('practice');
  const parts = { surface, answer, disabled, onChange };
  return (
    <AnswerShell
      keeps={STAFF_ANSWER_MIN + SPACE.sm}
      answer={
        <View testID="answer-staff" style={{ flexShrink: 1, minHeight: STAFF_ANSWER_MIN }}>
          <StaffAnswer {...parts} />
        </View>
      }
      keys={<StaffKeys {...parts} />}
      action={{
        // Nichts zu prüfen, solange ein Takt noch leer ist: eine halb geschriebene Zeile wäre
        // eine Antwort, die noch nicht gegeben wurde.
        ready: staffComplete(answer),
        disabled,
        waitsHint: t('staff.check_waits'),
        onPress: () => {
          tapped('check');
          onCheck(staffLineOf(answer));
        },
      }}
    />
  );
}
