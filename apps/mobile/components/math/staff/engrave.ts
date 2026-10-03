// Die Notenzeile, gestochen von VexFlow 4.2.5 (MIT; issue #312, Owner 03.10.: „Ja, VexFlow").
//
// Bis #312 zeichnete die App Schlüssel, Köpfe, Hälse, Fähnchen und Pausen selbst (783 Zeilen, ein
// Violinschlüssel aus acht Kurven). Jetzt sticht VexFlow, und zwar nur das: unser Datenmodell
// (`StaffFigure`, `StaffElement`, `contracts/staff.ts`) bleibt die geprüfte Wahrheit, VexFlow
// bekommt nur Noten, die Code schon abgeleitet hat (Tonhöhe, Wert, Punkt, Kreuz), und entscheidet
// nichts außer der Tinte (Regel 0). Die Stufen und der Beginn des ersten Takts kommen aus
// `geometry.ts`, damit die Schreibfläche einen Tipp genau auf die Linie setzt, die gezeichnet ist.
//
// Diese Datei ist der einzige Ort, der VexFlow importiert, und sie wird erst geladen, wenn ein
// Bildschirm eine Notenzeile zeigt (`useEngraver`): VexFlow mit den Bravura-Umrissen kostet rund
// 155 KB gzip, die sonst jeder Start der App mitlädt.
//
// Drei Bilder entstehen hier:
//   · `engraveRead` — die Zeile, die sie LIEST (eine Figur), so groß wie ihr Inhalt, auf Wunsch
//     mit Notennamen darunter (`StaffFigure.labels`, issue #312);
//   · `engraveWrite` — die Zeile, auf die sie SCHREIBT, mit festem Rahmen (jede Stufe antippbar),
//     gleich breiten Takten, dem Takt, der gefüllt wird, der gerade gesetzten Note und dem
//     Schreibstrich;
//   · `engraveGlyph` — ein Notenwert ohne Zeile, für die Wert-Tasten: die Taste für die Viertel
//     sieht genau aus wie die Viertel, die sie setzt.

import {
  type Clef,
  type NoteValue,
  type StaffElement,
  type TimeSignature,
} from '@learnbuddy/shared-types/contracts';
import {
  Accidental,
  BarlineType,
  Dot,
  Formatter,
  ModifierContext,
  Stave,
  StaveNote,
  TickContext,
} from 'vexflow/bravura';

import { SPACE_UNITS, TAIL_UNITS, headUnits, unitsOfStep, WRITE_REACH } from './geometry.js';
import { SvgStringContext, escapeXml, r2, type StaffInk } from './svgContext.js';

const DURATION: Record<NoteValue, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
};

/** VexFlows Schriftmaß für Köpfe, Pausen und Fähnchen (`Tables.NOTATION_FONT_SCALE`). */
const NOTATION_FONT_SCALE = 39;
/**
 * Wie viel größer Köpfe, Pausen und Fähnchen stehen als im Druck: gut ein Siebtel, wie in
 * Notenheften für Kinder (Owner, #312: „Die Notenköpfe werden größer"). Auf jeder Zeile gleich —
 * gelesen, geschrieben, auf den Wert-Tasten —, damit eine Viertel überall gleich aussieht. Mehr
 * nicht: auf der Schreibfläche (Schlüssel, Taktart und zwei Takte auf 328 pt) stießen volle Takte
 * sonst aneinander. Die Linien bleiben, wo sie sind.
 */
const HEAD_SCALE = 1.15;

/** Wo VexFlow eine Pause hinsetzt: auf die mittlere Linie des Schlüssels. */
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };

/**
 * Breite je Zeichen und kleinster Takt einer gelesenen Zeile, in Einheiten. Eng genug, dass eine
 * kurze Zeile in der Figurkarte groß gezeichnet wird (die Breite bestimmt den Maßstab), weit genug,
 * dass Köpfe, Kreuze und Fähnchen nicht aneinanderstoßen.
 */
const PER_ELEMENT = 24;
/** Mit Notennamen darunter: „Sol" und „Do" brauchen nebeneinander mehr Luft als ein Kopf. */
const PER_LABELLED = 28;
const BAR_PAD = 14;
const BAR_MIN = 44;

/**
 * Die Notennamen stehen in einer eigenen Zeile UNTER allem, was eine Note zeichnet — Kopf,
 * Hilfslinie, ein Hals nach unten, ein Kreuz —, nie dazwischen: so stoßen Namen nie an Linien oder
 * Hälse. Ihre Schriftgröße gibt der Aufrufer in Einheiten (er kennt den Maßstab und rechnet sie aus
 * Punkten um, damit ein Name auf jeder Zeile gleich groß zu lesen ist); dazu ein halber
 * Linienabstand Luft.
 */
