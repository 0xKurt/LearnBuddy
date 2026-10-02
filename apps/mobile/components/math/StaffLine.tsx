// Die gezeichnete Notenzeile (issue #226): fünf Linien, Schlüssel, Taktart, Noten und Pausen,
// aus Daten gezeichnet — wie jede andere Figur schickt der Server nur Werte
// (`StaffFigure`, packages/shared-types/src/contracts/staff.ts).
//
// EIN Zeichner für zwei Zwecke, und das ist der Grund für die Form dieser Datei: die Zeile, die
// sie LIEST (`FigureView`, eine Figur), und die Zeile, auf die sie SCHREIBT
// (`practice/StaffAnswer.tsx`, eine Fläche) müssen gleich aussehen. Zwei Zeichner wären zwei
// Bilder von derselben Sache, und ein Kind, das gerade gelernt hat, wie ein Viertel aussieht,
// müsste es zweimal lernen. Deshalb nimmt `Staff` auch leere Takte und einen Schreibcursor an,
// und `stepAtY` / `yOfStep` liegen hier: die Fläche rechnet mit derselben Geometrie, mit der
// hier gezeichnet wird, sonst landet ein Tipp nicht auf der Linie, die sie getroffen hat.
//
// Was hier bewusst vereinfacht ist, und warum es trotzdem reicht:
//   · **Die Schlüssel sind stilisiert.** Ein gestochener Violinschlüssel ist eine Spirale aus
//     einem Dutzend Kurven; hier sind es ein Hals, eine Schleife um die G-Linie und ein Haken.
//     Entscheidend an einem Schlüssel ist, WELCHE Linie er festlegt — und die ist richtig
//     gezeichnet und zusätzlich stärker gezogen, weil genau sie abgezählt wird.
//   · **Keine Balken.** Zwei Achtel werden einzeln mit Fähnchen geschrieben, nicht gebalkt. Eine
//     Balkung wäre eine Aussage über die Betonung im Takt, die die Daten nicht enthalten.
//   · **Vorzeichen stehen einzeln vor ihrer Note**, nie am Zeilenanfang (das sagt der Vertrag).
// Keine davon ist eine Lücke in der Prüfung: geprüft wird die Struktur, nicht das Bild.

import {
  staffStep,
  type Clef,
  type StaffElement,
  type StaffFigure,
  type TimeSignature,
} from '@learnbuddy/shared-types/contracts';
import { Platform } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../../lib/theme/ThemeProvider.js';

/** The app's sans-serif inside SVG too (the web would fall back to a serif). */
const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

/**
 * Wie viele halbe Linienabstände über der obersten und unter der untersten Linie frei bleiben:
 * sechs, also drei Linienabstände. Das ist der Platz für eine Hilfslinie (`STAFF_STEP_MAX` im
 * Vertrag erlaubt genau eine), für den Hals einer Note, die dort liegt, und für ihr Fähnchen.
 */
export const STAFF_MARGIN_STEPS = 6;

/** Die Gesamthöhe einer Zeile in Linienabständen: vier zwischen den Linien, dreimal Luft. */
const HEIGHT_IN_GAPS = 4 + STAFF_MARGIN_STEPS / 2 + STAFF_MARGIN_STEPS / 2;

/** Der engste und der weiteste Linienabstand, den wir zeichnen (Punkte). */
const GAP_MIN = 8;
const GAP_MAX = 15;

/** Wie breit ein Element im Takt steht und wie breit Schlüssel und Taktart sind, in Abständen. */
const ELEMENT_GAPS = 2.4;
const CLEF_GAPS = 3;
const TIME_GAPS = 2;
/** Der schmalste Takt: so breit, dass ein Finger ihn trifft, auch wenn er leer ist. */
const BAR_MIN_GAPS = 5;

/** Die y-Koordinate der mittleren Linie — der Nullpunkt von `staffStep`. */
function middleY(gap: number): number {
  return (STAFF_MARGIN_STEPS / 2) * gap + 2 * gap;
}

/** Wo eine Stufe liegt: 0 ist die mittlere Linie, +1 der Zwischenraum darüber. */
export function yOfStep(step: number, gap: number): number {
  return middleY(gap) - (step * gap) / 2;
}

/**
 * Welche Stufe an dieser Stelle liegt — die Umkehrung von `yOfStep`, und der Grund, warum die
 * Fläche hier mitrechnet statt eigene Zahlen zu führen: ein Tipp muss auf der Linie landen, die
 * ihr Finger getroffen hat, und nicht auf der, die ein zweiter Satz Konstanten meint.
 */
