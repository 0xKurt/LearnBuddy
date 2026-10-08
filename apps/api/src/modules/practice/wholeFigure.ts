// The figures that ARE their question (docs/architecture.md §Practice): a chart (#245, #246), a
// clock, coins, a dot field, base-ten blocks (#254), a tree, a pedigree, an automaton (#256), a
// periodic table (#250), a solid, a cube net, a point in space (#255), a diagram (#247), a
// circuit, a logic net, Itten's colour wheel (#261), a stumme Karte (#251, #479) and a labelled
// picture (#252, #481).
// "Werte das Klimadiagramm aus", "Wie spät ist es?" or "Was gehört in Lücke A?" without its
// figure is no question, so a figure of this kind that does not hold costs the question — unlike
// a fraction picture or a number line, which is dropped alone (audit H-15). Each family keeps its
// own rules in @learnbuddy/shared-math; this file is the one place that asks them — except a
// map's and a picture's, which need the question they are asked with: `mapCheck.ts` and
// `schematicCheck.ts` ask them, here only whether they parse at all.

import {
  chartProblem,
  circuitProblem,
  colorWheelProblem,
  diagramProblem,
  isChart,
  isCircuit,
  isColorWheel,
  isDiagram,
  isLogic,
  isMap,
  logicProblem,
  isPeriodicTable,
  isPrimary,
  isSchematic,
  isSpaceFigure,
  isTreeFigure,
  periodicProblem,
  primaryProblem,
  spaceProblem,
  treeProblem,
} from '@learnbuddy/shared-math';
import { ModelFigure } from '@learnbuddy/shared-types/contracts';

const WHOLE = [
  isChart,
  isPrimary,
  isTreeFigure,
  isPeriodicTable,
  isSpaceFigure,
  isDiagram,
  isCircuit,
  isLogic,
  isColorWheel,
  isMap,
  isSchematic,
];

/** The first rule a figure of this kind breaks; null when it holds or is of another kind. */
export function wholeFigureProblem(f: ModelFigure): string | null {
  if (isChart(f)) return chartProblem(f);
  if (isPrimary(f)) return primaryProblem(f);
  if (isTreeFigure(f)) return treeProblem(f);
  if (isPeriodicTable(f)) return periodicProblem(f);
  if (isSpaceFigure(f)) return spaceProblem(f);
  if (isDiagram(f)) return diagramProblem(f);
  if (isCircuit(f)) return circuitProblem(f);
  if (isLogic(f)) return logicProblem(f);
  if (isColorWheel(f)) return colorWheelProblem(f);
  return null;
}

/**
 * Whether a raw figure is one of these that may not be shown: its shape does not parse (a coin
 * of 3 ct, an arrow to box 9) or it breaks a rule of its own. Read before the item is parsed,
 * because the item's parse catches a broken figure to null and would hide it (`clipDraft`).
 */
export function figureIsRejected(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== 'string' || !WHOLE.some((is) => is({ type }))) return false;
  const parsed = ModelFigure.safeParse(raw);
  return !parsed.success || wholeFigureProblem(parsed.data) !== null;
}
