// Circuit diagrams, logic gates and Itten's colour wheel as data (issue #261).
// docs/architecture.md §Practice, Circuits.
//
// The model writes the parts, the gates, the marked fields and WHAT the question asks — no
// coordinate, no name, no key. The app draws them: lamps L1, L2 …, resistors R1 …, switches S1 …
// named in reading order, gates as German schools draw them (DIN EN 60617), the wheel with every
// field's name in words. Shape limits sit here; everything zod cannot say — a meter on a part that
// exists, a battery that is not short-circuited, a net whose gates all feed the last one, two
// colours the wheel shows a mixture of, a drawing that fits the 360 px phone — and every key
// (which lamps light, the equivalent resistance, a meter's reading, Q, the complement, the
// mixture) is computed and checked in @learnbuddy/shared-math (`circuit.ts`, `logic.ts`,
// `itten.ts`); `apps/api/src/modules/practice/circuitCheck.ts` and `colorCheck.ts` hold the
// question's key to it. Rejected, never repaired.
//
// Short property names and no nullable field, like the trees: these branches sit in every item
// of every generated set (the schema-size pressure of issue #281).

import { z } from 'zod';

const CircuitPart = z.object({
  k: z.enum(['lamp', 'resistor', 'switch']),
  r: z.number().min(0).max(9999).describe('lamp, resistor: Ω, 0 = not given; switch: 0'),
  o: z.boolean().describe('switch: true = open; else false'),
});

/** Two references to a part as the app names it ("L2", "R1", "S1"), "" for none. */
const PartName = z.string().trim().max(2);

export const CircuitFigure = z.object({
  type: z.literal('circuit'),
  u: z.number().min(0).max(400).describe('battery voltage in V, 0 = not given'),
  b: z
    .array(z.array(z.array(CircuitPart).min(1).max(3)).min(1).max(3))
    .min(1)
    .max(4)
    .describe(
      'blocks along the wire, left to right; block = branches (2–3 = parallel); branch = parts in series',
    ),
  m: z.enum(['none', 'ammeter', 'voltmeter']),
  mt: PartName.describe(
    'the meter\'s part ("R1"): ammeter after it, voltmeter across it; "" = main wire / battery',
  ),
  ask: z.enum(['none', 'lit', 'lit_count', 'kind', 'r_total', 'current', 'voltage']),
  at: PartName.describe('lit: the lamp ("L2"); else ""'),
});

const Signal = z.enum(['A', 'B', 'C', 'G1', 'G2', '']);

export const LogicFigure = z.object({
  type: z.literal('logic'),
  g: z
    .array(
      z.object({
        o: z.enum(['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor']),
        a: Signal,
        b: Signal.describe('not: ""'),
      }),
    )
    .min(1)
    .max(3)
    .describe('gates G1, G2, G3; the last is Q, every other one takes only inputs and feeds it'),
  ask: z.enum(['none', 'out', 'ones']),
  v: z.array(z.number().int().min(0).max(1)).max(3).describe('out: the inputs, A first; else []'),
});

/** Itten's twelve fields, clockwise from yellow (the order is `ITTEN_HUES` in shared-math). */
const Hue = z.enum([
  'yellow',
  'yellow_orange',
  'orange',
  'red_orange',
  'red',
  'red_violet',
  'violet',
  'blue_violet',
  'blue',
  'blue_green',
  'green',
  'yellow_green',
]);

export const ColorWheelFigure = z.object({
  type: z.literal('color_wheel'),
  hl: z.array(Hue).max(4).describe("marked fields; a multiple choice's options in this order"),
  ask: z.enum(['none', 'complement', 'mix', 'class']),
  at: z.array(Hue).max(2).describe('complement, class: [the colour]; mix: [the two]; none: []'),
});
