// Die Notenzeile, auf die sie selbst schreibt (issue #226, Plan 4). Eine Geste — tippen:
//
//   · **Ein Tipp auf eine Linie oder einen Zwischenraum setzt dort eine Note**, und sie
//     **klingt sofort**. Das ist die Rückmeldung, auf die es hier ankommt: sie hört, ob die
//     Linie, die sie getroffen hat, die gemeinte ist, bevor irgendjemand ein Urteil fällt.
//   · **Darunter wählt sie den Wert** (`Segmented`, dieselbe Reihe, mit der die App überall eine
//     von wenigen Möglichkeiten wählen lässt), setzt einen **Punkt**, ein **Kreuz** oder eine
//     **Pause**, und nimmt mit **Zurück** das letzte Zeichen weg.
//   · **„Anhören" spielt ihre ganze Zeile** — dieselbe Pille wie über der Frage.
//
// Geprüft wird mit „Prüfen" wie bei allem anderen; der Server vergleicht Tonnamen, Dauern und
// Taktfüllung und nennt die Stelle (`modules/practice/staff.ts`).
//
// ─────────────── Jede Stelle ist ein eigener Knopf ───────────────
//
// Dreizehn Stellen je Takt (eine Hilfslinie über und unter den fünf Linien), und jede ist ein
// echter Knopf mit einem Namen: „C in Takt 1 setzen". Nicht EINE Fläche, deren Berührungspunkt
// die Tonhöhe entscheidet — das war der erste Entwurf, und er fiel durch, weil `locationY` auf
// den Wegen, auf denen diese App läuft, nicht dasselbe bedeutet (im Browser rechnet
// `react-native-web` es aus dem Rahmen, im Testbaum gibt es gar keinen Rahmen), und weil eine
// Fläche, deren Bedeutung am Berührungspunkt hängt, mit dem Screenreader nicht bedienbar ist.
// Einzelne Knöpfe sind auf jedem Weg dasselbe und auf jedem Weg prüfbar.
//
// **Und sie sind 11 pt hoch, nicht 44.** Das ist eine Abweichung von CLAUDE.md, und sie ist
// bewusst: eine Stelle IST ein halber Linienabstand, und 44 pt je Stelle hieße 13 × 44 = 572 pt
// nur für die Zeile — auf einem 360×740-Handy bleiben unter der Frage und über „Prüfen" 459 pt.
// Die Zeile wäre also nicht mehr ganz zu sehen, und „alles sichtbar, nichts zu suchen" ist die
// Regel, die hier schwerer wiegt (Regel 16). Was den Tausch tragbar macht: ein Knopf ist dabei
// immer noch etwa 129 pt BREIT, er trägt seinen Namen, er klingt in dem Moment, in dem er
// getroffen wird, und daneben zu treffen kostet einen Tipp auf „Zurück" („rückgängig statt
// bestätigen", docs/UX-PRINCIPLES.md). Die geprüfte Alternative — sie wählt den Tonnamen aus
// einer Reihe 44 pt großer Pillen und die App setzt ihn auf die Linie — hält die Regel ein und
// nimmt ihr genau das weg, was hier geübt wird: die Note selbst auf die Linie zu setzen.
//
// Gezeichnet wird mit `components/math/StaffLine.tsx`, also mit demselben Zeichner wie die Zeile,
// die sie LIEST: eine Viertel sieht hier so aus wie dort.

import {
  BARS_MAX,
  ELEMENTS_PER_BAR_MAX,
  NOTE_VALUES,
  STAFF_STEP_MAX,
  barTicks,
  dottedRestOk,
  pitchAtStep,
  renderStaffLine,
  ticksOf,
  type NoteValue,
  type StaffElement,
  type StaffWriteSurface,
} from '@learnbuddy/shared-types/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { playPitch } from '../../lib/music/play.js';
import { elementWord, noteWord, stepWord, valueWord } from '../../lib/music/words.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Segmented } from '../lb/Segmented.js';
import { toast } from '../lb/Toast.js';
import { Staff, barsStartX, staffHeight, stepsOfBars } from '../math/StaffLine.js';
import { StaffPlayButton } from './StaffPlayButton.js';

/**
 * Der Linienabstand der Schreibfläche: 22 pt, also 11 pt je Stelle und 220 pt für die Zeile.
 *
 * Gerechnet für das 360×740-Handy (Regel 16): von den 459 pt, die unter einer zweizeiligen Frage
 * und über der „Prüfen"-Leiste bleiben, nimmt die Zeile 220, der Abspielknopf 44, die Zeile in
 * Worten 36, die Werte 44, die Tasten 44 und die Abstände 40 — zusammen 428. Bei dreizeiliger
 * Frage (404 pt) gibt der Bereich nach wie das Brett (`app/practice/[id].tsx`).
 */
