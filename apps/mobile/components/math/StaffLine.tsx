// Die gezeichnete Notenzeile (issues #226, #275, #312): fünf Linien, Schlüssel, Taktart, Noten und
// Pausen, aus Daten — wie jede andere Figur schickt der Server nur Werte (`StaffFigure`,
// packages/shared-types/src/contracts/staff.ts).
//
// Gestochen wird seit #312 von VexFlow (`staff/engrave.ts`, über einen SVG-String, den `SvgXml`
// zeichnet); vorher zeichnete diese Datei Schlüssel, Köpfe und Pausen selbst. Geblieben ist die
// Regel, die die Form dieser Datei bestimmt: EIN Stecher für zwei Zwecke. Die Zeile, die sie LIEST
// (`FigureView`, eine Figur), die Zeile, auf die sie SCHREIBT (`practice/StaffAnswer.tsx`), und die
// Zeichen auf den Wert-Tasten müssen gleich aussehen — ein Kind, das gerade gelernt hat, wie ein
// Viertel aussieht, soll es nicht zweimal lernen.
//
// Was die Bibliothek nicht weiß, steht hier: die Farben aus dem Thema (`useTheme`), die Größe für
// Kinderaugen, und welche Noten ihren Namen tragen (`StaffFigure.labels`, in der Sprache der
// Lernenden aus `staff.note_short`).

import type {
  Clef,
  NoteValue,
  StaffElement,
  StaffFigure,
  TimeSignature,
} from '@learnbuddy/shared-types/contracts';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE_UNITS, writeHeight } from './staff/geometry.js';
import { useEngraver } from './staff/useEngraver.js';

/** The app's sans-serif inside SVG too (the web would fall back to a serif). */
const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

/**
 * Der größte Linienabstand einer GELESENEN Zeile, in Punkten. 24 und nicht mehr die 20 der eigenen
 * Zeichnung: VexFlows Köpfe haben Druckproportionen (gut ein Linienabstand breit), und der Owner
 * wollte sie größer als vorher (#312). Eine lange Zeile wird mit der Breite kleiner, eine einzelne
 * Note steht so groß da, wie es geht.
 */
const READ_SPACE_MAX = 24;

/**
 * Wie groß ein Notenname zu lesen ist, in Punkten — so groß wie die Antworten darunter, auf jeder
 * Zeile gleich, egal wie eng die Zeile selbst gezeichnet ist.
 */
const LABEL_PT = 15;

