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

import { useDraft } from '../../lib/drafts.js';
import { tapped } from '../../lib/perf.js';
import { AnswerShell } from './AnswerShell.js';
import {
  STAFF_ANSWER_MIN,
  StaffAnswer,
  emptyStaffAnswer,
  readStaffDraft,
  staffComplete,
  staffLineOf,
  type StaffAnswerState,
} from './StaffAnswer.js';
import { StaffKeys } from './StaffKeys.js';

type Props = {
  surface: StaffWriteSurface;
  /** Where her half-written line is kept (`lib/drafts.ts`): one draft per question. */
  draftKey: string;
  disabled: boolean;
  /** Her line, as it travels (`staffLineOf`). */
  onCheck: (line: string) => void;
};

export function StaffWriting({ surface, draftKey, disabled, onCheck }: Props) {
  const { t } = useTranslation('practice');
  // Im Entwurf und nicht nur im Zustand (issue #275): ein Farbwechsel baut den Bildschirm neu auf,
  // und ihre halbe Zeile war danach weg. Je Frage ein Entwurf, wie bei den Brettern: die nächste
  // Frage beginnt mit einer leeren Zeile, und nichts Geschriebenes rutscht hinein.
  const draft = useDraft(draftKey);
  const answer = readStaffDraft(draft.text) ?? emptyStaffAnswer(surface.bars);
  const onChange = (next: StaffAnswerState) => draft.setText(JSON.stringify(next));
  const parts = { surface, answer, disabled, onChange };
  return (
    <AnswerShell
      keeps={STAFF_ANSWER_MIN}
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
