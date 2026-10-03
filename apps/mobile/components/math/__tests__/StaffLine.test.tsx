// Die Notenzeile, gestochen von VexFlow (issue #312). Festgehalten wird, was zwischen „VexFlow
// zeichnet Noten" und „unsere Zeile stimmt" liegt:
//
//   · **Die Linie, die man sieht, ist die Linie, die man trifft.** Die Schreibfläche rechnet einen
//     Tipp mit `staff/geometry.ts` in eine Stufe um, VexFlow setzt den Kopf nach seinen eigenen
//     Regeln — beide müssen für JEDE Stufe übereinstimmen, und der erste Takt muss dort beginnen,
//     wo die Tippziele beginnen.
//   · **Notennamen stoßen nie an Hilfslinien oder Hälse**: ihre Zeile liegt unter der tiefsten
//     Tinte jeder Note.
//   · **Beschriftet ist, was `labels` sagt, in der Sprache der Lernenden** — und eine Zeile ohne
//     `labels` trägt keinen einzigen Namen.
//   · **Die Farben kommen aus dem Thema**, hell und dunkel.
//
// Was diese Schicht nicht sieht: wie es aussieht und ob es auf ein Handy passt. Das zeigen die
// Aufnahmen von `tests/web/modes.spec.ts` („note lines") bei 360×740 und 390×844, hell und dunkel.

import {
  STAFF_STEP_MAX,
  pitchAtStep,
  type Clef,
  type StaffElement,
  type StaffFigure,
} from '@learnbuddy/shared-types/contracts';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { i18n } from '../../../lib/i18n/index.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp } from '../../../testing/render.js';
import { StaffLine, noteLabels } from '../StaffLine.js';
import { engraveRead, engraveWrite } from '../staff/engrave.js';
import {
  SPACE_UNITS,
  headUnits,
  stepAtWriteY,
  unitsOfStep,
  WRITE_REACH,
} from '../staff/geometry.js';

const INK = { ink: 'ink', lines: 'lines', accent: 'accent', label: 'label', soft: 'soft' };

const note = (
  step: number,
  clef: Clef,
  value: StaffElement['value'] = 'quarter',
): StaffElement => ({
  el: 'note',
  pitch: pitchAtStep(step, clef),
  value,
  dotted: false,
});

const STEPS = Array.from({ length: 2 * STAFF_STEP_MAX + 1 }, (_, i) => i - STAFF_STEP_MAX);

afterEach(async () => {
  await i18n.changeLanguage('de');
});

describe('die Linie, die man sieht, ist die, die man trifft', () => {
  it('setzt jeden Kopf auf die Stufe der Geometrie, in beiden Schlüsseln', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const step of STEPS) {
        const { placed } = engraveWrite({
          clef,
          time: '4/4',
          bars: [[note(step, clef)]],
          width: 300,
          activeBar: null,
          selected: null,
          cursor: false,
          colors: INK,
        });
        expect(placed[0]?.y, `${clef} ${step}`).toBeCloseTo(unitsOfStep(step), 5);
        // Und zurück: ein Tipp genau auf diesen Kopf ist diese Stufe (bei 16 pt Linienabstand).
        const gap = 16;
        const y = ((placed[0]!.y - unitsOfStep(WRITE_REACH.top)) * gap) / SPACE_UNITS;
        expect(stepAtWriteY(y, gap)).toBe(step);
      }
    }
  });

  it('beginnt den ersten Takt hinter Schlüssel und Taktart und hält jeden Takt in seinen Grenzen', () => {
    const width = 400;
    const head = headUnits(true);
    const bars = [
      [note(-4, 'treble'), note(0, 'treble'), note(4, 'treble'), note(6, 'treble')],
      [note(-6, 'treble', 'half'), note(2, 'treble', 'half')],
    ];
    const { placed } = engraveWrite({
      clef: 'treble',
      time: '4/4',
      bars,
      width,
      activeBar: 1,
      selected: 5,
      cursor: true,
      colors: INK,
    });
    const each = (width - head - 4) / 2;
    placed.slice(0, 4).forEach((p) => {
      expect(p.left).toBeGreaterThanOrEqual(head);
      expect(p.right).toBeLessThanOrEqual(head + each);
    });
    placed.slice(4).forEach((p) => {
      expect(p.left).toBeGreaterThanOrEqual(head + each);
      expect(p.right).toBeLessThanOrEqual(head + 2 * each);
    });
  });
});

