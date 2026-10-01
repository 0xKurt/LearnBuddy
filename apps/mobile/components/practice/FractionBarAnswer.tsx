// Der Bruchbalken: die erste Fläche, mit der sie *arbeitet* statt über Brüche zu lesen
// (issue #162). Zwei Formen, eine Geste — tippen:
//
//   · shade — ein leerer Balken aus gleich großen Teilen. Ein Tipp auf ein Teil färbt den
//     Balken bis dorthin; ein Tipp auf das letzte gefärbte Teil nimmt eines zurück. Was
//     gefärbt ist, schreibt sich als Bruch ins Antwortfeld — geprüft wird mit „Prüfen",
//     wie bei allem anderen, und Tippen bleibt daneben erreichbar (#162, Abnahme 2).
//   · pick — zwei Balken gleicher Länge, jeder in seine eigenen Teile geteilt. Ein Tipp auf
//     einen Balken IST die Antwort (wie eine Auswahl) und geht gleich raus.
//
// Warum Views und kein SVG: ein `<rect>` kann keine Rolle und keinen Namen tragen. Die
// Fläche muss mit dem Screenreader bedienbar sein, also ist jedes Teil ein echter Button.
// Gezeichnet wird mit denselben Figur-Tokens, mit denen `FigureView` die *gelesenen* Balken
// über der Frage zeichnet (`useTheme().figure`), damit beide dasselbe Bild zeigen: ein
// Figure ist, was sie LIEST — eine Fläche ist, was sie ANFASST.
//
// Die Farbe ist nie das einzige Signal: unter dem Balken steht in Worten, wie viel gefärbt
// ist, und diese Zeile ist auch, was ein Screenreader beim Tippen hört.

import type { AnswerSurface } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { speakMathText } from '../../lib/math/speak.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { MathText } from '../math/MathText.js';
import { useSpokenWords } from '../math/useSpokenMath.js';

/** The bar is a row of touch targets, so it is at least as tall as one (`TOUCH`). */
const BAR_HEIGHT = TOUCH + 12;
/** A bar she taps as a whole is one target: its own height is all it needs. */
const PICK_HEIGHT = TOUCH;
const RADIUS = 12;

const FRACTION = /^(\d+)\s*\/\s*(\d+)$/;
const WHOLE = /^\d+$/;

/**
 * How many of `parts` the answer field currently describes, or null when it describes
 * something else. A fraction counts however it is written, so a typed `1/2` shades two of
 * four and she SEES that they are the same amount — which is the whole point of the bar.
 * Anything that is not a whole number of parts (a decimal, half a part, a word) leaves the
 * bar alone rather than guessing at what she meant.
 */
export function shadedFromText(text: string, parts: number): number | null {
  const t = text.trim();
  if (t === '') return 0;
  if (WHOLE.test(t)) {
    const whole = Number(t) * parts;
    return whole <= parts ? whole : null;
  }
  const m = FRACTION.exec(t);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (den === 0) return null;
  const units = (num * parts) / den;
  return Number.isInteger(units) && units >= 0 && units <= parts ? units : null;
}

/** The answer a shaded bar stands for, exactly as a key is written (`2/4`, `4/4`). */
export function shadedText(units: number, parts: number): string {
  return `${units}/${parts}`;
}

type SegmentsProps = {
  parts: number;
  filled: number;
  height: number;
  /** A tap on part `index`; without it the bar is only shown. */
  onPressPart?: (index: number) => void;
  /** Accessible name of part `index` (required with `onPressPart`). */
  partLabel?: (index: number) => string;
  disabled?: boolean;
};

