// Anschauung als Figur: Grundschul-Bilder (issue #254) und Körper im Raum (issue #255).
// docs/architecture.md §Practice ("Figures code draws from a task").
//
// Dieselbe Bauweise wie die Notenzeile (`staff.ts`, issue #226) und aus demselben Grund: bei
// einer Uhr, einem Haufen Münzen, einem Zwanzigerfeld, einem Würfelnetz oder einem Punkt im Raum
// wird der Schlüssel VON DER ZEICHNUNG ABGELESEN. Ein Bild, das ein anderer gezeichnet hat als der,
// der den Schlüssel schreibt, wäre eine zweite Wahrheit (issue #157). Also gilt:
//
//   * Das Modell wählt eine `VisualTask` — welche Aufgabe, welche Uhrzeit, welche Münzen, welcher
//     Körper mit welchen Maßen. Es hat KEIN Feld für einen Fragetext, eine Lösung oder eine Figur.
//   * Code (`apps/api/src/modules/practice/visual.ts`) prüft die Daten, schreibt die Frage,
//     zeichnet die Figur und RECHNET den Schlüssel: Zeigerstellung → Uhrzeit, Münzen → Betrag,
//     Körper → Ecken, Kanten, Flächen (Euler), Maße → Volumen und Oberfläche, Netz → faltet es.
//   * Wo das Modell zusätzlich sagt, was es für die Lösung hält (`total`, `claim`, `is_net`), ist
//     das eine Nachprüfung: weicht es vom Gerechneten ab, entsteht KEINE Frage. Repariert wird
//     nichts (#224, „Regel 0").
//
// Die Figuren stehen deshalb in `Figure` und NICHT in `ModelFigure` (`figure.ts`): neben eine
// selbst geschriebene Frage darf das Modell keine Uhr legen, deren Zeiger es nicht gerechnet hat.
//
// Kompakt mit Absicht (#281: jeder Zweig und jedes nullable Feld kostet Zustände im Schema, das
// Vertex annehmen muss): sieben Zweige, kein einziges nullable Feld, Maße als kurze Liste statt
// vier optionaler Zahlen.

import { z } from 'zod';

// ─────────────── Geld ───────────────

/**
 * Die Euro-Stückelungen in Cent, die eine Grundschulaufgabe legt: acht Münzen und die vier
 * kleinen Scheine. Nur diese — ein Betrag, der sich mit ihnen nicht legen lässt (ein halber Cent),
 * ist kein Betrag. Gezeichnet werden sie SCHEMATISCH (ein Kreis, ein Rechteck, der Wert), nie als
 * Abbild einer echten Münze oder Banknote.
 */
export const DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export const Denomination = z
  .number()
  .int()
  .refine((n): n is Denomination => (DENOMINATIONS as readonly number[]).includes(n), {
    message: 'not a euro coin or small note (cent)',
  });

/** Ab hier ist es ein Schein. */
export const NOTE_FROM = 500;
/** So viele Stücke liegen höchstens auf dem Tisch — mehr zählt auf einem Handy niemand nach. */
export const MONEY_PIECES_MAX = 12;
/** So viel legt sie höchstens selbst: 100 € (in Cent). */
export const MONEY_SET_MAX = 10_000;

/** Die Summe einiger Stücke in Cent. */
export function centsOf(pieces: readonly number[]): number {
  return pieces.reduce((sum, p) => sum + p, 0);
}

/**
 * Was sie gelegt hat, als Maschinenform: die Stücke in Cent, durch Leerzeichen getrennt
 * („200 100 20 20 5"). Die App baut keinen deutschen Satz (das macht der Server, in ihrer
 * Sprache), und der Server muss nichts raten.
 */
export function renderCoins(pieces: readonly number[]): string {
  return [...pieces].sort((a, b) => b - a).join(' ');
}

/** Die Zeichenkette zurück als Stücke — oder null, wenn sie keine gelegten Münzen ist. */
export function parseCoins(text: string): Denomination[] | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 40) return null;
  const out: Denomination[] = [];
  for (const token of tokens) {
    if (!/^\d{1,4}$/.test(token)) return null;
    const n = Number(token);
    if (!(DENOMINATIONS as readonly number[]).includes(n)) return null;
    out.push(n as Denomination);
  }
  return out;
}

// ─────────────── die Figuren (was sie LIEST) ───────────────

