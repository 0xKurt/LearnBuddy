// Die Notenzeile, auf die sie selbst schreibt (issue #226, Plan 4; Bedienung neu in #275).
//
//   · **Ein Tipp in einen Takt setzt dort eine Note, wo der Finger liegt**, und sie **klingt
//     sofort**. Der Takt ist EIN großes Tippziel (über die ganze Höhe der Zeile und die ganze
//     Breite des Takts), nicht dreizehn schmale Streifen.
//   · **„Höher" und „tiefer"** schieben die Note, die sie gerade gesetzt hat, um eine Stelle —
//     jede Stelle klingt. Die gesetzte Note steht violett und mit einem Ring da, bis die nächste
//     kommt: so sieht sie, WAS sich bewegt.
//   · Die Tasten dazu — höher, tiefer, Kreuz, Pause, Anhören, Zurück, der **Wert** (gezeichnete
//     Notenzeichen statt Wörtern) und der **Punkt** — stehen nicht hier, sondern in der einen
//     Tastenreihe unter der Zeile (`StaffKeys.tsx`, im `keys`-Platz der Antworthülle, issue #310).
//
// Geprüft wird mit „Prüfen" wie bei allem anderen; der Server vergleicht Tonnamen, Dauern und
// Taktfüllung und nennt die Stelle (`modules/practice/staff.ts`).
//
// ─────────────── Warum „setzen, dann schieben" (issue #275) ───────────────
//
// Die erste Fassung hatte dreizehn Knöpfe je Takt, jeder 11 pt hoch — eine Stelle IST ein halber
// Linienabstand, und 13 × 44 pt passen auf kein Handy. Das brach die 44-pt-Regel, und mit einem
// Kinderfinger auf einem 360er-Handy trifft man 11 pt eben nicht zuverlässig.
//
// So lösen es die Notations-Apps, die auf dem Handy wirklich benutzt werden: in Noteflight und
// Flat wählt man den Wert und tippt auf die Zeile, und die gesetzte Note bleibt AUSGEWÄHLT und
// lässt sich danach in Tonschritten verschieben (Flat: ziehen oder Pfeiltasten, ohne den
// Notenkopf genau treffen zu müssen); StaffPad spielt die Note beim Antippen und lässt sie hoch-
// und runterschieben. Das Muster ist überall dasselbe: **grob setzen, fein korrigieren, dabei
// hören.** Hier übernommen, mit sichtbaren Tasten statt einer Geste, die man erst kennen muss
// (genau der Preis, den #275 an „grob tippen, dann ↑/↓" bemängelt hat):
//
//   · Jedes Bedienelement ist ≥ 44 pt: der Takt (rund 100 × 200 pt), die Pfeile, jede Taste.
//     Die Tonhöhe ist kein Tippziel mehr, sondern ein Wert des Tipps, so wie die Stelle auf
//     einem Schieberegler — und ein Fehlgriff kostet einen Tipp auf „höher" oder „tiefer", nicht
//     „Zurück" und einen zweiten Versuch auf 11 pt.
//   · Die Zeile bleibt ganz zu sehen (Regel 16), mit Hilfslinien: nichts vom Inhalt fällt weg.
//   · Sie setzt die Note selbst auf die Linie — die Fähigkeit, die geübt wird, bleibt ihre. Die
//     Fläche sagt NICHT, welcher Ton unter dem Finger liegt (keine Beschriftung): sonst würde sie
//     „schieben, bis E dasteht" üben statt Noten lesen. Sie hört ihn, und ein Screenreader sagt
//     ihn — für jemanden, der die Linien nicht sieht, ist das die Zeile.
//
// Wo keine Fingerposition vorliegt (Tastatur, Screenreader-Doppeltipp, Testbaum), landet die
// Note auf der mittleren Linie — die Mitte des Takts ist genau dort, die Zeile ist symmetrisch —
// und wird mit denselben Pfeilen an ihren Platz geschoben. Ein Weg für alle, kein zweiter daneben.
//
// Gestochen wird mit `components/math/StaffLine.tsx` (VexFlow, issue #312), also mit demselben
// Stecher wie die Zeile, die sie LIEST: eine Viertel sieht hier so aus wie dort, und auf der
// Wert-Taste auch. Sichtbare Notennamen gibt es hier nie (`StaffFigure.labels` gilt nur für
// gelesene Zeilen): sie schreibt, was die Frage in Worten nennt.

