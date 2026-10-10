// Vormachen for an explanation (issue #298, docs/architecture.md §Practice): the guided worked
// example of `workedSteps.ts` for text subjects. An explanation question („Erklär mal", #236, and
// the open part of a task in parts, #297) has no way of lines but 3–6 key points; they are its
// steps. Vormachen → Mitmachen → Selbermachen, the same pattern as in maths:
//
//   - „Tipp" (or „Zeig mir wie" in her own words, `stepOnRequest`) shows ONE point as a model
//     sentence — the first one still open — and asks for the open point after it with its prepared
//     follow-up. Prepared text, no model.
//   - She writes her own; the one answer path judges it against the key points (a point only with
//     a quote the server finds in her words, `rubric.ts`). No grade.
//   - Buddy leads on: the reply asks for the next missing point, and the next „Tipp" shows the next
//     point still open — past every point she explained herself.
//
// A point Buddy showed is Buddy's, not hers: the model is not asked about it, it never gets a ✓
// (it stands as „vorgemacht"), and it counts towards the explanation being complete. The last open
// point is never shown as a step — she always explains at least one herself, as a way's ladder
// never shows its result. Asked again at that end (after `HINTS_BEFORE_SOLUTION` hints), Buddy
// shows it and the question closes as shown, never as right — the end of every ladder.
//
// Nothing new is stored. Where the ladder stands is `session_items.prepared_hints_used`, read as
// "every point before this one is passed"; the points she explained are `session_items.explained`
// (0088). A step moves the ladder to just past the point it shows, and the points it skips on the
// way are hers — so a point before the ladder that she has not explained is exactly one Buddy
// showed. `explained` only grows, and a shown point is never asked about again, so this stays true.

import { t } from '../../i18n/index.js';
import { HINTS_BEFORE_SOLUTION, workedReply } from './ladder.js';
import { isExplanation, refOf, rubricOf } from './rubric.js';

/** One key point of an explanation question, as the ladder shows it. */
type KeyPoint = { ref: string; name: string; point: string; ask: string };

/** The key points of an explanation question in their order, or null for any other question. */
export function keyPointsOf(stored: unknown): KeyPoint[] | null {
  const rubric = rubricOf(stored);
  if (!rubric || rubric.elements.length === 0 || !isExplanation(rubric)) return null;
  return rubric.elements.flatMap((e, i) =>
    e.check.by === 'key_point'
      ? [{ ref: refOf(i), name: e.name, point: e.check.point, ask: e.missing }]
      : [],
  );
}

/** Where the ladder of an explanation stands. */
export type PointLadder = {
  /** The points Buddy showed (server refs): passed by the ladder and not explained by her. */
  shown: string[];
  /**
   * The next step — the first point still open, with the follow-up of the open point after it —
   * or null when fewer than two are open: the last one is hers.
   */
  next: { at: number; name: string; point: string; ask: string } | null;
  /** The ladder's end: no step left, and she has seen enough hints to be shown the last point. */
  done: boolean;
  /** The one point still open at the end, which the end shows; null while steps are left. */
  last: { name: string; point: string } | null;
};

/** The ladder over `points` once she explained `settled` and the ladder stands at `position`. */
export function pointLadder(
  points: readonly KeyPoint[],
  settled: readonly string[],
  position: number,
  hintsUsed: number,
): PointLadder {
  const placed = points.map((p, at) => ({ ...p, at }));
  const shown = placed.filter((p) => p.at < position && !settled.includes(p.ref));
  const open = placed.filter((p) => p.at >= position && !settled.includes(p.ref));
  const [first, after] = open;
  return {
    shown: shown.map((p) => p.ref),
    next:
      first && after
        ? { at: first.at, name: first.name, point: first.point, ask: after.ask }
        : null,
    done: !after && hintsUsed >= HINTS_BEFORE_SOLUTION,
    last: first && !after ? { name: first.name, point: first.point } : null,
  };
}

/** What a step says: the point as a model sentence, then her turn on the next one. */
export function pointStepText(locale: string, next: NonNullable<PointLadder['next']>): string {
  return t(locale, 'practice.explain.show', next);
}

/** What the ladder's end says: the last point, shown — the question then closes as shown. */
export function lastPointText(locale: string, last: NonNullable<PointLadder['last']>): string {
  return t(locale, 'practice.explain.show_last', last);
}

/**
 * What the end of the hint ladder shows: an explanation's last point (`ladder` from
 * `pointLadder`), any other question's worked solution.
 */
export function ladderEndReply(
  locale: string,
  item: Parameters<typeof workedReply>[1],
  ladder: PointLadder | null,
): string {
  return ladder?.last ? lastPointText(locale, ladder.last) : workedReply(locale, item);
}