/** One bar: `parts` equal parts, the first `filled` of them coloured in. */
function Segments({
  parts,
  filled,
  height,
  onPressPart,
  partLabel,
  disabled = false,
}: SegmentsProps) {
  const { palette, figure: ink } = useTheme();
  // The colour of a part never sits on the `Pressable` itself: on React Native 0.73+ a
  // background declared there silently does not paint (CLAUDE.md rule 13). It belongs to
  // this inner View, which is also what carries the pressed tint and the muted state.
  const part = (i: number, pressed: boolean) => (
    <View
      style={{
        flex: 1,
        backgroundColor: i < filled ? ink.fill : pressed ? palette.lavender : 'transparent',
        borderRightWidth: i < parts - 1 ? 1.5 : 0,
        borderRightColor: ink.stroke,
        opacity: disabled ? 0.55 : 1,
      }}
    />
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        height,
        borderRadius: RADIUS,
        borderWidth: 1.5,
        borderColor: ink.stroke,
        backgroundColor: ink.empty,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: parts }, (_, i) =>
        // A part of the bar is not a CTA but a piece of the drawing she adjusts — like a
        // character she types, not like "Prüfen". A `Btn` here would bring its own padding,
        // radius and minimum height and the bar would stop being one bar; the CTA for this
        // answer is the composer's "Prüfen" (rule 13).
        onPressPart && partLabel ? (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={partLabel(i)}
            disabled={disabled}
            onPress={() => onPressPart(i)}
            style={{ flex: 1 }}
          >
            {({ pressed }) => part(i, pressed)}
          </Pressable>
        ) : (
          <View key={i} style={{ flex: 1 }}>
            {part(i, false)}
          </View>
        ),
      )}
    </View>
  );
}

type Props = {
  surface: AnswerSurface;
  /** What stands in the answer field now, so the bar and the typed answer agree. */
  value: string;
  disabled: boolean;
  /** Shading writes the fraction into the answer field; she checks it with "Prüfen". */
  onChange: (text: string) => void;
  /** Picking one of two bars IS the answer, like a choice: it goes out at once. */
  onPick: (text: string) => void;
};

export function FractionBarAnswer({ surface, value, disabled, onChange, onPick }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation('practice');
  const words = useSpokenWords();

  if (surface.mode === 'pick') {
    return (
      <View style={{ gap: SPACE.md }}>
        <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('bar.pick_how')}</Text>
        {surface.bars.map((bar, i) => {
          const answer = shadedText(bar.filled, bar.parts);
          const math = `$\\frac{${bar.filled}}{${bar.parts}}$`;
          return (
            // Picking a bar IS the answer, so this one is a real CTA and goes through `Btn`
            // (rule 13): the bar and its name are its label, and `full` makes both options
            // exactly as wide — two bars of different length would answer the question.
            <Btn
              key={`${i}:${answer}`}
              variant="ghost"
              size="sm"
              full
              // No `wrap`: its 12 pt of padding twice per bar pushed the conversation into
              // scrolling on a 360×740 screen, and the label here is a bar, not a sentence
              // that could need a second line.
              disabled={disabled}
              onPress={() => onPick(answer)}
              label={
                <View style={{ gap: SPACE.xs }}>
                  <MathText
                    text={math}
                    accessible={false}
                    style={{ color: palette.ink, fontSize: 17, lineHeight: 23, fontWeight: '700' }}
                  />
                  <Segments parts={bar.parts} filled={bar.filled} height={PICK_HEIGHT} />
                </View>
              }
            >
              {t('bar.pick_option', { fraction: speakMathText(math, words) })}
            </Btn>
          );
        })}
      </View>
    );
  }

  const { parts } = surface;
  const shaded = shadedFromText(value, parts) ?? 0;
  return (
    <View style={{ gap: SPACE.sm }}>
      <Text style={[TYPE.small, { color: palette.ink2 }]}>{t('bar.shade_how')}</Text>
      <Segments
        parts={parts}
        filled={shaded}
        height={BAR_HEIGHT}
        disabled={disabled}
        partLabel={(i) => t('bar.part', { n: i + 1, total: parts })}
        // A tap fills up to the part she touched; touching the last filled one gives one
        // back, so she can reach nothing shaded again without a button for it.
        onPressPart={(i) => onChange(shadedText(shaded === i + 1 ? i : i + 1, parts))}
      />
      {/* The amount in words: the non-colour signal, and what a screen reader hears. */}
      <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
        {t('bar.shaded', { filled: shaded, total: parts })}
      </Text>
    </View>
  );
}