const GAP = 22;

/** Die Stellen, auf die sie tippen kann: von oben nach unten, eine Hilfslinie über und unter. */
const STEPS: readonly number[] = Array.from(
  { length: 2 * STAFF_STEP_MAX + 1 },
  (_, i) => STAFF_STEP_MAX - i,
);

/** Was sie bisher geschrieben hat, und womit sie gerade schreibt. */
export type StaffAnswerState = {
  /** Je Takt die Zeichen darin; ein leerer Takt ist erlaubt (sie hat ihn noch nicht gefüllt). */
  bars: StaffElement[][];
  value: NoteValue;
  dotted: boolean;
  sharp: boolean;
};

/** Eine leere Fläche: so viele Takte, wie die Aufgabe hat, und die Viertel voreingestellt. */
export function emptyStaffAnswer(bars: number): StaffAnswerState {
  return {
    bars: Array.from({ length: Math.max(1, Math.min(bars, BARS_MAX)) }, () => []),
    value: 'quarter',
    dotted: false,
    sharp: false,
  };
}

/**
 * Darf „Prüfen" an? Erst wenn in jedem Takt etwas steht. Eine halb geschriebene Zeile ist keine
 * schwächere Antwort, sondern eine, die noch nicht gegeben wurde — dieselbe Regel wie beim Brett
 * (`boardComplete`).
 */
export function staffComplete(answer: StaffAnswerState): boolean {
  return answer.bars.length > 0 && answer.bars.every((bar) => bar.length > 0);
}

/** Ihre Zeile, wie sie als Antwort reist (`renderStaffLine`, der Server liest sie zurück). */
export function staffLineOf(answer: StaffAnswerState): string {
  return renderStaffLine(answer.bars);
}

type Props = {
  surface: StaffWriteSurface;
  answer: StaffAnswerState;
  disabled: boolean;
  onChange: (next: StaffAnswerState) => void;
};