import {
  BARS_MAX,
  ELEMENTS_PER_BAR_MAX,
  STAFF_STEP_MAX,
  barTicks,
  pitchAtStep,
  renderStaffLine,
  staffStep,
  ticksOf,
  NoteValue,
  StaffElement,
  type StaffWriteSurface,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { announce } from '../../lib/announce.js';
import { playPitch } from '../../lib/music/play.js';
import { useBox } from '../../lib/useBox.js';
import { barsWords, elementWord, stepWord } from '../../lib/music/words.js';
import { TapSurface } from '../lb/TapSurface.js';
import { toast } from '../lb/Toast.js';
import { Staff } from '../math/StaffLine.js';
import {
  SPACE_UNITS,
  TAIL_UNITS,
  headUnits,
  stepAtWriteY,
  writeHeight,
} from '../math/staff/geometry.js';

/**
 * Der engste und der weiteste Linienabstand der Schreibfläche. Die Zeile nimmt so viel Höhe, wie
 * der Bildschirm unter der Frage hergibt (je größer, desto genauer der erste Tipp), aber nie
 * weniger als 12 pt — darunter wird das Ablesen mühsam; so eng wird es nur unter einer langen Frage auf dem kleinsten Handy, nachdem Buddy geantwortet hat — und nie mehr als 26, weil die
 * Takte in der Breite mitwachsen und zwei Takte sonst nicht mehr nebeneinander passen.
 */
const GAP_MIN = 12;
const GAP_MAX = 26;
/**
 * Wie viele Linienabstände eine Zeile in der Breite braucht: Schlüssel und Taktart
 * (`headUnits`), je Takt sieben (Platz für drei bis vier Köpfe mit Vorzeichen; VexFlows
 * Köpfe und Pausen sind breiter als die alten, mit fünf stießen sie im vollen Takt aneinander,
 * #312) und der Schlussstrich.
 */
const WIDTH_IN_GAPS = (bars: number) => (headUnits(true) + TAIL_UNITS) / SPACE_UNITS + bars * 7;

/**
 * Die kleinste Höhe der Zeile: die engste, die sich noch ablesen lässt. Der Übungsbildschirm hält
 * sie frei (`app/practice/[id].tsx`, `keeps`); die Tasten darunter sind fest (`StaffKeys`).
 */
export const STAFF_ANSWER_MIN = writeHeight(GAP_MIN);

/** Die Stellen, die es gibt: eine Hilfslinie über und unter den fünf Linien. */
export const clampStep = (step: number) =>
  Math.max(-STAFF_STEP_MAX, Math.min(STAFF_STEP_MAX, step));

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
 * Ihre halb geschriebene Zeile, wie sie im Entwurf liegt (`lib/drafts.ts`): zu welcher Frage und
 * was darin steht. Ein Farbwechsel baut den Bildschirm neu auf, und Android beendet eine App im
 * Hintergrund ohne Vorwarnung — beides darf ihre Zeile nicht löschen (issue #275, im Walkthrough
 * gefunden: nach dem Wechsel auf dunkel war die Zeile leer).
 */
const StaffDraft = z.object({
  itemId: z.string(),
  answer: z.object({
    bars: z.array(z.array(StaffElement).max(ELEMENTS_PER_BAR_MAX)).min(1).max(BARS_MAX),
    value: NoteValue,
    dotted: z.boolean(),
    sharp: z.boolean(),
  }),
});
export type StaffDraft = { itemId: string; answer: StaffAnswerState };

/** Der Entwurf zurück — oder null, wenn er fehlt oder nicht lesbar ist (nie geraten). */
export function readStaffDraft(text: string): StaffDraft | null {
  if (text.trim() === '') return null;
  try {
    const parsed = StaffDraft.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
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

/**
 * Die Note, die „höher" und „tiefer" bewegen: das zuletzt gesetzte Zeichen, wenn es eine Note
 * ist. Takt und Platz darin, oder null (leer, oder zuletzt kam eine Pause).
 */
export function lastNote(answer: StaffAnswerState): { bar: number; index: number } | null {
  for (let b = answer.bars.length - 1; b >= 0; b--) {
    const bar = answer.bars[b] as StaffElement[];
    if (bar.length === 0) continue;
    // Was zuletzt gesetzt wurde, steht am Ende des letzten nicht leeren Takts — es sei denn, sie
    // hat in einen früheren Takt geschrieben; dann zählt die Reihenfolge der Takte, und das ist
    // auch die, in der „Zurück" abräumt.
    const last = bar[bar.length - 1] as StaffElement;
    return last.el === 'note' ? { bar: b, index: bar.length - 1 } : null;
  }
  return null;
}

/** Der Takt, der als Nächstes gefüllt wird — und der, in den eine Pause kommt. */
export function activeBar(answer: StaffAnswerState, surface: StaffWriteSurface): number {
  const capacity = barTicks(surface.time);
  const ticksIn = (bar: readonly StaffElement[]) =>
    bar.reduce((sum, el) => sum + ticksOf(el.value, el.dotted), 0);
  const unfilled = answer.bars.findIndex((bar) => ticksIn(bar) < capacity);
  return unfilled === -1 ? answer.bars.length - 1 : unfilled;
}

/**
 * Ein Zeichen in einen Takt setzen — vom Tipp auf die Zeile (eine Note) und von der Taste
 * „Pause" (`StaffKeys`). Gesagt wird auch, WO es liegt: wer die Linien nicht sieht, schreibt mit
 * diesem Satz. Ist der Takt voll, wird das gesagt statt gesetzt.
 */
export function usePut(
  surface: StaffWriteSurface,
  answer: StaffAnswerState,
  onChange: (next: StaffAnswerState) => void,
): (bar: number, element: StaffElement) => void {
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  return (bar, element) => {
    const target = answer.bars[bar] ?? [];
    if (target.length >= ELEMENTS_PER_BAR_MAX) {
      toast.show(t('staff.bar_crowded', { n: bar + 1 }), 'info');
      return;
    }
    onChange({ ...answer, bars: answer.bars.map((b, i) => (i === bar ? [...b, element] : b)) });
    announce(
      element.el === 'note'
        ? t('staff.placed', {
            what: elementWord(tm, element),
            where: stepWord(tm, staffStep(element.pitch, surface.clef)),
            bar: bar + 1,
          })
        : t('staff.rest_placed', { what: elementWord(tm, element), bar: bar + 1 }),
    );
  };
}

type Props = {
  surface: StaffWriteSurface;
  answer: StaffAnswerState;
  disabled: boolean;
  onChange: (next: StaffAnswerState) => void;
};

export function StaffAnswer({ surface, answer, disabled, onChange }: Props) {
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('math');
  const { box, onLayout } = useBox();

  const bars = answer.bars.length;
  /**
   * Der Linienabstand, den die BREITE erlaubt — er bestimmt, wie hoch die Zeile sein möchte.
   * Die Höhe, die sie dann wirklich bekommt (auf einem kleinen Handy unter einer langen Frage
   * weniger), entscheidet zuletzt: die Zeile wird enger, nie abgeschnitten.
   */
  const gapByWidth =
    box.width > 0 ? Math.max(GAP_MIN, Math.min(GAP_MAX, box.width / WIDTH_IN_GAPS(bars))) : GAP_MIN;
  const gap = box.height > 0 ? Math.max(GAP_MIN, Math.min(gapByWidth, box.height / 8)) : gapByWidth;
  const height = writeHeight(gap);
  /** Die Zeile steht senkrecht mittig in ihrem Feld; so weit liegt ihr oberer Rand darunter. */
  const top = Math.max(0, (box.height - height) / 2);

  const active = activeBar(answer, surface);
  const moving = lastNote(answer);
  const selected =
    moving === null
      ? null
      : answer.bars.slice(0, moving.bar).reduce((n, bar) => n + bar.length, 0) + moving.index;
  const put = usePut(surface, answer, onChange);

  /** Was auf dieser Stelle landet — mit Kreuz, wo es eines gibt (sonst ohne, siehe `canSharp`). */
  const pitchAt = (step: number) => pitchAtStep(step, surface.clef, answer.sharp);

  /** Ein Tipp in Takt `bar`, `y` die Höhe des Fingers in der Zeile (null: ohne Finger). */
  function tapBar(bar: number, y: number | null): void {
    // Ohne Fingerposition — oder bevor die Zeile vermessen ist — die mittlere Linie.
    const step = y === null || box.height === 0 ? 0 : clampStep(stepAtWriteY(y - top, gap));
    const pitch = pitchAt(step);
    // Sofort hören, was gesetzt wurde — darum geht es auf dieser Fläche (issue #226).
    playPitch(pitch);
    put(bar, { el: 'note', pitch, value: answer.value, dotted: answer.dotted });
  }

  /** Wo der erste Takt beginnt und wie viel hinter dem letzten frei bleibt — wie gestochen. */
  const startX = (headUnits(true) * gap) / SPACE_UNITS;
  const tailX = (TAIL_UNITS * gap) / SPACE_UNITS;

  return (
    <View style={{ flexShrink: 1, minHeight: 0 }}>
      {/* Die Zeile. So hoch, wie ihre Breite es erlaubt, und kleiner, wenn der Bildschirm unter
          der Frage weniger hergibt; die Takte darüber sind die Tippziele. */}
      <View
        style={{
          height: writeHeight(gapByWidth),
          flexShrink: 1,
          minHeight: writeHeight(GAP_MIN),
        }}
        onLayout={onLayout}
      >
        {box.width > 0 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top }}>
            <Staff
              clef={surface.clef}
              time={surface.time}
              bars={answer.bars}
              width={box.width}
              gap={gap}
              activeBar={active}
              selected={selected}
              cursor={!disabled && !staffComplete(answer)}
            />
          </View>
        ) : null}
        {/* Die Tippziele liegen ÜBER der Zeichnung und teilen sich die Breite mit Flexbox, nicht
            mit gemessenen Zahlen: so sitzen sie schon im ersten Bild richtig, und sie stimmen
            mit den gestochenen Takten überein, weil die alle gleich breit sind und hinter
            demselben Kopf beginnen (`staff/geometry.ts`). */}
        <View style={{ ...ABSOLUTE_FILL, flexDirection: 'row' }}>
          {/* Vor dem ersten Takt stehen Schlüssel und Taktart; dort wird nicht geschrieben. */}
          <View style={{ width: startX }} />
          {answer.bars.map((bar, b) => (
            // Kein `Btn`: das ist kein CTA, sondern die Zeichenfläche selbst, in die sie tippt —
            // die Höhe des Fingers ist die Tonhöhe (`TapSurface`, wie das Raster aus #249).
            <TapSurface
              key={b}
              testID={`staff-bar-${b + 1}`}
              accessibilityRole="button"
              // Der Name sagt, was schon im Takt steht — der Screenreader hört die Zeile hier, wo
              // sie geschrieben wird —, der Hinweis, was ein Tipp tut.
              accessibilityLabel={tm('staff.bar_list', {
                n: b + 1,
                list:
                  bar.length === 0
                    ? tm('staff.bar_empty')
                    : bar.map((el) => elementWord(tm, el)).join(', '),
              })}
              accessibilityHint={t('staff.bar_hint')}
              disabled={disabled}
              onTap={(at) => tapBar(b, at?.y ?? null)}
              style={{ flex: 1 }}
            />
          ))}
          <View style={{ width: tailX }} />
        </View>
      </View>

      {/* Die ganze Zeile in Worten, für den Screenreader: er hört sie hier am Stück. Sichtbar
          steht sie nicht da — die Zeile IST die Antwort, und eine Beschriftung daneben nähme ihr
          das Ablesen ab (siehe oben). */}
      <Text
        accessibilityLiveRegion="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
      >
        {barsWords(tm, answer.bars)}
      </Text>
    </View>
  );
}

const ABSOLUTE_FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;