export function stepAtY(y: number, gap: number): number {
  return Math.round((2 * (middleY(gap) - y)) / gap);
}

/** Die Höhe einer Zeile bei diesem Linienabstand. */
export function staffHeight(gap: number): number {
  return HEIGHT_IN_GAPS * gap;
}

/**
 * Der Linienabstand, mit dem diese Zeile in die verfügbare Breite passt. Eng gezeichnet, wenn
 * viel draufsteht, sonst so groß wie erlaubt — eine Zeile mit einer einzigen Note soll nicht
 * winzig in der Mitte einer breiten Karte stehen.
 */
export function staffGap(width: number, bars: readonly StaffElement[][], hasTime: boolean): number {
  const barGaps = bars.reduce(
    (sum, bar) => sum + Math.max(BAR_MIN_GAPS, bar.length * ELEMENT_GAPS + 0.8),
    0,
  );
  const needed = CLEF_GAPS + (hasTime ? TIME_GAPS : 0) + barGaps;
  return Math.max(GAP_MIN, Math.min(GAP_MAX, width / Math.max(needed, 1)));
}

type Ink = ReturnType<typeof useTheme>['figure'];

// ─────────────── Schlüssel ───────────────

/** Welche Linie der Schlüssel festlegt, in Stufen: die G-Linie bzw. die F-Linie. */
const CLEF_LINE: Record<Clef, number> = { treble: -2, bass: 2 };

function ClefMark({ clef, gap, x, ink }: { clef: Clef; gap: number; x: number; ink: Ink }) {
  const line = yOfStep(CLEF_LINE[clef], gap);
  const w = gap * 1.1;
  if (clef === 'treble') {
    // Hals von über der Zeile bis darunter, eine Schleife um die G-Linie, ein Haken unten.
    const top = yOfStep(5, gap);
    const bottom = yOfStep(-6, gap);
    return (
      <G>
        <Path
          d={`M ${x + w} ${bottom} C ${x - w * 0.6} ${bottom} ${x - w * 0.9} ${line + gap} ${x + w * 0.2} ${line}
              C ${x + w * 1.4} ${line - gap * 0.8} ${x + w * 0.9} ${top} ${x + w * 0.1} ${top}`}
          fill="none"
          stroke={ink.stroke}
          strokeWidth={gap * 0.22}
          strokeLinecap="round"
        />
        <Circle
          cx={x + w * 0.2}
          cy={line}
          r={gap * 0.62}
          fill="none"
          stroke={ink.stroke}
          strokeWidth={gap * 0.22}
        />
      </G>
    );
  }
  // Bassschlüssel: ein Haken, der auf der F-Linie beginnt, und die zwei Punkte daneben.
  return (
    <G>
      <Path
        d={`M ${x + w * 0.1} ${line} C ${x + w * 1.6} ${line - gap * 0.5} ${x + w * 1.9} ${line + gap * 1.6} ${x - w * 0.2} ${line + gap * 2.4}`}
        fill="none"
        stroke={ink.stroke}
        strokeWidth={gap * 0.26}
        strokeLinecap="round"
      />
      <Circle cx={x + w * 0.1} cy={line} r={gap * 0.26} fill={ink.stroke} />
      <Circle cx={x + w * 1.9} cy={line - gap * 0.5} r={gap * 0.17} fill={ink.stroke} />
      <Circle cx={x + w * 1.9} cy={line + gap * 0.5} r={gap * 0.17} fill={ink.stroke} />
    </G>
  );
}

function TimeMark({
  time,
  gap,
  x,
  ink,
}: {
  time: TimeSignature;
  gap: number;
  x: number;
  ink: Ink;
}) {
  const [beats, unit] = time.split('/');
  const size = gap * 1.9;
  return (
    <G>
      <SvgText
        x={x}
        y={yOfStep(1, gap) + size * 0.34}
        fill={ink.stroke}
        fontSize={size}
        fontWeight="700"
        fontFamily={FAMILY}
        textAnchor="middle"
      >
        {beats}
      </SvgText>
      <SvgText
        x={x}
        y={yOfStep(-3, gap) + size * 0.34}
        fill={ink.stroke}
        fontSize={size}
        fontWeight="700"
        fontFamily={FAMILY}
        textAnchor="middle"
      >
        {unit}
      </SvgText>
    </G>
  );
}

// ─────────────── Noten und Pausen ───────────────

