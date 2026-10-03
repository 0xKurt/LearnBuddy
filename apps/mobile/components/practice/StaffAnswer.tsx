// Die Notenzeile, auf die sie selbst schreibt (issue #226, Plan 4; Bedienung neu in #275).
//
//   · **Ein Tipp in einen Takt setzt dort eine Note, wo der Finger liegt**, und sie **klingt
//     sofort**. Der Takt ist EIN großes Tippziel (über die ganze Höhe der Zeile und die ganze
//     Breite des Takts), nicht dreizehn schmale Streifen.
//   · **„Höher" und „tiefer"** schieben die Note, die sie gerade gesetzt hat, um eine Stelle —
//     jede Stelle klingt. Die gesetzte Note steht violett und mit einem Ring da, bis die nächste
//     kommt: so sieht sie, WAS sich bewegt.
//   · Darüber wählt sie den **Wert** (gezeichnete Notenzeichen statt Wörtern) und den **Punkt**;
//     darunter **Kreuz**, **Pause**, **Anhören** und **Zurück**.
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
  NOTE_VALUES,
  STAFF_STEP_MAX,
  barTicks,
  dottedRestOk,
  pitchAtStep,
  renderStaffLine,
  staffStep,
  ticksOf,
  NoteValue,
  StaffElement,
  type StaffWriteSurface,
} from '@learnbuddy/shared-types/contracts';
import { useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { announce } from '../../lib/announce.js';
import { playPitch } from '../../lib/music/play.js';
import { barsWords, elementWord, stepWord, valueWord } from '../../lib/music/words.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Btn } from '../lb/Btn.js';
import { Icon, type IconName } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';
import { Staff, ValueGlyph } from '../math/StaffLine.js';
import {
  SPACE_UNITS,
  TAIL_UNITS,
  headUnits,
  stepAtWriteY,
  writeHeight,
} from '../math/staff/geometry.js';
import { StaffPlayButton } from './StaffPlayButton.js';

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
 * (`headUnits`), je Takt fünf (Platz für drei bis vier Köpfe mit Vorzeichen) und der Schlussstrich.
 */
const WIDTH_IN_GAPS = (bars: number) => (headUnits(true) + TAIL_UNITS) / SPACE_UNITS + bars * 5;

/**
 * Die kleinste Höhe der ganzen Fläche: die engste Zeile, zwei Tastenreihen à 44 pt und die
 * Abstände dazwischen. Der Übungsbildschirm hält sie frei (`app/practice/[id].tsx`).
 */
export const STAFF_ANSWER_MIN = writeHeight(GAP_MIN) + 2 * TOUCH + 2 * SPACE.sm;

/** Die Stellen, die es gibt: eine Hilfslinie über und unter den fünf Linien. */
const clampStep = (step: number) => Math.max(-STAFF_STEP_MAX, Math.min(STAFF_STEP_MAX, step));

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
  const [box, setBox] = useState({ width: 0, height: 0 });
  /** Wo der Finger den Takt berührt hat (aus `onPressIn`), bis `onPress` ihn verbraucht. */
  const touchY = useRef<number | null>(null);

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

  const capacity = barTicks(surface.time);
  const ticksIn = (bar: readonly StaffElement[]) =>
    bar.reduce((sum, el) => sum + ticksOf(el.value, el.dotted), 0);
  /** Der Takt, der als Nächstes gefüllt wird — und der, in den eine Pause kommt. */
  const unfilled = answer.bars.findIndex((bar) => ticksIn(bar) < capacity);
  const active = unfilled === -1 ? answer.bars.length - 1 : unfilled;
  const moving = lastNote(answer);
  const movingStep = (() => {
    if (moving === null) return null;
    const el = answer.bars[moving.bar]?.[moving.index];
    return el?.el === 'note' ? staffStep(el.pitch, surface.clef) : null;
  })();
  const selected =
    moving === null
      ? null
      : answer.bars.slice(0, moving.bar).reduce((n, bar) => n + bar.length, 0) + moving.index;

  function put(bar: number, element: StaffElement): void {
    const target = answer.bars[bar] ?? [];
    if (target.length >= ELEMENTS_PER_BAR_MAX) {
      toast.show(t('staff.bar_crowded', { n: bar + 1 }), 'info');
      return;
    }
    onChange({ ...answer, bars: answer.bars.map((b, i) => (i === bar ? [...b, element] : b)) });
    // Gesagt wird auch, WO sie liegt: wer die Linien nicht sieht, schreibt mit diesem Satz.
    announce(
      element.el === 'note'
        ? t('staff.placed', {
            what: elementWord(tm, element),
            where: stepWord(tm, staffStep(element.pitch, surface.clef)),
            bar: bar + 1,
          })
        : t('staff.rest_placed', { what: elementWord(tm, element), bar: bar + 1 }),
    );
  }

  /** Was auf dieser Stelle landet — mit Kreuz, wo es eines gibt (sonst ohne, siehe `canSharp`). */
  const pitchAt = (step: number) => pitchAtStep(step, surface.clef, answer.sharp);

  function pressIn(e: GestureResponderEvent): void {
    const y = e.nativeEvent.locationY;
    touchY.current = Number.isFinite(y) ? y : null;
  }

  function tapBar(bar: number): void {
    const y = touchY.current;
    touchY.current = null;
    // Ohne Fingerposition — oder bevor die Zeile vermessen ist — die mittlere Linie.
    const step = y === null || box.height === 0 ? 0 : clampStep(stepAtWriteY(y - top, gap));
    const pitch = pitchAt(step);
    // Sofort hören, was gesetzt wurde — darum geht es auf dieser Fläche (issue #226).
    playPitch(pitch);
    put(bar, { el: 'note', pitch, value: answer.value, dotted: answer.dotted });
  }

  function nudge(by: 1 | -1): void {
    if (moving === null || movingStep === null) return;
    const step = clampStep(movingStep + by);
    if (step === movingStep) return;
    const el = answer.bars[moving.bar]?.[moving.index];
    if (el?.el !== 'note') return;
    const pitch = pitchAt(step);
    playPitch(pitch);
    const moved: StaffElement = { ...el, pitch };
    onChange({
      ...answer,
      bars: answer.bars.map((b, i) =>
        i === moving.bar ? b.map((x, k) => (k === moving.index ? moved : x)) : b,
      ),
    });
    announce(t('staff.moved', { what: elementWord(tm, moved), where: stepWord(tm, step) }));
  }

  function addRest(): void {
    // Eine punktierte ganze oder halbe Pause gibt es nicht (`dottedRestOk`): der Punkt fällt weg,
    // und der Screenreader sagt, was wirklich gesetzt wurde.
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

  const empty = answer.bars.every((bar) => bar.length === 0);
  /** Wo der erste Takt beginnt und wie viel hinter dem letzten frei bleibt — wie gestochen. */
  const startX = (headUnits(true) * gap) / SPACE_UNITS;
  const tailX = (TAIL_UNITS * gap) / SPACE_UNITS;

  return (
    <View style={{ flexShrink: 1, minHeight: 0, gap: SPACE.sm }}>
      {/* Die Zeile. So hoch, wie ihre Breite es erlaubt, und kleiner, wenn der Bildschirm unter
          der Frage weniger hergibt; die Takte darüber sind die Tippziele. */}
      <View
        style={{
          height: writeHeight(gapByWidth),
          flexShrink: 1,
          minHeight: writeHeight(GAP_MIN),
        }}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          const h = Math.round(e.nativeEvent.layout.height);
          if (w !== box.width || h !== box.height) setBox({ width: w, height: h });
        }}
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
            // Kein `Btn`: das ist kein CTA, sondern die Zeichenfläche selbst — wie ein Teil des
            // Bruchbalkens (Regel 13). Und niemals eine Hintergrundfarbe darauf.
            <Pressable
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
              onPressIn={pressIn}
              onPress={() => tapBar(b)}
              style={{ flex: 1 }}
            />
          ))}
          <View style={{ width: tailX }} />
        </View>
      </View>

      {/* Direkt unter der Zeile, was die gesetzte Note bewegt: höher und tiefer, vorn und
          gefüllt; dann was eine Note verändert oder ersetzt, dann Hören und Zurück. Alle gleich
          breit, alle ≥ 44 pt. */}
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <View style={{ flex: 1 }}>
          <IconBtn
            icon="up"
            label={t('staff.higher')}
            variant="soft"
            disabled={disabled || movingStep === null || movingStep >= STAFF_STEP_MAX}
            onPress={() => nudge(1)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <IconBtn
            icon="down"
            label={t('staff.lower')}
            variant="soft"
            disabled={disabled || movingStep === null || movingStep <= -STAFF_STEP_MAX}
            onPress={() => nudge(-1)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Tool
            label={t('staff.sharp')}
            on={answer.sharp}
            disabled={disabled}
            onPress={() => onChange({ ...answer, sharp: !answer.sharp })}
            glyph={<SharpGlyph color={answer.sharp ? palette.paper : palette.ink} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Btn
            size="sm"
            pill
            full
            compact
            variant="outline"
            disabled={disabled}
            onPress={addRest}
            accessibilityLabel={t('staff.rest_of', {
              value: valueWord(tm, answer.value, false, true),
            })}
            label={
              <ValueGlyph
                value={answer.value}
                rest
                size={32}
                color={disabled ? palette.ink2 : palette.ink}
              />
            }
          >
            {t('staff.rest')}
          </Btn>
        </View>
        <View style={{ flex: 1 }}>
          <StaffPlayButton
            iconOnly
            bars={answer.bars.filter((bar) => bar.length > 0)}
            tempo={surface.tempo}
            disabled={disabled || empty}
          />
        </View>
        <View style={{ flex: 1 }}>
          <IconBtn
            icon="undo"
            label={t('staff.undo')}
            variant="ghost"
            disabled={disabled || empty}
            onPress={undo}
          />
        </View>
      </View>
      {/* Wert und Punkt: womit die nächste Note geschrieben wird — unten, nah am Daumen. Die
          Tasten zeigen das Zeichen, das sie setzen; der Name steht im Label. */}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: SPACE.sm }}>
        {NOTE_VALUES.map((value) => {
          const on = value === answer.value;
          return (
            <View key={value} style={{ flex: 1 }}>
              <Btn
                size="sm"
                pill
                full
                compact
                variant={on ? 'primary' : 'outline'}
                selected={on}
                disabled={disabled}
                onPress={() => onChange({ ...answer, value })}
                accessibilityLabel={valueWord(tm, value, false, false)}
                label={
                  <ValueGlyph
                    value={value}
                    size={32}
                    color={on ? palette.paper : disabled ? palette.ink2 : palette.ink}
                  />
                }
              >
                {valueWord(tm, value, false, false)}
              </Btn>
            </View>
          );
        })}
        <View style={{ flex: 1 }}>
          {/* Der Punkt ist ein SCHALTER, keine Wahl aus mehreren: sein Zustand steht im Namen
              und nicht in `selected` (das machte aus ihm ein einzelnes Radio). */}
          <Tool
            label={t('staff.dot')}
            on={answer.dotted}
            disabled={disabled}
            onPress={() => onChange({ ...answer, dotted: !answer.dotted })}
            glyph={<DotGlyph color={answer.dotted ? palette.paper : palette.ink} />}
          />
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

/** Eine Taste nur mit Zeichen; der Name steht im Label. */
function IconBtn({
  icon,
  label,
  variant,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  variant: 'soft' | 'ghost' | 'outline';
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const color = disabled
    ? palette.placeholder
    : variant === 'soft'
      ? palette.primaryDk
      : palette.ink;
  return (
    <Btn
      size="sm"
      pill
      full
      compact
      variant={variant}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={label}
      label={
        <View style={{ alignItems: 'center' }}>
          <Icon name={icon} size={24} color={color} />
        </View>
      }
    >
      {label}
    </Btn>
  );
}

/**
 * Ein Schalter als Taste: eingeschaltet gefüllt UND anders benannt („Punkt, ist an"). Die Farbe
 * ist nie das einzige Signal, und ein Screenreader hört den Zustand im Namen.
 */
function Tool({
  label,
  on,
  disabled,
  onPress,
  glyph,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onPress: () => void;
  glyph: ReactNode;
}) {
  const { t } = useTranslation('practice');
  return (
    <Btn
      size="sm"
      pill
      full
      compact
      variant={on ? 'primary' : 'outline'}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={on ? t('staff.toggle_on', { label }) : label}
      label={<View style={{ alignItems: 'center' }}>{glyph}</View>}
    >
      {label}
    </Btn>
  );
}

/** Der Punkt hinter einer Note — als Punkt, nicht als Wort. */
function DotGlyph({ color }: { color: string }) {
  return <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: color }} />;
}

/** Das Kreuz ♯ in der Schrift der App, groß genug, um es als Zeichen zu lesen. */
function SharpGlyph({ color }: { color: string }) {
  return <Text style={{ color, fontSize: 22, lineHeight: 26, fontWeight: '700' }}>♯</Text>;
}
