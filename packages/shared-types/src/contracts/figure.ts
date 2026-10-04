// Figures that go with a question: data the model writes and the app draws
// (never an image the model invents). docs/architecture.md §Practice.
// Coordinates are plain numbers; function expressions use the small grammar of
// @learnbuddy/shared-math `evaluateExpression` (x, + − · / ^, sqrt, sin, …).

import { z } from 'zod';

import { PeriodicTableFigure } from './periodic.js';
import { StaffFigure } from './staff.js';
import { AutomatonFigure, PedigreeFigure, TreeFigure } from './tree.js';

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

// ─── charts (issues #245, #246) ───
//
// The model writes the DATA, nothing else: no axis range, no tick, no colour, no answer. Shape
// limits sit here; what zod cannot say per branch — every series as long as the x labels, the
// slices of a pie adding up to 100 %, a box plot in order, labels that fit a 360 px phone — is
// `chartProblem` in @learnbuddy/shared-math (`charts.ts`), and a chart that breaks it costs the
// question it belongs to (`practice/items.ts`). Rejected, never repaired.
//
// Field names are short on purpose: these branches sit in every item of every generated set,
// and the schema that carries them is near the size Vertex still serves (issue #281). Nothing
// here is nullable — an empty string or list says "none" without an `anyOf`.

/** A label on a chart axis or in a legend: short enough to stand on a phone. */
const Short = z.string().trim().min(1).max(14);
/** An axis title with its unit ("Zeit in s"); "" for none. */
const Title = z.string().trim().max(24);
/** A unit next to numbers ("°C", "%", "Mio."); "" for none. */
const Unit = z.string().trim().max(8);

