// „Die Bewertung stimmt nicht" — der Weg gegen ein Urteil, das schon gefällt ist (issue #164).
//
// Die Regelprüfung ist absichtlich sicher, und diese Sicherheit kann für einen Schlüssel
// einstehen, den niemand geprüft hat: der externe Audit setzte `8` auf „6 + 4" und sah zu,
// wie die richtige Antwort `10` abgelehnt wurde. #157 fängt das ab, wo Rechnen es entscheidbar
// macht — bei allem anderen ist die Einzige, die es sehen kann, das Kind davor. Regel 5 gilt
// auch gegen die eigene App.
//
// Darum steht die Kontrolle hier und nicht in einem Formular (Regel 16): ein Tipp am Urteil,
// ein Satz, der sagt was passiert, ein Knopf. Kein Freitextfeld, keine Begründungspflicht,
// keine Zahl (Regel 6).
//
// Was der Zettel NICHT behauptet: dass jemand die Bewertung geprüft und ihr recht gegeben hat.
// Er sagt, was der Server wirklich tut — die Frage zählt nicht mehr, sie kommt nicht wieder,
// der Lernstand geht auf den Stand von vorher zurück (`disputeVerdict`, practice/service.ts).

import type { ItemKind } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Sheet } from '../lb/Sheet.js';

/** Was über eine Frage im Blick auf „Gegenrede" bekannt ist. */
export type VerdictState = {
  /** Die Frage ist noch offen — es gibt noch kein Urteil. */
  open: boolean;
  /** Der Status der Sitzung (`SessionView.status`). */
  sessionStatus: string;
  /** Ein laufender Probetest: die Ergebnisse kommen am Ende. */
  testing: boolean;
  /** Der Modus der Sitzung; `help` wird geholfen, nicht bewertet. */
  mode: string;
  /** Woher die Frage kommt (`items.origin`); Hausaufgaben werden nicht bewertet. */
  origin: string;
  /** Die Art der Frage: ein langer Text bekommt Rückmeldung, nie ein Urteil (#258). */
  kind?: ItemKind;
};

/**
 * Ob es hier etwas zu bestreiten gibt. Dieselbe Bedingung hält der Server (409 `not_judged`,
 * 409 `dispute_not_allowed`); hier entscheidet sie nur, ob der Knopf zu sehen ist.
 *
 * Offen heißt: noch kein Urteil — dafür gibt es „Frage passt nicht". Im Probetest kommen die
 * Ergebnisse am Ende, und Hausaufgaben werden geholfen statt bewertet. Ein langer Text wird nie
 * bewertet (`not_an_attempt`, #258): auch dort gibt es nichts zu bestreiten.
 */
export function canDisputeVerdict(q: VerdictState): boolean {
  return (
    !q.open &&
    q.sessionStatus === 'active' &&
    q.mode !== 'help' &&
    !q.testing &&
    q.origin !== 'homework' &&
    q.kind !== 'essay'
  );
}

/** Der stille Knopf am Urteil. */
export function DisputeVerdictButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('practice');
  return (
    <Btn
      size="sm"
      variant="ghost"
      pill
      disabled={disabled}
      onPress={onPress}
      accessibilityHint={t('dispute.hint')}
    >
      {t('dispute.button')}
    </Btn>
  );
}

/**
 * Die Rückfrage. Sagt in einem Satz, was passiert — und behauptet nichts darüber, wer recht
 * hat. Schließbar über den sichtbaren Knopf in der Lade (Regel 14).
 */
export function DisputeVerdictSheet({
  visible,
  busy,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation(['practice', 'common']);
  return (
    <Sheet
      visible={visible}
      title={t('practice:dispute.sheet_title')}
      closeLabel={t('common:actions.cancel')}
      onClose={onClose}
    >
      <Text style={TYPE.body}>{t('practice:dispute.sheet_body')}</Text>
      <Btn full busy={busy} onPress={onConfirm}>
        {t('practice:dispute.confirm')}
      </Btn>
    </Sheet>
  );
}