/** Eine Zeigeruhr. `hour` 0–23: gezeichnet wird sie gleich, eine Zeigeruhr kennt keinen Abend. */
export const ClockFigure = z.object({
  type: z.literal('clock'),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
export type ClockFigure = z.infer<typeof ClockFigure>;

/** Münzen und Scheine auf dem Tisch, in Cent. */
export const MoneyFigure = z.object({
  type: z.literal('money'),
  pieces: z.array(Denomination).min(1).max(MONEY_PIECES_MAX),
});
export type MoneyFigure = z.infer<typeof MoneyFigure>;

/** Zwanzigerfeld (2 × 10) oder Hunderterfeld (10 × 10), die ersten `filled` Plättchen gefüllt. */
export const DotFieldFigure = z.object({
  type: z.literal('dot_field'),
  size: z.union([z.literal(20), z.literal(100)]),
  filled: z.number().int().min(0).max(100),
});
export type DotFieldFigure = z.infer<typeof DotFieldFigure>;

/**
 * Eine Zahl in Bündeln: `blocks` als Hunderterplatten, Zehnerstangen und Einerwürfel; `chart` als
 * Plättchen in der Stellenwerttafel (T · H · Z · E). Jede Stelle 0–9 — mehr wäre Entbündeln, und
 * das ist eine andere Aufgabe.
 */
export const BaseTenFigure = z.object({
  type: z.literal('base_ten'),
  look: z.enum(['blocks', 'chart']),
  thousands: z.number().int().min(0).max(9),
  hundreds: z.number().int().min(0).max(9),
  tens: z.number().int().min(0).max(9),
  ones: z.number().int().min(0).max(9),
});
export type BaseTenFigure = z.infer<typeof BaseTenFigure>;

/**
 * Die Körper. Prismen und Pyramiden mit regelmäßiger n-eckiger Grundfläche heißen nach ihrem n,
 * damit das Schema kein zusätzliches Feld braucht, das bei allen anderen leer stünde.
 */
export const SOLIDS = [
  'cube',
  'cuboid',
  'prism_3',
  'prism_5',
  'prism_6',
  'prism_8',
  'pyramid_3',
  'pyramid_4',
  'pyramid_5',
  'pyramid_6',
  'cylinder',
  'cone',
  'sphere',
] as const;
export const SolidKind = z.enum(SOLIDS);
export type SolidKind = z.infer<typeof SolidKind>;

/** Die Körper mit lauter ebenen Flächen: nur bei ihnen sind Ecken, Kanten, Flächen eindeutig. */
export function isPolyhedron(solid: SolidKind): boolean {
  return solid !== 'cylinder' && solid !== 'cone' && solid !== 'sphere';
}

/** Die Seitenzahl der Grundfläche eines Prismas oder einer Pyramide; 4 beim Würfel und Quader. */
export function baseSides(solid: SolidKind): number | null {
  if (solid === 'cube' || solid === 'cuboid') return 4;
  const m = /_(\d)$/.exec(solid);
  return m ? Number(m[1]) : null;
}

/** Ein Maß: Kante a, Tiefe b, Höhe h, Radius r. */
export const DIM_NAMES = ['a', 'b', 'h', 'r'] as const;
export const DimName = z.enum(DIM_NAMES);
export type DimName = z.infer<typeof DimName>;
export const LENGTH_UNITS = ['mm', 'cm', 'dm', 'm'] as const;
export const LengthUnit = z.enum(LENGTH_UNITS);
export type LengthUnit = z.infer<typeof LengthUnit>;

export const SolidDim = z.object({ name: DimName, value: z.number().positive().max(1000) });
export type SolidDim = z.infer<typeof SolidDim>;

/** Welche Maße ein Körper braucht, in der Reihenfolge, in der sie beschriftet werden. */
export const SOLID_DIMS: Record<SolidKind, readonly DimName[]> = {
  cube: ['a'],
  cuboid: ['a', 'b', 'h'],
  prism_3: ['a', 'h'],
  prism_5: ['a', 'h'],
  prism_6: ['a', 'h'],
  prism_8: ['a', 'h'],
  pyramid_3: ['a', 'h'],
  pyramid_4: ['a', 'h'],
  pyramid_5: ['a', 'h'],
  pyramid_6: ['a', 'h'],
  cylinder: ['r', 'h'],
  cone: ['r', 'h'],
  sphere: ['r'],
};

/**
 * Ein Körper als Schrägbild (Kavalierperspektive: Tiefe unter 45°, halb so lang). `dims` sind
 * die Maße, nach denen gezeichnet wird; `labeled` heißt, sie stehen an den Kanten („a = 4 cm").
 * Ohne Beschriftung ist es ein Körper zum Zählen, und gezeichnet wird er in Normmaßen.
 */
export const SolidFigure = z.object({
  type: z.literal('solid'),
  solid: SolidKind,
  dims: z.array(SolidDim).max(3),
  unit: LengthUnit,
  labeled: z.boolean(),
});
export type SolidFigure = z.infer<typeof SolidFigure>;

/** Ein Feld des Rasters, auf dem ein Netz liegt: Spalte und Zeile 0–4. */
export const NET_GRID = 5;
export const NetCell = z.object({
  col: z
    .number()
    .int()
    .min(0)
    .max(NET_GRID - 1),
  row: z
    .number()
    .int()
    .min(0)
    .max(NET_GRID - 1),
});
export type NetCell = z.infer<typeof NetCell>;

/** Sechs Quadrate auf einem Raster — ob sie sich zu einem Würfel falten, ist die Frage. */
export const CubeNetFigure = z.object({
  type: z.literal('cube_net'),
  cells: z.array(NetCell).length(6),
});
export type CubeNetFigure = z.infer<typeof CubeNetFigure>;

/** Die längste Achse im Raum: 1 … 5 Einheiten, mehr wird auf 360 pt zu eng zum Ablesen. */
export const SPACE_MAX = 5;
const Coord = z.number().int().min(0).max(SPACE_MAX);
export const Point3 = z.object({ x: Coord, y: Coord, z: Coord });
export type Point3 = z.infer<typeof Point3>;

/**
 * Ein räumliches Koordinatensystem als Schrägbild. Ein Punkt ist eindeutig ablesbar, weil Code
 * seinen „Koordinatenweg" gestrichelt dazuzeichnet (erst entlang x, dann y, dann z) — ohne ihn
 * gehören zu einem gezeichneten Punkt unendlich viele Punkte im Raum.
 */
export const Axes3dFigure = z.object({
  type: z.literal('axes3d'),
  size: z.number().int().min(2).max(SPACE_MAX),
  points: z
    .array(z.object({ name: z.string().regex(/^[A-Z]$/), at: Point3 }))
    .min(1)
    .max(2),
  /** Ein Pfeil vom ersten zum zweiten Punkt. */
  arrow: z.boolean(),
});
export type Axes3dFigure = z.infer<typeof Axes3dFigure>;

// ─────────────── was das Modell sagen darf ───────────────

/** Der Teil der Aufgabe, nach dem gefragt wird. */
export const SolidAsk = z.enum(['vertices', 'edges', 'faces', 'volume', 'surface']);
export type SolidAsk = z.infer<typeof SolidAsk>;

/**
 * Eine der sieben geprüften Aufgaben. Der Server schreibt daraus die Frage, zeichnet die Figur
 * und rechnet die Lösung (`practice/visual.ts`) — für nichts davon gibt es hier ein Feld.
 */
export const VisualTask = z.discriminatedUnion('task', [
  z
    .object({
      task: z.literal('clock'),
      hour: z.number().int().min(1).max(12),
      minute: z.number().int().min(0).max(59),
    })
    .describe('A clock with hands to read. To have one SET, write a figure_tap clock instead.'),
  z
    .object({
      task: z.literal('money'),
      pieces: z
        .array(Denomination)
        .min(1)
        .max(MONEY_PIECES_MAX)
        .describe('in cent: 1 2 5 10 20 50 100 200 500 1000 2000 5000'),
      total: z.number().positive().describe('your sum of pieces in euros, checked'),
      set: z
        .boolean()
        .describe(
          'false: count the drawn pieces; true: lay the total from coins (pieces = one way, not shown)',
        ),
    })
    .describe('Euro coins and small notes.'),
  z
    .object({
      task: z.literal('quantity'),
      look: z.enum(['twenty_field', 'hundred_field', 'blocks', 'chart']),
      number: z.number().int().min(1).max(9999),
    })
    .describe(
      'A number shown as dots in a 20 or 100 field (up to 20/100), base-ten blocks (up to 999) or counters in a place-value chart (up to 9999); the learner names it.',
    ),
  z
    .object({
      task: z.literal('solid'),
      solid: SolidKind,
      ask: SolidAsk,
      dims: z
        .array(SolidDim)
        .max(3)
        .describe(
          'volume/surface: cube a; cuboid a b h; prism/pyramid a h; cylinder/cone r h; sphere r. Empty for counting.',
        ),
      unit: LengthUnit,
      claim: z.number().min(0).describe('your answer, checked'),
    })
    .describe(
      'A solid drawn obliquely. vertices/edges/faces only for cube, cuboid, prism, pyramid.',
    ),
  z
    .object({
      task: z.literal('cube_net'),
      cells: z.array(NetCell).length(6).describe('6 edge-connected squares on a 5x5 grid'),
      is_net: z.boolean().describe('your answer, checked by folding'),
    })
    .describe('Is this a cube net?'),
  z
    .object({ task: z.literal('point3d'), p: Point3 })
    .describe('Read the coordinates of a point in 3D (0 to 5).'),
  z
    .object({ task: z.literal('vector3d'), a: Point3, b: Point3 })
    .describe('Read the vector from A to B in 3D.'),
]);
export type VisualTask = z.infer<typeof VisualTask>;
export type VisualTaskName = VisualTask['task'];

// ─────────────── die Fläche (was sie ANTIPPT) ───────────────
//
// Eine Uhr STELLT sie mit `figure_tap` (issue #248, `contracts/figureTask.ts`): ein Mechanismus
// für das Antippen in einer Figur, kein zweiter. Hier bleibt nur das Legen von Münzen — viele
// Tipps, deren Summe zählt, und das ist keine Stelle in einer Figur.

/** Die Stücke, die sie zum Legen bekommt (alle Münzen, Scheine nur, wenn der Betrag ≥ 5 € ist). */
export const CoinSurface = z.object({
  mode: z.literal('coins'),
  offer: z.array(Denomination).min(1).max(DENOMINATIONS.length),
});
export type CoinSurface = z.infer<typeof CoinSurface>;