export const LineChartFigure = z.object({
  type: z.literal('line_chart'),
  /** x labels in order: categories ("Jan", "1990") or numbers ("0", "2.5"). */
  x: z.array(Short).min(2).max(12),
  xt: Title,
  /** 1–3 series, each one value per x label; `bar` draws it as columns, `r` on a right axis. */
  s: z
    .array(
      z.object({
        n: Short,
        u: Unit,
        v: z.array(Num).min(2).max(12),
        bar: z.boolean(),
        r: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
});

/** A Klimadiagramm as in the atlas: 12 months, °C as a line, mm as columns, 10 °C ≙ 20 mm. */
export const ClimateChartFigure = z.object({
  type: z.literal('climate_chart'),
  place: z.string().trim().min(1).max(28),
  /** Height above sea level in metres. */
  alt: z.number().int().min(-450).max(6000),
  t: z.array(z.number().min(-60).max(50)).length(12),
  p: z.array(z.number().min(0).max(2000)).length(12),
});

/** Shares in percent (they add up to 100); `half` draws a half circle (seats in a parliament). */
export const PieChartFigure = z.object({
  type: z.literal('pie_chart'),
  half: z.boolean(),
  /** Slice labels and their shares, in the same order (clockwise from 12 o'clock). */
  l: z.array(Short).min(2).max(8),
  v: z.array(z.number().positive().max(100)).min(2).max(8),
});

/** 1–3 box plots on one axis; `v` = min, Q1, median, Q3, max. `raw` = the data list, if given. */
export const BoxPlotFigure = z.object({
  type: z.literal('box_plot'),
  u: Unit,
  b: z
    .array(z.object({ l: Short, v: z.array(Num).length(5) }))
    .min(1)
    .max(3),
  raw: z.array(Num).max(40),
});

/** Equal classes from `x0` on, each `w` wide; `v` = the height of each column. */
export const HistogramFigure = z.object({
  type: z.literal('histogram'),
  x0: Num,
  w: Num.positive(),
  v: z.array(z.number().finite().min(0)).min(2).max(20),
  xt: Title,
  yt: Title,
});

/** Measured points; `fit` draws the least-squares line, which code computes. */
export const ScatterPlotFigure = z.object({
  type: z.literal('scatter_plot'),
  /** The points as two lists of the same length. */
  x: z.array(Num).min(3).max(30),
  y: z.array(Num).min(3).max(30),
  fit: z.boolean(),
  xt: Title,
  yt: Title,
});

/** Age groups from `a0` on, each `w` years wide, without gaps; `m` men, `f` women per group. */
export const PyramidFigure = z.object({
  type: z.literal('pyramid'),
  a0: z.number().int().min(0).max(100),
  w: z.number().int().min(1).max(20),
  m: z.array(z.number().finite().min(0)).min(4).max(20),
  f: z.array(z.number().finite().min(0)).min(4).max(20),
  u: Unit,
});

// ─── primary-school figures (issue #254) ───
//
// Uhr, Geld, Zwanzigerfeld/Hunderterfeld, Zehnersystem-Material: the model writes the DATA (a
// time, the pieces of money, how many dots, how many plates, rods and cubes), the app draws it.
// What a question reads off them — the time, the span, the amount, the count — is COMPUTED by
// code (`primaryKey` in @learnbuddy/shared-math), and a key that disagrees costs the question
// (`apps/api/src/modules/practice/figureCheck.ts`). Short field names and no nullable field
// ("none" instead of null), for the same reason as the charts above (issue #281).

/** The coins and notes of the euro, the only pieces an amount is laid with (`MONEY_CENTS`). */
export const MONEY_PIECES = [
  '1ct',
  '2ct',
  '5ct',
  '10ct',
  '20ct',
  '50ct',
  '1€',
  '2€',
  '5€',
  '10€',
  '20€',
  '50€',
  '100€',
  '200€',
] as const;

/** An analog clock face — or two, for a span from the first time to the second. */
export const ClockFigure = z.object({
  type: z.literal('clock'),
  c: z
    .array(z.object({ h: z.number().int().min(0).max(23), m: z.number().int().min(0).max(59) }))
    .min(1)
    .max(2)
    .describe('one time; two for a span from the first to the second'),
  h24: z.boolean().describe('true only when the task asks for the 24-hour time'),
  ask: z
    .enum(['time', 'span', 'none'])
    .describe('the key is this computed value: time "7:45", span in min or h'),
});

/** Coins and notes, drawn as a schematic (never a picture of a real banknote). */
export const MoneyFigure = z.object({
  type: z.literal('money'),
  p: z
    .array(z.object({ d: z.enum(MONEY_PIECES), n: z.number().int().min(1).max(9) }))
    .min(1)
    .max(8)
    .describe('each piece once, n = how many'),
  ask: z.enum(['sum', 'none']).describe('the key is the amount, unit € or ct'),
});

/** A Zwanzigerfeld (2 × 10) or Hunderterfeld (10 × 10), filled row by row, one or two colours. */
export const DotFieldFigure = z.object({
  type: z.literal('dot_field'),
  field: z.enum(['twenty', 'hundred']),
  n: z.array(z.number().int().min(0).max(100)).min(1).max(2).describe('filled dots per colour'),
  ask: z.enum(['count', 'none']).describe('the key is the number of filled dots'),
});

/** Base-ten blocks: hundred plates, ten rods, unit cubes (more than 9 to practise bundling). */
export const BaseTenFigure = z.object({
  type: z.literal('base_ten'),
  h: z.number().int().min(0).max(9),
  t: z.number().int().min(0).max(19),
  o: z.number().int().min(0).max(19),
  ask: z.enum(['count', 'none']).describe('the key is the number shown'),
});

/** The primary-school figures: their key is computed from their data (`primaryKey`). */
export const PRIMARY_TYPES = ['clock', 'money', 'dot_field', 'base_ten'] as const;

/**
 * What a question READS OFF its chart (`ItemDraft.read`), so code can compute the key and
 * reject one that disagrees (Rule 0). `s` = series (climate: 0 °C, 1 mm · pyramid: 0 men,
 * 1 women · box plot: which box), `i`/`j` = positions (box plot `i`: 0 min … 4 max). What each
 * `q` means per chart, and which pairs exist at all, is `readChart` in shared-math.
 */
export const ChartRead = z.object({
  q: z.enum([
    'value',
    'max',
    'min',
    'argmax',
    'argmin',
    'sum',
    'mean',
    'range',
    'diff',
    'angle',
    'iqr',
    'humid',
    'arid',
    'humid_at',
    'slope',
    'intercept',
    'type',
  ]),
  s: z.number().int().min(0).max(2),
  i: z.number().int().min(0).max(19),
  j: z.number().int().min(0).max(19),
});
export type ChartRead = z.infer<typeof ChartRead>;

/** The chart figures: their keys can be read off, so they can be checked (`ChartRead`). */
export const CHART_TYPES = [
  'line_chart',
  'climate_chart',
  'pie_chart',
  'box_plot',
  'histogram',
  'scatter_plot',
  'pyramid',
] as const;

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
/** The figures the model may write — one list, shared with `Figure` below. */
const MODEL_FIGURES = [
  FractionFigure,
  NumberLineFigure,
  FunctionPlotFigure,
  BarChartFigure,
  GeometryFigure,
  TableFigure,
  MoleculeFigure,
  LineChartFigure,
  ClimateChartFigure,
  PieChartFigure,
  BoxPlotFigure,
  HistogramFigure,
  ScatterPlotFigure,
  PyramidFigure,
  ClockFigure,
  MoneyFigure,
  DotFieldFigure,
  BaseTenFigure,
  TreeFigure,
  PedigreeFigure,
  AutomatonFigure,
  PeriodicTableFigure,
] as const;

export const ModelFigure = z.discriminatedUnion('type', [...MODEL_FIGURES]);
export type ModelFigure = z.infer<typeof ModelFigure>;

/** Every figure a question can SHOW (`ItemView.figure`) — the model's figures and the note line. */
export const Figure = z.discriminatedUnion('type', [...MODEL_FIGURES, StaffFigure]);
export type ChartFigure = Extract<Figure, { type: (typeof CHART_TYPES)[number] }>;
export type PrimaryFigure = Extract<Figure, { type: (typeof PRIMARY_TYPES)[number] }>;
export type Figure = z.infer<typeof Figure>;