/** Ein Notenkopf: ab Viertel ausgefüllt, halbe und ganze hohl. */
function NoteHead({
  x,
  y,
  gap,
  filled,
  ink,
  hollow,
}: {
  x: number;
  y: number;
  gap: number;
  filled: boolean;
  ink: Ink;
  /** Der Schreibcursor: dieselbe Form, nur offen und in der Akzentfarbe. */
  hollow?: string;
}) {
  return (
    <Ellipse
      cx={x}
      cy={y}
      rx={gap * 0.62}
      ry={gap * 0.46}
      transform={`rotate(-18 ${x} ${y})`}
      fill={hollow ? 'none' : filled ? ink.stroke : 'none'}
      stroke={hollow ?? ink.stroke}
      strokeWidth={gap * (hollow ? 0.2 : 0.16)}
      strokeDasharray={hollow ? `${gap * 0.3} ${gap * 0.22}` : undefined}
    />
  );
}

/** Wie viele Fähnchen ein Wert hat (eine Achtel eines, eine Sechzehntel zwei). */
const FLAGS: Record<StaffElement['value'], number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  eighth: 1,
  sixteenth: 2,
};

function Note({
  el,
  x,
  gap,
  step,
  ink,
}: {
  el: Extract<StaffElement, { el: 'note' }>;
  x: number;
  gap: number;
  step: number;
  ink: Ink;
}) {
  const y = yOfStep(step, gap);
  const filled = el.value !== 'whole' && el.value !== 'half';
  // Der Hals zeigt nach oben, solange die Note unter der Mitte liegt — wie im Notensatz.
  const up = step < 1;
  const stemX = x + (up ? gap * 0.56 : -gap * 0.56);
  const stemEnd = y + (up ? -gap * 3.2 : gap * 3.2);
  const flags = FLAGS[el.value];
  // Hilfslinien: jede Linienposition zwischen der Zeile und der Note bekommt einen Strich.
  const ledgers: number[] = [];
  for (let s = 6; s <= Math.abs(step); s += 2) {
    if (s > 4) ledgers.push(step > 0 ? s : -s);
  }
  return (
    <G>
      {ledgers.map((s) => (
        <Line
          key={s}
          x1={x - gap * 0.95}
          x2={x + gap * 0.95}
          y1={yOfStep(s, gap)}
          y2={yOfStep(s, gap)}
          stroke={ink.stroke}
          strokeWidth={1.2}
        />
      ))}
      {el.pitch.name.includes('#') ? (
        <G>
          {[-0.18, 0.18].map((d) => (
            <Line
              key={`v${d}`}
              x1={x - gap * 1.5 + gap * d}
              x2={x - gap * 1.5 + gap * d}
              y1={y - gap * 0.62}
              y2={y + gap * 0.52}
              stroke={ink.stroke}
              strokeWidth={gap * 0.1}
            />
          ))}
          {[-0.22, 0.26].map((d) => (
            <Line
              key={`h${d}`}
              x1={x - gap * 1.84}
              x2={x - gap * 1.16}
              y1={y + gap * d + gap * 0.07}
              y2={y + gap * d - gap * 0.07}
              stroke={ink.stroke}
              strokeWidth={gap * 0.2}
            />
          ))}
        </G>
      ) : null}
      <NoteHead x={x} y={y} gap={gap} filled={filled} ink={ink} />
      {el.value !== 'whole' ? (
        <Line
          x1={stemX}
          x2={stemX}
          y1={y}
          y2={stemEnd}
          stroke={ink.stroke}
          strokeWidth={gap * 0.14}
          strokeLinecap="round"
        />
      ) : null}
      {Array.from({ length: flags }, (_, i) => (
        <Path
          key={i}
          d={`M ${stemX} ${stemEnd + (up ? i * gap * 0.5 : -i * gap * 0.5)}
              q ${gap * 0.9} ${up ? gap * 0.35 : -gap * 0.35} ${gap * 0.55} ${up ? gap * 1.15 : -gap * 1.15}`}
          fill="none"
          stroke={ink.stroke}
          strokeWidth={gap * 0.16}
          strokeLinecap="round"
        />
      ))}
      {el.dotted ? <Circle cx={x + gap} cy={y} r={gap * 0.16} fill={ink.stroke} /> : null}
    </G>
  );
}