export function StaffAnswer({ surface, answer, disabled, onChange }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  const [width, setWidth] = useState(0);
  const height = staffHeight(GAP);
  const capacity = barTicks(surface.time);
  const ticksIn = (bar: readonly StaffElement[]) =>
    bar.reduce((sum, el) => sum + ticksOf(el.value, el.dotted), 0);
  /** Der Takt, der als Nächstes gefüllt wird — und der, in den eine Pause kommt. */
  const unfilled = answer.bars.findIndex((bar) => ticksIn(bar) < capacity);
  const active = unfilled === -1 ? answer.bars.length - 1 : unfilled;

  function put(bar: number, element: StaffElement): void {
    const target = answer.bars[bar] ?? [];
    if (target.length >= ELEMENTS_PER_BAR_MAX) {
      toast.show(t('staff.bar_crowded', { n: bar + 1 }), 'info');
      return;
    }
    onChange({ ...answer, bars: answer.bars.map((b, i) => (i === bar ? [...b, element] : b)) });
  }

  /** Was auf dieser Stelle landet — mit Kreuz, wo es eines gibt (sonst ohne, siehe `canSharp`). */
  const pitchAt = (step: number) => pitchAtStep(step, surface.clef, answer.sharp);

  function tapStep(bar: number, step: number): void {
    const pitch = pitchAt(step);
    // Sofort hören, was gesetzt wurde — darum geht es auf dieser Fläche (issue #226).
    playPitch(pitch);
    put(bar, { el: 'note', pitch, value: answer.value, dotted: answer.dotted });
  }

  function addRest(): void {
    // Eine punktierte ganze oder halbe Pause gibt es nicht (`dottedRestOk`): der Punkt fällt weg,
    // und die Zeile in Worten darunter sagt, was wirklich gesetzt wurde.
    put(active, {
      el: 'rest',
      value: answer.value,
      dotted: answer.dotted && dottedRestOk(answer.value),
    });
  }

  function undo(): void {
    for (let i = answer.bars.length - 1; i >= 0; i--) {
      if ((answer.bars[i] as StaffElement[]).length === 0) continue;
      onChange({ ...answer, bars: answer.bars.map((b, k) => (k === i ? b.slice(0, -1) : b)) });
      return;
    }
  }

  const written = answer.bars
    .map((bar, i) =>
      tm('staff.bar_list', {
        n: i + 1,
        list:
          bar.length === 0
            ? tm('staff.bar_empty')
            : bar.map((el) => elementWord(tm, el)).join(', '),
      }),
    )
    .join('. ');
  const empty = answer.bars.every((bar) => bar.length === 0);

  return (
    <View style={{ gap: SPACE.sm }}>
      <View
        style={{ alignSelf: 'stretch', height }}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== width) setWidth(w);
        }}
      >
        {width > 0 ? (
          <Staff
            clef={surface.clef}
            time={surface.time}
            bars={answer.bars}
            steps={stepsOfBars(answer.bars, surface.clef)}
            width={width}
            gap={GAP}
            equalBars
            activeBar={active}
          />
        ) : null}
        {/* Die Knöpfe liegen ÜBER der Zeichnung und teilen sich die Breite mit Flexbox, nicht mit
            gemessenen Zahlen: so sitzen sie schon im ersten Bild richtig, und sie stimmen mit den
            gezeichneten Takten überein, weil die alle gleich breit sind (`equalBars`). */}
        <View
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height, flexDirection: 'row' }}
        >
          {/* Vor dem ersten Takt stehen Schlüssel und Taktart; dort wird nicht geschrieben. */}
          <View style={{ width: barsStartX(GAP, true) }} />
          {answer.bars.map((_, bar) => (
            <View key={bar} testID={`staff-bar-${bar + 1}`} style={{ flex: 1 }}>
              {STEPS.map((step) => (
                // Kein `Btn`: das hier ist kein CTA, sondern die Zeichenfläche selbst — wie ein
                // Teil des Bruchbalkens (Regel 13). Und niemals eine Hintergrundfarbe darauf.
                <Pressable
                  key={step}
                  accessibilityRole="button"
                  // Der Name sagt, was der Knopf setzt UND wo — derselbe Tonname kommt in
                  // einem Schlüssel zweimal vor, und zwei gleich benannte Knöpfe sind mit
                  // dem Screenreader nicht auseinanderzuhalten (`stepWord`).
                  accessibilityLabel={t('staff.place', {
                    note: noteWord(tm, pitchAt(step).name),
                    where: stepWord(tm, step),
                    bar: bar + 1,
                  })}
                  disabled={disabled}
                  onPress={() => tapStep(bar, step)}
                  style={{ height: GAP / 2 }}
                />
              ))}
            </View>
          ))}
          <View style={{ width: GAP * 0.4 }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
        <StaffPlayButton
          bars={answer.bars.filter((bar) => bar.length > 0)}
          tempo={surface.tempo}
          disabled={disabled || empty}
        />
      </View>
      {/* Die Zeile in Worten: das Signal, das nicht die Farbe ist, und was ein Screenreader hört. */}
      <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
        {written}
      </Text>
      <Segmented
        size="sm"
        value={answer.value}
        onChange={(value) => onChange({ ...answer, value })}
        options={NOTE_VALUES.map((value) => ({
          value,
          label: valueWord(tm, value, false, false),
        }))}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
        {/* Punkt und Kreuz sind SCHALTER, nicht eine Wahl aus mehreren: ihr Zustand steht im
            NAMEN und nicht in `selected` (das macht aus dem Knopf ein Radio, und ein einzelnes
            Radio sagt etwas Falsches). Dieselbe Entscheidung wie auf dem Brett. */}
        <Toggle
          label={t('staff.dot')}
          on={answer.dotted}
          disabled={disabled}
          onPress={() => onChange({ ...answer, dotted: !answer.dotted })}
        />
        <Toggle
          label={t('staff.sharp')}
          on={answer.sharp}
          disabled={disabled}
          onPress={() => onChange({ ...answer, sharp: !answer.sharp })}
        />
        <Btn size="sm" pill compact variant="outline" disabled={disabled} onPress={addRest}>
          {t('staff.rest')}
        </Btn>
        <Btn size="sm" pill compact variant="ghost" disabled={disabled || empty} onPress={undo}>
          {t('staff.undo')}
        </Btn>
      </View>
    </View>
  );
}

/**
 * Ein Schalter als Pille: eingeschaltet sieht er gefüllt aus UND heißt anders („Punkt, ist an").
 * Die Farbe ist nie das einzige Signal, und ein Screenreader hört den Zustand im Namen.
 */
function Toggle({
  label,
  on,
  disabled,
  onPress,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('practice');
  return (
    <Btn
      size="sm"
      pill
      compact
      variant={on ? 'primary' : 'outline'}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={on ? t('staff.toggle_on', { label }) : label}
    >
      {label}
    </Btn>
  );
}