describe('Notennamen', () => {
  it('stehen unter der tiefsten Tinte jeder Note — Hilfslinie, Hals, Kreuz', () => {
    for (const clef of ['treble', 'bass'] as const) {
      // Die tiefste und die höchste Note (Hilfslinie unten, Hals nach unten oben), ein Kreuz.
      const bars: StaffElement[][] = [
        [note(-STAFF_STEP_MAX, clef), note(STAFF_STEP_MAX, clef, 'eighth'), note(0, clef)],
        [{ el: 'note', pitch: pitchAtStep(-3, clef, true), value: 'half', dotted: true }],
      ];
      const picture = engraveRead({
        clef,
        time: null,
        bars,
        names: ['A', 'B', 'C', 'D'],
        colors: INK,
        font: undefined,
        labelSize: 9,
      });
      const lowest = Math.max(...picture.placed.map((p) => p.bottom));
      const capTop = (picture.baseline as number) - 9 * 0.75;
      expect(capTop, clef).toBeGreaterThan(lowest);
      expect(capTop).toBeGreaterThan(unitsOfStep(-4));
      // Und jeder Name steht unter seiner Note, nicht verrutscht.
      const xs = [...picture.xml.matchAll(/<text x="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(xs).toEqual(picture.placed.map((p) => Math.round(p.x * 100) / 100));
    }
  });

  it('zählen nur Noten: eine Pause hat keinen Namen und keine Nummer', () => {
    const fig = {
      bars: [
        [
          { el: 'rest', value: 'quarter', dotted: false },
          { el: 'note', pitch: { name: 'C#', octave: 5 }, value: 'quarter', dotted: false },
        ],
        [{ el: 'note', pitch: { name: 'B', octave: 4 }, value: 'half', dotted: false }],
      ],
      labels: [1],
    } satisfies Pick<StaffFigure, 'bars' | 'labels'>;
    expect(noteLabels(fig, (key) => key)).toEqual([null, null, 'B']);
    expect(noteLabels({ ...fig, labels: [0, 1] }, (key) => key)).toEqual([null, 'Cs', 'B']);
  });
});

const INTERVAL: StaffFigure = {
  type: 'staff',
  clef: 'treble',
  time: null,
  bars: [
    [
      { el: 'note', pitch: { name: 'G', octave: 4 }, value: 'quarter', dotted: false },
      { el: 'note', pitch: { name: 'B', octave: 4 }, value: 'quarter', dotted: false },
    ],
  ],
  tempo: 80,
  labels: [0, 1],
};

/** Die Texte der gezeichneten Zeile, sobald VexFlow geladen ist. */
async function drawnTexts(fig: StaffFigure): Promise<{ texts: string[]; svg: SVGSVGElement }> {
  const { container } = renderInApp(<StaffLine fig={fig} width={320} />);
  const svg = await waitFor(
    () => {
      const found = container.querySelector('svg');
      if (!found) throw new Error('noch nicht gestochen');
      return found;
      // Das erste Laden holt VexFlow (ein eigener Bundle-Teil); danach ist es sofort da.
    },
    { timeout: 15_000 },
  );
  return { texts: Array.from(svg.querySelectorAll('text')).map((t) => t.textContent ?? ''), svg };
}

describe('die gelesene Zeile', () => {
  it('beschriftet in der Sprache der Lernenden: H auf Deutsch, Si auf Französisch', async () => {
    expect((await drawnTexts(INTERVAL)).texts).toEqual(['G', 'H']);
    await i18n.changeLanguage('fr');
    expect((await drawnTexts(INTERVAL)).texts).toEqual(['Sol', 'Si']);
    await i18n.changeLanguage('en');
    expect((await drawnTexts(INTERVAL)).texts).toEqual(['G', 'B']);
  });

  it('trägt ohne `labels` keinen einzigen Namen', async () => {
    expect((await drawnTexts({ ...INTERVAL, labels: [] })).texts).toEqual([]);
  });

  it('zeichnet in den Farben des Themas, nicht in festen', async () => {
    const { svg } = await drawnTexts(INTERVAL);
    const html = svg.outerHTML;
    // Der Test rendert im hellen Thema: Tinte und Namen in dessen Farben, kein VexFlow-Schwarz.
    const light = paletteOf(null);
    expect(html).toContain(light.ink);
    expect(html).toContain(light.primaryDk);
    expect(html).not.toMatch(/#000000|"black"|#999999/i);
  });
});