function RestMark({
  el,
  x,
  gap,
  ink,
}: {
  el: Extract<StaffElement, { el: 'rest' }>;
  x: number;
  gap: number;
  ink: Ink;
}) {
  const bar = (step: number) => (
    // Ganze Pause hängt unter der zweiten Linie von oben, halbe sitzt auf der mittleren.
    <Rect
      x={x - gap * 0.55}
      y={yOfStep(step, gap)}
      width={gap * 1.1}
      height={gap * 0.5}
      fill={ink.stroke}
    />
  );
  const dot = el.dotted ? (
    <Circle cx={x + gap * 1.1} cy={yOfStep(0, gap)} r={gap * 0.16} fill={ink.stroke} />
  ) : null;
  if (el.value === 'whole')
    return (
      <G>
        {bar(2)}
        {dot}
      </G>
    );
  if (el.value === 'half')
    return (
      <G>
        {bar(0)}
        {dot}
      </G>
    );
  if (el.value === 'quarter') {
    // Der klassische Haken, stilisiert: ein Zickzack über die mittleren Linien.
    return (
      <G>
        <Path
          d={`M ${x - gap * 0.4} ${yOfStep(3, gap)} l ${gap * 0.7} ${gap * 0.9}
              l ${-gap * 0.75} ${gap * 0.95} l ${gap * 0.8} ${gap * 0.9}`}
          fill="none"
          stroke={ink.stroke}
          strokeWidth={gap * 0.26}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {dot}
      </G>
    );
  }
  // Achtel- und Sechzehntelpause: ein schräger Strich mit einem bzw. zwei Köpfchen.
  const flags = el.value === 'eighth' ? 1 : 2;
  return (
    <G>
      <Line
        x1={x + gap * 0.45}
        y1={yOfStep(3, gap)}
        x2={x - gap * 0.2}
        y2={yOfStep(flags === 1 ? -1 : -2, gap)}
        stroke={ink.stroke}
        strokeWidth={gap * 0.18}
        strokeLinecap="round"
      />
      {Array.from({ length: flags }, (_, i) => (
        <Circle
          key={i}
          cx={x + gap * 0.42 - i * gap * 0.16}
          cy={yOfStep(2.4 - i * 1.6, gap)}
          r={gap * 0.26}
          fill={ink.stroke}
        />
      ))}
      {dot}
    </G>
  );
}

// ─────────────── die ganze Zeile ───────────────

export type StaffProps = {
  clef: Clef;
  /** null: die Zeile zeigt keine Taktart (ein einzelnes Zeichen, oder sie ist die Frage). */
  time: TimeSignature | null;
  /** Was gezeichnet wird. Ein leerer Takt ist erlaubt — die Fläche braucht ihn. */
  bars: readonly StaffElement[][];
  /** Wo welcher Ton liegt: `staffStep(pitch, clef)` je Note, in derselben Ordnung. */
  steps: readonly number[];
  width: number;
  /** Ohne Angabe aus der Breite gerechnet (`staffGap`). */
  gap?: number;
  /**
   * Alle Takte gleich breit, statt nach Inhalt verteilt. Die Schreibfläche braucht das: dort
   * wächst der Inhalt unter ihrem Finger, und Takte, die dabei ihre Breite ändern, verschieben
   * die Stellen, auf die sie gerade tippt.
   */
  equalBars?: boolean;
  /** Der Takt, in den als Nächstes geschrieben wird — er wird leicht hervorgehoben. */
  activeBar?: number | null;
};

/**
 * Die Zeile. Die x-Stellen der Takte werden hier berechnet und über `onBars` nach draußen
 * gegeben, damit die Fläche ihre Tippflächen genau über die Takte legen kann.
 */