/** Die gelesene Zeile, wie `FigureView` sie zeichnet. */
export function StaffLine({ fig, width }: { fig: StaffFigure; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const engraver = useEngraver();
  const room = Math.min(width, 520);
  const names = useMemo(() => noteLabels(fig, (name) => t(`staff.note_short.${name}`)), [fig, t]);
  const drawn = useMemo(() => {
    if (engraver === null) return null;
    const engrave = (labelSize: number) =>
      engraver.engraveRead({
        clef: fig.clef,
        time: fig.time,
        bars: fig.bars,
        names,
        colors: { ink: ink.stroke, lines: ink.axis, accent: ink.point, label: ink.point },
        font: FAMILY,
        labelSize,
      });
    const largest = READ_SPACE_MAX / SPACE_UNITS;
    const scaleOf = (w: number) => Math.min(largest, room / w);
    // Zweimal: der Maßstab folgt aus der Breite, die Schriftgröße der Namen aus dem Maßstab.
    // Die Namen ändern die Breite kaum, also steht der Maßstab nach dem ersten Durchgang fest.
    const first = engrave(LABEL_PT / largest);
    const scale = scaleOf(first.width);
    const picture = names.some((n) => n !== null) ? engrave(LABEL_PT / scale) : first;
    return { picture, scale: scaleOf(picture.width) };
  }, [engraver, fig, names, ink, room]);
  if (drawn === null) return null;
  const { picture, scale } = drawn;
  return <SvgXml xml={picture.xml} width={picture.width * scale} height={picture.height * scale} />;
}

/**
 * Welches Zeichen welchen Namen trägt: `labels` zählt Noten (Pausen nicht), das Bild zählt
 * Zeichen. `word` bekommt den Schlüssel des Tons (`Cs` für C#: ein Kreuz kann kein JSON-Schlüssel
 * sein).
 */
export function noteLabels(
  fig: Pick<StaffFigure, 'bars' | 'labels'>,
  word: (key: string) => string,
): (string | null)[] {
  let note = -1;
  return fig.bars.flat().map((el) => {
    if (el.el !== 'note') return null;
    note += 1;
    return fig.labels.includes(note) ? word(el.pitch.name.replace('#', 's')) : null;
  });
}

export type StaffProps = {
  clef: Clef;
  time: TimeSignature;
  /** Was gezeichnet wird. Ein leerer Takt ist erlaubt — die Fläche braucht ihn. */
  bars: readonly StaffElement[][];
  width: number;
  /** Der Linienabstand in Punkten; die Höhe ist `writeHeight(gap)`. */
  gap: number;
  /** Der Takt, in den als Nächstes geschrieben wird — er wird leicht hervorgehoben. */
  activeBar: number | null;
  /**
   * Die Note, die sie gerade setzt und mit „höher"/„tiefer" verschiebt (Index über die ganze
   * Zeile): in der Akzentfarbe UND mit einem Ring dahinter (issue #275).
   */
  selected: number | null;
  /** Der Schreibstrich: wohin das nächste Zeichen kommt. Er sagt WO, nie welcher Ton. */
  cursor: boolean;
};

/**
 * Die Zeile der Schreibfläche: fester Rahmen (jede Stufe antippbar), gleich breite Takte. Gleich
 * breit, weil der Inhalt unter ihrem Finger wächst — Takte, die dabei ihre Breite ändern, schöben
 * die Stellen weg, auf die sie gerade tippt. Die Tippziele legt `StaffAnswer` mit derselben
 * Geometrie darüber (`staff/geometry.ts`).
 */
export function Staff({ clef, time, bars, width, gap, activeBar, selected, cursor }: StaffProps) {
  const { figure: ink, palette } = useTheme();
  const engraver = useEngraver();
  const xml = useMemo(
    () =>
      engraver?.engraveWrite({
        clef,
        time,
        bars,
        width: (width * SPACE_UNITS) / gap,
        activeBar,
        selected,
        cursor,
        colors: {
          ink: ink.stroke,
          lines: ink.axis,
          accent: palette.primary,
          soft: palette.lavender,
        },
      }).xml ?? null,
    [engraver, clef, time, bars, width, gap, activeBar, selected, cursor, ink, palette],
  );
  const height = writeHeight(gap);
  if (xml === null) return <View style={{ width, height }} />;
  return <SvgXml xml={xml} width={width} height={height} />;
}

/**
 * Ein Notenwert als Zeichen, ohne Zeile: was auf den Wert-Tasten der Schreibfläche steht
 * (issue #275), gestochen wie die Zeile selbst. Worte wie „Sechzehntelnote" passen auf keine
 * Taste, die auf einem 360-pt-Handy zu fünft in eine Reihe muss, und das Zeichen ist ohnehin das,
 * was sie lernt; den Namen hört der Screenreader.
 */
export function ValueGlyph({
  value,
  rest = false,
  dotted = false,
  size = 30,
  color,
}: {
  value: NoteValue;
  rest?: boolean;
  dotted?: boolean;
  /** Die Höhe in Punkten (fünf Linienabstände). */
  size?: number;
  color: string;
}) {
  const engraver = useEngraver();
  const picture = useMemo(
    () => engraver?.engraveGlyph({ value, rest, dotted, color }) ?? null,
    [engraver, value, rest, dotted, color],
  );
  const width = picture ? (picture.width * size) / picture.height : (size * 3) / 5;
  if (picture === null) return <View style={{ width, height: size }} />;
  return <SvgXml xml={picture.xml} width={width} height={size} />;
}