const LABEL_GAP = 3;
/** Wie weit ein Großbuchstabe über die Grundlinie reicht, als Anteil der Schriftgröße. */
const CAP_HEIGHT = 0.75;

/** Was je Zeichen nach dem Stechen bekannt ist: Mitte des Kopfes und wie weit seine Tinte reicht. */
export type Placed = {
  x: number;
  /** Die Höhe des Kopfes (bei einer Pause: ihre Linie). */
  y: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Eine fertige Zeichnung in Einheiten; der Aufrufer wählt den Maßstab. */
export type Picture = { xml: string; width: number; height: number };

function toNote(
  el: StaffElement,
  clef: Clef,
  options: { accent?: string; stemUp?: boolean } = {},
): StaveNote {
  const rest = el.el === 'rest';
  const note = new StaveNote({
    keys: [rest ? REST_KEY[clef] : `${el.pitch.name[0]!.toLowerCase()}/${el.pitch.octave}`],
    duration: `${DURATION[el.value]}${rest ? 'r' : ''}`,
    clef,
    glyph_font_scale: NOTATION_FONT_SCALE * HEAD_SCALE,
    ...(options.stemUp ? { stem_direction: 1 } : { auto_stem: !rest }),
  });
  if (!rest && el.pitch.name.endsWith('#')) note.addModifier(new Accidental('#'), 0);
  if (el.dotted) Dot.buildAndAttach([note], { all: true });
  if (options.accent) note.setStyle({ fillStyle: options.accent, strokeStyle: options.accent });
  return note;
}

function placedOf(note: StaveNote): Placed {
  const box = note.getBoundingBox();
  const left = note.getAbsoluteX();
  return {
    x: left + note.getGlyphWidth() / 2,
    y: note.getYs()[0] ?? unitsOfStep(0),
    left: box.getX(),
    right: box.getX() + box.getW(),
    top: box.getY(),
    bottom: box.getY() + box.getH(),
  };
}

type Line = {
  clef: Clef;
  time: TimeSignature | null;
  bars: readonly StaffElement[][];
  /** Wo jeder Takt beginnt und wie breit er ist (Einheiten); der erste beginnt hinter dem Kopf. */
  starts: readonly number[];
  widths: readonly number[];
  /** Die Note (Index über die ganze Zeile), die in der Akzentfarbe steht. */
  selected?: number | null;
  accent?: string;
  /**
   * Die Schreibfläche: jeder Takt verteilt seinen Inhalt über die ganze Breite, statt ihn nach
   * seinem Platz im vollen Takt zu setzen — eine halb geschriebene Zeile sähe sonst gedrängt links
   * mit einem leeren Loch dahinter aus. Der Takt `slot` hält am Ende einen Platz für das nächste
   * Zeichen frei (ein unsichtbares Viertel); dort steht der Schreibstrich.
   */
  spread?: { slot: number | null };
};

/**
 * Die fünf Linien, Schlüssel, Taktart, Taktstriche und Zeichen — ein VexFlow-System je Takt, damit
 * jeder Takt genau dort steht, wo `starts`/`widths` ihn haben wollen (die Tippziele der
 * Schreibfläche liegen darüber).
 */
function drawLine(ctx: SvgStringContext, line: Line): { placed: Placed[]; slotX: number | null } {
  const placed: Placed[] = [];
  let slotX: number | null = null;
  let seen = 0;
  line.bars.forEach((bar, k) => {
    const start = line.starts[k] ?? 0;
    const width = line.widths[k] ?? BAR_MIN;
    const first = k === 0;
    const stave = new Stave(first ? 0 : start, 0, first ? start + width : width);
    if (first) {
      stave.addClef(line.clef);
      if (line.time) stave.addTimeSignature(line.time);
      stave.setNoteStartX(start);
    }
    // Kein Strich vor dem Schlüssel (eine Zeile beginnt offen); zwischen den Takten einer, am
    // Ende der Schlussstrich.
    stave.setBegBarType(first ? BarlineType.NONE : BarlineType.SINGLE);
    stave.setEndBarType(k === line.bars.length - 1 ? BarlineType.END : BarlineType.NONE);
    stave.setContext(ctx).draw();
    const notes = bar.map((el, i) =>
      toNote(el, line.clef, {
        ...(line.selected === seen + i && line.accent ? { accent: line.accent } : {}),
      }),
    );
    if (line.spread) {
      // Gleiche Plätze statt Rhythmus-Abständen: auf der Schreibfläche wächst der Inhalt unter
      // ihrem Finger, und ein Zeichen, das beim nächsten Tipp weit wegrutscht, wäre ein bewegtes
      // Ziel. Der freie Platz am Ende ist der für das nächste Zeichen.
      const free = line.spread.slot === k ? 1 : 0;
      // Luft an beiden Enden — hinten mehr, dort steht der Ring der gesetzten Note neben dem
      // (Schluss-)Strich: kein Kopf und kein Ring berührt einen Taktstrich.
      const from = stave.getNoteStartX() + SPACE_UNITS * 0.3;
      const to = stave.getNoteEndX() - SPACE_UNITS * 1.5;
      const slot = (to - from) / Math.max(notes.length + free, 1);
      notes.forEach((note, i) => {
        note.addToModifierContext(new ModifierContext());
        const tick = new TickContext().addTickable(note).preFormat().setX(0);
        note.setStave(stave).setContext(ctx);
        // VexFlow rechnet die Stelle eines Kopfes von Taktanfang und Polster aus; wir setzen ihn
        // genau in die Mitte seines Platzes.
        const centre = from + slot * (i + 0.5);
        tick.setX(centre - note.getGlyphWidth() / 2 - note.getAbsoluteX());
        // Eine Pause hat keinen Kopf: sie steht mit ihrer Tinte mittig, nicht mit VexFlows Maß.
        if (note.isRest()) {
          const box = note.getBoundingBox();
          tick.setX(tick.getX() + centre - (box.getX() + box.getW() / 2));
        }
        note.draw();
      });
      if (free) slotX = from + slot * (notes.length + 0.5);
    } else if (notes.length > 0) {
      Formatter.FormatAndDraw(ctx, stave, notes);
    }
    placed.push(...notes.map(placedOf));
    seen += bar.length;
  });
  return { placed, slotX };
}

/**
 * Die Notennamen unter ihren Noten: eine Zeile, deren Oberkante unter der tiefsten Tinte JEDER
 * Note liegt (auch der unbeschrifteten daneben — deren Hals oder Hilfslinie soll ein Name so wenig
 * berühren wie die eigene) und mindestens unter der untersten Linie.
 */
export function labelRow(placed: readonly Placed[], size: number): number {
  const lowest = Math.max(unitsOfStep(-4), ...placed.map((p) => p.bottom));
  return lowest + LABEL_GAP + size * CAP_HEIGHT;
}

/** Die gelesene Zeile, zugeschnitten auf ihre Tinte. `names[i]` beschriftet das i-te Zeichen. */
export function engraveRead(input: {
  clef: Clef;
  time: TimeSignature | null;
  bars: readonly StaffElement[][];
  names: readonly (string | null)[];
  colors: StaffInk & { label: string };
  font: string | undefined;
  /** Schriftgröße der Namen in Einheiten. */
  labelSize: number;
}): Picture & { placed: Placed[]; baseline: number | null } {
  const ctx = new SvgStringContext(input.colors);
  const head = headUnits(input.time !== null);
  const labelled = input.names.some((n) => n !== null);
  const per = labelled ? PER_LABELLED : PER_ELEMENT;
  const widths = input.bars.map((bar) => Math.max(BAR_MIN, bar.length * per + BAR_PAD));
  const starts: number[] = [];
  widths.reduce((x, w) => {
    starts.push(x);
    return x + w;
  }, head);
  const { placed } = drawLine(ctx, { ...input, starts, widths });
  let baseline: number | null = null;
  if (labelled) {
    const size = input.labelSize;
    baseline = labelRow(placed, size);
    const family = input.font ? ` font-family="${escapeXml(input.font)}"` : '';
    placed.forEach((p, i) => {
      const name = input.names[i];
      if (!name) return;
      const half = (name.length * size * 0.6) / 2;
      ctx.see(p.x - half, (baseline as number) - size);
      ctx.see(p.x + half, (baseline as number) + size * 0.25);
      ctx.over(
        `<text x="${r2(p.x)}" y="${r2(baseline as number)}" fill="${input.colors.label}" font-size="${size}" font-weight="600" text-anchor="middle"${family}>${escapeXml(name)}</text>`,
      );
    });
  }
  const pad = 2;
  const box = {
    x: ctx.minX - pad,
    y: ctx.minY - pad,
    width: ctx.maxX - ctx.minX + 2 * pad,
    height: ctx.maxY - ctx.minY + 2 * pad,
  };
  return { xml: ctx.toSvg(box), width: box.width, height: box.height, placed, baseline };
}

/** Die Schreibfläche: fester Rahmen (`WRITE_REACH`), gleich breite Takte, `width` in Einheiten. */
export function engraveWrite(input: {
  clef: Clef;
  time: TimeSignature;
  bars: readonly StaffElement[][];
  width: number;
  activeBar: number | null;
  selected: number | null;
  cursor: boolean;
  colors: StaffInk & { soft: string };
}): { xml: string; placed: Placed[] } {
  const ctx = new SvgStringContext(input.colors);
  const head = headUnits(true);
  const each = Math.max(input.width - head - TAIL_UNITS, SPACE_UNITS) / input.bars.length;
  const starts = input.bars.map((_, k) => head + k * each);
  const widths = input.bars.map(() => each);
  // Der Takt, in den sie gerade schreibt, hält einen Platz für das nächste Zeichen frei.
  const slot = input.cursor ? input.activeBar : null;
  const { placed, slotX } = drawLine(ctx, {
    ...input,
    starts,
    widths,
    spread: { slot },
    accent: input.colors.accent,
  });
  const { accent, soft } = input.colors;
  const band = { top: unitsOfStep(5), height: 5 * SPACE_UNITS };
  // Der Takt, der gerade gefüllt wird: ein ruhiger Hintergrund, nie das einzige Signal.
  if (input.activeBar !== null) {
    const x = starts[input.activeBar] ?? head;
    ctx.under(
      `<rect x="${r2(x)}" y="${r2(band.top)}" width="${r2(each)}" height="${band.height}" rx="3" fill="${soft}" fill-opacity="0.45"/>`,
    );
  }
  // Die Note, die sie gerade bewegt: ein Ring UND die Akzentfarbe, damit die Auswahl auch ohne
  // Violett-von-Schwarz-Unterscheiden zu lesen ist.
  const picked = input.selected === null ? undefined : placed[input.selected];
  if (picked) {
    ctx.over(
      `<circle cx="${r2(picked.x)}" cy="${r2(picked.y)}" r="${r2(9.5 * HEAD_SCALE)}" fill="${accent}" fill-opacity="0.16" stroke="${accent}" stroke-width="1"/>`,
    );
  }
  // Der Schreibstrich: wohin das nächste Zeichen kommt. Er sagt WO, nie welcher Ton.
  if (slotX !== null) {
    const x = slotX;
    ctx.over(
      `<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(unitsOfStep(5))}" y2="${r2(unitsOfStep(-5))}" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>`,
    );
  }

  const top = unitsOfStep(WRITE_REACH.top);
  const height = unitsOfStep(WRITE_REACH.bottom) - top;
  return { xml: ctx.toSvg({ x: 0, y: top, width: input.width, height }), placed };
}

/**
 * Ein Notenwert ohne Zeile, für die Wert-Tasten: fünf Linienabstände hoch, Hals nach oben. Ganze
 * und halbe Pause behalten ihre Linie — ohne sie wären beide nur ein Rechteck.
 */
export function engraveGlyph(input: {
  value: NoteValue;
  rest: boolean;
  dotted: boolean;
  color: string;
}): Picture {
  const ink = { ink: input.color, lines: input.color, accent: input.color };
  const ctx = new SvgStringContext(ink);
  const stave = new Stave(0, 0, 80);
  // Die ganze Pause hängt an der zweiten Linie von oben, die halbe liegt auf der mittleren.
  const shown = !input.rest ? -1 : input.value === 'whole' ? 1 : input.value === 'half' ? 2 : -1;
  stave.setConfigForLines([0, 1, 2, 3, 4].map((line) => ({ visible: line === shown })));
  stave.setBegBarType(BarlineType.NONE).setEndBarType(BarlineType.NONE);
  stave.setContext(ctx).draw();
  const el: StaffElement = input.rest
    ? { el: 'rest', value: input.value, dotted: input.dotted }
    : { el: 'note', pitch: { name: 'B', octave: 4 }, value: input.value, dotted: input.dotted };
  // Nur die Tinte des Zeichens zählt für den Ausschnitt, nicht die unsichtbaren Linien.
  const glyph = new SvgStringContext(ink);
  const note = toNote(el, 'treble', { stemUp: true });
  Formatter.FormatAndDraw(glyph, stave, [note]);
  const p = placedOf(note);
  const height = 5 * SPACE_UNITS;
  const centre = input.rest ? (p.top + p.bottom) / 2 : unitsOfStep(0) - 1.5 * SPACE_UNITS;
  const width = Math.max(3 * SPACE_UNITS, p.right - p.left + 4);
  const box = { x: (p.left + p.right) / 2 - width / 2, y: centre - height / 2, width, height };
  // Die eine sichtbare Linie (ganze und halbe Pause) liegt im ersten Kontext; beide zusammen.
  const lines = ctx.toSvg(box).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  glyph.under(lines);
  return { xml: glyph.toSvg(box), width, height };
}