export function Staff({
  clef,
  time,
  bars,
  steps,
  width,
  gap: fixedGap,
  equalBars = false,
  activeBar = null,
}: StaffProps) {
  const { figure: ink, palette } = useTheme();
  const gap = fixedGap ?? staffGap(width, bars, time !== null);
  const height = staffHeight(gap);
  const left = gap * 0.4;
  const clefX = left + gap * 0.3;
  const timeX = left + CLEF_GAPS * gap + (TIME_GAPS * gap) / 2;
  const barsStart = left + CLEF_GAPS * gap + (time !== null ? TIME_GAPS * gap : 0);
  const barWidths = barWidthsOf(bars, Math.max(width - barsStart - gap * 0.4, gap), gap, equalBars);
  let seen = 0;
  let x = barsStart;
  const drawn = bars.map((bar, b) => {
    const barWidth = barWidths[b] as number;
    const barX = x;
    x += barWidth;
    const slot = barWidth / Math.max(bar.length, 1);
    const content = bar.map((el, i) => {
      const at = barX + slot * (i + 0.5);
      const step = steps[seen + i] ?? 0;
      return el.el === 'rest' ? (
        <RestMark key={i} el={el} x={at} gap={gap} ink={ink} />
      ) : (
        <Note key={i} el={el} x={at} gap={gap} step={step} ink={ink} />
      );
    });
    seen += bar.length;
    return { barX, barWidth, content, b };
  });

  return (
    <Svg width={width} height={height}>
      {/* Der Takt, der gerade gefüllt wird: ein ruhiger Hintergrund, nie das einzige Signal. */}
      {drawn.map(({ barX, barWidth, b }) =>
        activeBar === b ? (
          <Rect
            key={`a${b}`}
            x={barX}
            y={yOfStep(5, gap)}
            width={barWidth}
            height={gap * 5}
            fill={palette.lavender}
            opacity={0.45}
            rx={gap * 0.3}
          />
        ) : null,
      )}
      {[4, 2, 0, -2, -4].map((step) => (
        <Line
          key={step}
          x1={left}
          x2={width - gap * 0.4}
          y1={yOfStep(step, gap)}
          y2={yOfStep(step, gap)}
          // Die Linie, die der Schlüssel festlegt, wird stärker gezogen: sie ist die, von der
          // abgezählt wird, und ein Kind soll sie finden, ohne sie zu suchen.
          stroke={step === CLEF_LINE[clef] ? ink.stroke : ink.axis}
          strokeWidth={step === CLEF_LINE[clef] ? 1.8 : 1}
        />
      ))}
      <ClefMark clef={clef} gap={gap} x={clefX} ink={ink} />
      {time !== null ? <TimeMark time={time} gap={gap} x={timeX} ink={ink} /> : null}
      {/* Taktstriche: zwischen den Takten einer, am Ende ein doppelter. */}
      {drawn.slice(1).map(({ barX, b }) => (
        <Line
          key={`b${b}`}
          x1={barX}
          x2={barX}
          y1={yOfStep(4, gap)}
          y2={yOfStep(-4, gap)}
          stroke={ink.stroke}
          strokeWidth={1.4}
        />
      ))}
      {drawn.map(({ content, b }) => (
        <G key={`c${b}`}>{content}</G>
      ))}
      <Line
        x1={width - gap * 0.4}
        x2={width - gap * 0.4}
        y1={yOfStep(4, gap)}
        y2={yOfStep(-4, gap)}
        stroke={ink.stroke}
        strokeWidth={2.2}
      />
    </Svg>
  );
}

/** Die Breiten der Takte: nach Inhalt verteilt, aber keiner schmaler als `BAR_MIN_GAPS`. */
function barWidthsOf(
  bars: readonly StaffElement[][],
  available: number,
  gap: number,
  equal = false,
): number[] {
  const wanted = equal
    ? bars.map(() => available / Math.max(bars.length, 1))
    : bars.map((bar) => Math.max(BAR_MIN_GAPS, bar.length * ELEMENT_GAPS + 0.8) * gap);
  const total = wanted.reduce((a, b) => a + b, 0);
  if (total <= 0) return wanted;
  return wanted.map((w) => (w / total) * available);
}

/** Wo der erste Takt beginnt — die Fläche legt ihre Tippflächen danach aus. */
export function barsStartX(gap: number, hasTime: boolean): number {
  return gap * 0.4 + CLEF_GAPS * gap + (hasTime ? TIME_GAPS * gap : 0);
}

/** Die Figur, wie `FigureView` sie zeichnet. */
export function StaffLine({ fig, width }: { fig: StaffFigure; width: number }) {
  return (
    <Staff
      clef={fig.clef}
      time={fig.time}
      bars={fig.bars}
      steps={stepsOfBars(fig.bars, fig.clef)}
      width={Math.min(width, 520)}
    />
  );
}

/**
 * Die Stufen aller Zeichen einer Zeile, in der Ordnung, in der sie gezeichnet werden. Gerechnet
 * mit `staffStep` aus dem Vertrag und nirgends hier nachgebaut: diese Funktion entscheidet, auf
 * welcher Linie eine Note liegt, und zwei Fassungen davon wären zwei Wahrheiten.
 */
export function stepsOfBars(bars: readonly StaffElement[][], clef: Clef): number[] {
  return bars.flat().map((el) => (el.el === 'note' ? staffStep(el.pitch, clef) : 0));
}
