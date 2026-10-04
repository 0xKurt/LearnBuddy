// Mehrere richtige Antworten (issue #240): „Kreuze alle richtigen an“. Dieselben Kacheln wie bei
// der Auswahl mit einer Antwort (`ChoiceList`, `AnswerTile`), nur ist jede ein Kontrollkästchen:
// ein Tipp kreuzt an, ein zweiter nimmt das Kreuz wieder weg (rückgängig statt bestätigen,
// docs/UX-PRINCIPLES.md). Abgeschickt wird mit „Prüfen“ in der Antworthülle (`AnswerShell`,
// issue #310) — beurteilt auf dem Server, als Menge und ohne Modell
// (apps/api/src/modules/practice/selectAll.ts).
//
// Dass mehrere richtig sind, sagt eine einzige ruhige Zeile über den Kacheln, in derselben Form
// wie die eine Zeile Anleitung beim Zuordnen, und die eckigen Kästchen selbst. Nach dem ersten
// „Prüfen“ tritt die Zeile zur Seite: dann sagt es Buddys Antwort („1 von 3 richtigen hast du
// schon“), und auf 360×740 braucht genau die den Platz. Wie viele richtig sind, steht vorher
// nirgends: das zu finden ist die Aufgabe. Ihre Kreuze (und ob sie schon geprüft hat) stehen im
// Entwurf (`lib/drafts.ts`): sie überstehen den Wechsel hell/dunkel und einen Neustart.
//
// In der Hülle steht die Fläche wie die Auswahl mit einer Antwort (`keeps="whole"`, `flush`):
// dieselben Kacheln am selben Platz, unten direkt über „Prüfen“ (#386), und nichts darin rollt — die
// Obergrenzen im Vertrag sind so gemessen, dass das Größte passt (SELECT_*).

import type { SelectAllTaskView, StructuredAnswer } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDraft } from '../../lib/drafts.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { AnswerShell } from './AnswerShell.js';
import { ChoiceList } from './ChoiceList.js';
// The same reading of a kept list of ids as an order's: known ids only, each once.
import { placedFrom as chosenFrom } from './OrderAnswer.js';

/** One tap: an option without a tick gets one, a ticked one loses it. */
export function toggle(chosen: readonly string[], id: string): string[] {
  return chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
}

/** Nothing is "tried" here: a wrong set stays on the board for her to change. */
const NONE_TRIED: ReadonlySet<string> = new Set();

type Props = {
  view: SelectAllTaskView;
  /** Where her ticks are kept (`lib/drafts.ts`), per question. */
  draftKey: string;
  disabled: boolean;
  /** "Prüfen": at least one ticked; `shown` is what she ticked in words, for the thread. */
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

export function SelectAllAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { text: kept, setText: keep } = useDraft(draftKey);
  // Whether she has pressed "Prüfen" on this question before (then Buddy's reply says it).
  const { text: checkedOnce, setText: markChecked } = useDraft(`${draftKey}.checked`);
  const ids = view.options.map((o) => o.id);
  const known = new Set(ids);
  const chosen = chosenFrom(kept, known);
  const ticked = new Set(chosen.map((id) => ids.indexOf(id)));

  return (
    <AnswerShell
      keeps="whole"
      flush
      answer={
        <View style={{ gap: SPACE.sm }}>
          {checkedOnce ? null : (
            <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('select.several')}</Text>
          )}
          <ChoiceList
            choices={view.options.map((o) => o.text)}
            tried={NONE_TRIED}
            ticked={ticked}
            disabled={disabled}
            onChoose={(index) => {
              const id = ids[index];
              if (id !== undefined)
                keep((now) => JSON.stringify(toggle(chosenFrom(now, known), id)));
            }}
          />
        </View>
      }
      action={{
        ready: chosen.length > 0,
        disabled,
        onPress: () => {
          // In the order she sees them, as the server writes it into the thread.
          const shown = view.options.filter((o) => chosen.includes(o.id));
          markChecked('1');
          onSubmit(
            { type: 'select_all', chosen: shown.map((o) => o.id) },
            shown.map((o) => o.text).join('; '),
          );
        },
        waitsHint: t('select.check_waits'),
      }}
    />
  );
}
