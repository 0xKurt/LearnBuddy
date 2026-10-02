// Figures that go with a question: data the model writes and the app draws
// (never an image the model invents). docs/architecture.md §Practice.
// Coordinates are plain numbers; function expressions use the small grammar of
// @learnbuddy/shared-math `evaluateExpression` (x, + − · / ^, sqrt, sin, …).

import { z } from 'zod';

import { StaffFigure } from './staff.js';

const Label = z.string().trim().min(1).max(40);
const Num = z.number().finite();

export const FractionFigure = z.object({
  type: z.literal('fraction'),
  shape: z.enum(['circle', 'bar']),
  /** One to three fractions side by side (e.g. to compare 2/3 and 3/5). */
  fractions: z
    .array(
      z.object({ parts: z.number().int().min(1).max(24), filled: z.number().int().min(0).max(24) }),
    )
    .min(1)
    .max(3),
});

export const NumberLineFigure = z.object({
  type: z.literal('number_line'),
  min: Num,
  max: Num,
  step: Num.positive(),
  points: z.array(z.object({ value: Num, label: Label.nullable() })).max(8),
});

export const FunctionPlotFigure = z.object({
  type: z.literal('function_plot'),
  functions: z
    .array(z.object({ expr: z.string().trim().min(1).max(80), label: Label.nullable() }))
    .max(3),
  x_min: Num,
  x_max: Num,
  y_min: Num,
  y_max: Num,
  points: z.array(z.object({ x: Num, y: Num, label: Label.nullable() })).max(8),
});

export const BarChartFigure = z.object({
  type: z.literal('bar_chart'),
  bars: z
    .array(z.object({ label: Label, value: Num }))
    .min(1)
    .max(12),
  unit: z.string().trim().max(20).nullable(),
});

const PointName = z.string().trim().min(1).max(3);
/** A measure or a name written at an angle, a side or an arrow: "50°", "5 cm", "α", "F₁", "?". */
const MeasureLabel = z.string().trim().min(1).max(12);

/**
 * A figure drawn TO SCALE (issue #257): every measure it states is checked against its own
 * coordinates by `apps/api/src/modules/practice/figureCheck.ts`, and a figure that contradicts
 * its numbers costs the question. The new arrays default to empty, so figures stored before
 * #257 still read.
 */
export const GeometryFigure = z.object({
  type: z.literal('geometry'),
  points: z
    .array(z.object({ name: PointName, x: Num, y: Num }))
    .min(1)
    .max(16),
  /** Segments and polygons refer to point names. */
  segments: z.array(z.object({ from: z.string(), to: z.string() })).max(16),
  polygons: z.array(z.array(z.string()).min(3).max(8)).max(4),
  circles: z.array(z.object({ center: z.string(), radius: Num.positive() })).max(3),
  angles: z
    .array(
      z.object({
        at: z.array(PointName).length(3),
        deg: Num.gt(0).lt(360).nullable(),
        label: MeasureLabel.nullable(),
      }),
    )
    .max(6)
    .describe('arc at the middle point; deg = its size')
    .default([]),
  lengths: z
    .array(
      z.object({
        from: PointName,
        to: PointName,
        value: Num.positive().nullable(),
        label: MeasureLabel.nullable(),
      }),
    )
    .max(8)
    .describe("value = the side's length")
    .default([]),
  arrows: z
    .array(
      z.object({
        from: PointName,
        to: PointName,
        value: Num.positive().nullable(),
        label: MeasureLabel.nullable(),
        resultant: z.boolean(),
      }),
    )
    .max(6)
    .describe('value = its size; resultant = sum of the others')
    .default([]),
  rays: z
    .array(
      z.object({ from: PointName, through: PointName, kind: z.enum(['ray', 'light', 'light_in']) }),
    )
    .max(6)
    .describe('light_in: light ending at "through"')
    .default([]),
  lines: z
    .array(z.object({ a: PointName, b: PointName, label: MeasureLabel.nullable() }))
    .max(4)
    .default([]),
});

/** The elements a structural formula may hold (issue #253): school chemistry, main groups. */
export const MOLECULE_ELEMENTS = [
  'H',
  'B',
  'C',
  'N',
  'O',
  'F',
  'Si',
  'P',
  'S',
  'Cl',
  'Br',
  'I',
  'Li',
  'Na',
  'K',
  'Mg',
  'Ca',
] as const;
/** An atom's alias in the figure ("a1" … "a40"): a label, never an id of anything stored. */
const AtomAlias = z.string().regex(/^a\d{1,2}$/);

/**
 * A structural formula as DATA (issue #253): atoms and bonds, nothing drawn by the model.
 * `packages/shared-math/src/molecule.ts` computes the lone pairs, checks every atom's shell and
 * charge, and lays the molecule out; a molecule that does not hold costs the question.
 */
export const MoleculeFigure = z.object({
  type: z.literal('molecule'),
  style: z
    .enum(['lewis', 'structural', 'skeletal'])
    .describe('lewis: pairs as dots · structural: as bars · skeletal: zigzag'),
  atoms: z
    .array(
      z.object({
        id: AtomAlias,
        el: z.enum(MOLECULE_ELEMENTS),
        h: z.number().int().min(0).max(4),
        charge: z.number().int().min(-2).max(2),
      }),
    )
    .min(1)
    .max(24)
    .describe('hydrogens go in h, not here'),
  bonds: z
    .array(z.object({ a: AtomAlias, b: AtomAlias, order: z.number().int().min(1).max(3) }))
    .max(30),
  mark: z
    .array(AtomAlias)
    .max(4)
    .describe('one functional group: its heteroatoms + C of C=O/C=C/C≡C')
    .default([]),
  ask: z
    .enum(['formula', 'lone_pairs', 'molar_mass'])
    .nullable()
    .describe('the key is this computed value')
    .default(null),
});

export const TableFigure = z.object({
  type: z.literal('table'),
  header: z.array(z.string().trim().max(40)).min(1).max(6),
  rows: z
    .array(z.array(z.string().trim().max(40)).min(1).max(6))
    .min(1)
    .max(10),
});

/**
 * The figures the MODEL may write next to a question of its own (`ItemDraft.figure`).
 *
 * The note line (`StaffFigure`, issue #226) is deliberately not among them. Every other figure
 * here illustrates a question whose key the model also wrote, and a wrong picture next to a
 * right key costs at most a confusing drawing. A note line is different: the key IS read off
 * the drawing — the note's name, the interval, the time signature — so a line that does not
 * match would make the key wrong, and the rule check would then reject a right answer with
 * full authority (the lesson of issue #157). Note lines therefore only ever come out of
 * `apps/api/src/modules/practice/staff.ts`, which computes the question, the drawing and the
 * key from one reviewed task.
 */
export const ModelFigure = z.discriminatedUnion('type', [
  FractionFigure,
  NumberLineFigure,
  FunctionPlotFigure,
  BarChartFigure,
  GeometryFigure,
  TableFigure,
  MoleculeFigure,
]);
export type ModelFigure = z.infer<typeof ModelFigure>;

/** Every figure a question can SHOW (`ItemView.figure`) — the model's seven and the note line. */
export const Figure = z.discriminatedUnion('type', [
  FractionFigure,
  NumberLineFigure,
  FunctionPlotFigure,
  BarChartFigure,
  GeometryFigure,
  TableFigure,
  MoleculeFigure,
  StaffFigure,
]);
export type Figure = z.infer<typeof Figure>;
