// Einen gehörten Rhythmus nachklopfen (issue #445), in der Antworthülle wie jede andere Form
// (issue #310): das große Klopffeld im Antwortplatz, darüber ihre Schläge als Punkte und
// „Neu klopfen", darunter „Prüfen" in der einen Leiste. Gehört wird über „Anhören" unter der Frage
// (`QuestionTools`, der eine Hör-Hook); geklopft wird hier.
//
// Ein Schlag zählt, wenn der Finger AUFSETZT (`PadKey instant`): das ist der Moment, in dem sie
// trifft, nicht der, in dem sie loslässt. Gemessen mit der monotonen Uhr des Geräts
// (`performance.now()`), die keine Uhrzeit kennt und nicht springt; was reist, sind nur die
// Abstände vom ersten Schlag (`renderTaps`). Ob der Rhythmus sitzt, misst der Server
// (`practice/rhythm.ts`) — hier wird nichts beurteilt, nur gezählt, was sie getan hat.
//
// Die Punkte zeigen, dass jeder Schlag angekommen ist — nicht, ob er richtig war: das sagt erst
// „Prüfen". „Neu klopfen" steht da, sobald es etwas zurückzunehmen gibt, und nimmt alles zurück,
// ohne zu fragen (rückgängig statt bestätigen, docs/UX-PRINCIPLES.md); nach „Prüfen" beginnt sie
// ohnehin von vorn.

import { TAPS_MAX, renderTaps } from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { tapped } from '../../lib/perf.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from '../lb/Btn.js';
import { PadKey } from '../lb/PadKey.js';
import { AnswerShell } from './AnswerShell.js';

/** Wie hoch das Klopffeld sein will: drei Tippziele — groß genug, um blind zu treffen. */
const PAD = 3 * TOUCH;
/** Wie weit es nachgibt, wenn Buddys Antwort darüber Platz braucht: zwei Tippziele. */
const PAD_MIN = 2 * TOUCH;
/** Was der Antwortplatz behält: die Zeile mit „Neu klopfen", der Abstand, das kleinste Feld. */
const TAPS_ANSWER_MIN = TOUCH + SPACE.sm + PAD_MIN;

type Props = {
  disabled: boolean;
  /** Ihre Schläge, wie sie reisen (`renderTaps`), und was bis zur Antwort im Gespräch steht. */
  onCheck: (taps: string, shown: string) => void;
};

export function RhythmTaps({ disabled, onCheck }: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const [taps, setTaps] = useState<number[]>([]);
  const counted = t('staff.tapped', { count: taps.length });
  return (
    <AnswerShell
      keeps={TAPS_ANSWER_MIN}
      answer={
        <View testID="answer-taps" style={{ flexShrink: 1, gap: SPACE.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH }}>
            <View
              // Her beats as one picture with a name — and nothing to name before the first.
              {...(taps.length > 0
                ? { accessible: true, accessibilityRole: 'image', accessibilityLabel: counted }
                : {})}
              style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs }}
            >
              {taps.map((_, i) => (
                <View
                  // Schläge kommen nur hinten dazu; die Stelle ist ihr Name.
                  key={i}
                  style={{
                    width: SPACE.sm,
                    height: SPACE.sm,
                    borderRadius: SPACE.xs,
                    backgroundColor: palette.primary,
                  }}
                />
              ))}
            </View>
            {/* Undo stands where there is something to undo; the row keeps its height. */}
            {taps.length > 0 ? (
              <Btn
                variant="ghost"
                size="sm"
                icon="undo"
                disabled={disabled}
                onPress={() => setTaps([])}
              >
                {t('staff.taps_again')}
              </Btn>
            ) : null}
          </View>
          <View style={{ height: PAD, minHeight: PAD_MIN, flexShrink: 1 }}>
            <PadKey
              fill
              instant
              quiet
              sign={t('staff.taps_pad')}
              accessibilityLabel={t('staff.taps_pad')}
              disabled={disabled}
              onPress={() => {
                // Read the clock now, in the touch — not later, when React gets to the update.
                const at = performance.now();
                setTaps((before) => (before.length < TAPS_MAX ? [...before, at] : before));
              }}
            />
          </View>
        </View>
      }
      action={{
        // Ein Schlag ist noch kein Rhythmus: „Prüfen" wartet auf den zweiten.
        ready: taps.length >= 2,
        disabled,
        waitsHint: t('staff.taps_waits'),
        onPress: () => {
          tapped('check');
          onCheck(renderTaps(taps), counted);
          setTaps([]);
        },
      }}
    />
  );
}
