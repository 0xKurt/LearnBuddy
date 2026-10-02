// Antippen in einer Figur (issue #248): a point in a coordinate plane, a place on a number line,
// a bar of a chart, a time on a clock face. docs/architecture.md §Practice ("Interactive figures").
//
// Regel 0 of #224, both directions, all code:
//   1. What the MODEL wrote: the figure is drawable on a phone (caps in contracts/figureTask.ts),
//      and the key lies ON a place she can tap — a grid point, a snap mark, a bar, a clock step.
//      A key between two places could never be tapped; such a task is not stored.
//   2. What SHE taps is compared with the key exactly. A tap is snapped by the app, so the only
//      slack is the floating-point one (`GRID_EPSILON` in shared-math/grid.ts); an answer that
//      is not on the figure's grid at all is no answer (422), never a near miss.
//
// The model writes numbers, names and the key's VALUE; code gives the ids (bars `a`, `b` … in
// the model's order — the order a chart has, which says nothing about the key).

import {
  CLOCK_SNAPS,
  gridIndex,
  isMultiple,
  onGrid,
  onPlane,
  samePoint,
  sameValue,
  stepsBetween,
} from '@learnbuddy/shared-math';
import {
  BAR_LABEL_MAX,
  FigureTapTask,
  LINE_PLACES_MAX,
  MARK_LABEL_MAX,
  PLANE_STEPS_MAX,
  PLANE_STEPS_MIN,
  TAP_BARS_MAX,
  TAP_BARS_MIN,
  TAP_MARKS_MAX,
  type FigureTapAnswer,
  type FigureTapTaskView,
  type PlaneGrid,
  type TapFigure,
  type TapValue,
  elementOf,
  inTable,
  pinOrder,
  SCHEMATICS,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { circuitProblem } from './circuit.js';
import { colorName, elementName, partNames } from './libraryNames.js';

/** Why a figure task is not stored. Each one is a test (`__tests__/figureTap.test.ts`). */
export type FigureProblem =
  /** No figure, or more than one: which one is meant is a guess. */
  | 'figure_form'
  /** A grid that is no grid: max ≤ min, a span that is not whole steps, too few or too many. */
  | 'grid'
  /** The key, or a shown mark, lies between the places she can tap. */
  | 'off_grid'
  /** The key is the only point the figure shows: the picture gives the answer away. */
  | 'given_away'
  /** Two bars with the same name, or the key names no bar or two. */
  | 'bar_key'
  /** "The highest bar" — but the key's bar is not the one, alone, highest (or lowest). */
  | 'not_extreme'
  /** A text over its cap (a bar's name, a point's name): it would not fit the figure. */
  | 'figure_text'
  /** Library figures (#250, #252, #261): the key names no element, pin, field or lamp of the figure. */
  | 'library_key';

/**
 * What the generator and the photo reading are told about tap tasks. Exact, minimal and without
 * an example sentence (models copy examples; repo convention).
 */
export const FIGURE_TAP_RULES = `Tap tasks ("structured", type "figure_tap"): only when the answer is ONE place in a figure that the learner taps — a point in a coordinate system, a number on a number line, the bar of a bar chart, a time on a clock face. Fill exactly one of plane, number_line, bars and clock, the others null. plane: the axes from x_min to x_max and y_min to y_max in steps of step (${PLANE_STEPS_MIN}–${PLANE_STEPS_MAX} steps per axis, every bound a multiple of step), marks: up to ${TAP_MARKS_MAX} points already drawn {x, y, label} (label up to ${MARK_LABEL_MAX} characters or null), key: the point to tap {x, y}, a grid point. number_line: min, max, step between numbered ticks (${PLANE_STEPS_MIN}–${PLANE_STEPS_MAX} ticks), snap: step or an even part of it (step/2, step/4, step/5, step/10) — where a tap can land —, marks: up to ${TAP_MARKS_MAX} marked numbers {value, label}, key: the number to tap, a multiple of snap from min. bars: ${TAP_BARS_MIN}–${TAP_BARS_MAX} bars {label, value} (label up to ${BAR_LABEL_MAX} characters, no two alike), unit or null, key: the label of the bar to tap, extreme: "max" or "min" when the task asks for the highest or lowest bar, else null. clock: snap 5, 15 or 30 (the minutes a hand can stand on), key {h, m}: hour 1–12 and minute, a multiple of snap. prompt: what to tap; when the key is a point or number, the prompt names it (it is not drawn); when it is one of several drawn marks or bars, the prompt says which by its property. If the place could be two, write no tap task.`;

const Num = z.number().finite();
/** Parsed generously: a name over its cap is not a broken draft but one that does not fit. */
const Label = z.string().trim().min(1).max(40);

/** The model's tap task: one of four figures, each with its key as a VALUE. */
export const FigureTapDraftBase = z.object({
  type: z.literal('figure_tap'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe('What to tap; names the point or number to find, never draws it'),
  plane: z
    .object({
      x_min: Num,
      x_max: Num,
      y_min: Num,
      y_max: Num,
      step: Num,
      marks: z
        .array(z.object({ x: Num, y: Num, label: Label.nullable() }))
        .max(TAP_MARKS_MAX * 2)
        .default([]),
      key: z.object({ x: Num, y: Num }),
    })
    .nullable()
    .default(null)
    .describe('A coordinate system; null unless a point is tapped'),
  number_line: z
    .object({
      min: Num,
      max: Num,
      step: Num,
      snap: Num,
      marks: z
        .array(z.object({ value: Num, label: Label.nullable() }))
        .max(TAP_MARKS_MAX * 2)
        .default([]),
      key: Num,
    })
    .nullable()
    .default(null)
    .describe('A number line; null unless a number is tapped'),
  bars: z
    .object({
      bars: z.array(z.object({ label: Label, value: Num })).max(TAP_BARS_MAX * 2),
      unit: z.string().trim().max(12).nullable().default(null),
      key: Label,
      extreme: z.enum(['max', 'min']).nullable().default(null),
    })
    .nullable()
    .default(null)
    .describe('A bar chart; null unless a bar is tapped'),
  clock: z
    .object({
      snap: Num,
      key: z.object({ h: Num, m: Num }),
    })
    .nullable()
    .default(null)
    .describe('A clock face; null unless a time is set'),
});
export type FigureTapDraft = z.infer<typeof FigureTapDraftBase>;

// ─────────────── Regel 0: what the model wrote ───────────────

/** Is the grid drawable on a phone, with grid lines at the multiples of its step? */
export function planeProblem(g: PlaneGrid): FigureProblem | null {
  const nx = stepsBetween(g.x_min, g.x_max, g.step);
  const ny = stepsBetween(g.y_min, g.y_max, g.step);
  if (nx === null || ny === null) return 'grid';
  if (Math.min(nx, ny) < PLANE_STEPS_MIN || Math.max(nx, ny) > PLANE_STEPS_MAX) return 'grid';
  // Grid lines at the multiples of the step, so 0 is one of them and the numbers are round.
  if (!isMultiple(g.x_min, g.step) || !isMultiple(g.y_min, g.step)) return 'grid';
  return null;
}

/** What is wrong with a tap task, or null when it holds together. */
export function figureTapProblem(task: FigureTapTask): FigureProblem | null {
  const { figure, key } = task;
  if (figure.kind !== key.kind) return 'figure_form';
  switch (figure.kind) {
    case 'plane': {
      if (key.kind !== 'plane') return 'figure_form';
      const bad = planeProblem(figure.grid);
      if (bad) return bad;
      if (!onPlane(key, figure.grid)) return 'off_grid';
      if (!figure.marks.every((m) => onPlane(m, figure.grid))) return 'off_grid';
      const at = figure.marks.filter((m) => samePoint(m, key, figure.grid.step));
      // The key drawn as the only mark: the question would show its own answer.
      if (at.length > 0 && figure.marks.length < 2) return 'given_away';
      return null;
    }
    case 'number_line': {
      if (key.kind !== 'number_line') return 'figure_form';
      const ticks = stepsBetween(figure.min, figure.max, figure.step);
      if (ticks === null || ticks < PLANE_STEPS_MIN || ticks > PLANE_STEPS_MAX) return 'grid';
      const parts = figure.step / figure.snap;
      if (![1, 2, 4, 5, 10].some((p) => Math.abs(parts - p) <= 1e-9 * p)) return 'grid';
      if (ticks * Math.round(parts) > LINE_PLACES_MAX) return 'grid';
      if (!onGrid(key.value, figure.min, figure.max, figure.snap)) return 'off_grid';
      if (!figure.marks.every((m) => onGrid(m.value, figure.min, figure.max, figure.snap)))
        return 'off_grid';
      const at = figure.marks.filter((m) => sameValue(m.value, key.value, figure.snap));
      if (at.length > 0 && figure.marks.length < 2) return 'given_away';
      return null;
    }
    case 'bars': {
      if (key.kind !== 'bars') return 'figure_form';
      const n = figure.bars.length;
      if (n < TAP_BARS_MIN || n > TAP_BARS_MAX) return 'grid';
      if (figure.bars.some((b) => b.label.length > BAR_LABEL_MAX)) return 'figure_text';
      const names = new Set(figure.bars.map((b) => b.label.toLocaleLowerCase('de')));
      if (names.size !== n) return 'bar_key';
      if (new Set(figure.bars.map((b) => b.id)).size !== n) return 'bar_key';
      if (!figure.bars.some((b) => b.id === key.id)) return 'bar_key';
      return null;
    }
    case 'clock': {
      if (key.kind !== 'clock') return 'figure_form';
      if (key.m % figure.snap !== 0) return 'off_grid';
      return null;
    }
    case 'periodic': {
      if (key.kind !== 'periodic') return 'figure_form';
      const e = elementOf(key.id);
      return e && inTable(figure.table, e) ? null : 'library_key';
    }
    case 'schematic': {
      if (key.kind !== 'schematic') return 'figure_form';
      const known = SCHEMATICS[figure.drawing].parts;
      if (figure.parts.some((p) => !(p in known))) return 'library_key';
      // The pins stand in pin order, so their numbers and their places agree (schematics.ts).
      const order = pinOrder(figure.drawing, figure.parts);
      if (order.length !== figure.parts.length || order.some((p, i) => p !== figure.parts[i]))
        return 'figure_form';
      return figure.parts.includes(key.id) ? null : 'library_key';
    }
    case 'color_wheel':
      return key.kind === 'color_wheel' ? null : 'figure_form';
    case 'circuit': {
      if (key.kind !== 'circuit') return 'figure_form';
      if (circuitProblem(figure.circuit) !== null) return 'grid';
      const lamp = figure.circuit.blocks
        .flatMap((b) => b.branches.flat())
        .find((p) => p.id === key.id);
      return lamp?.part === 'lamp' ? null : 'library_key';
    }
  }
}

/** Ids by position: a, b, c … in the order the chart has (never by value). */
function barId(i: number): string {
  return String.fromCharCode(97 + i);
}

/**
 * The stored task for the model's draft, or a reason why there is none. Exported for the tests,
 * which reach every rejection through it.
 */
export function figureTapTaskFrom(
  draft: Pick<FigureTapDraft, 'plane' | 'number_line' | 'bars' | 'clock'>,
): FigureTapTask | FigureProblem {
  const given = [draft.plane, draft.number_line, draft.bars, draft.clock].filter((x) => x !== null);
  if (given.length !== 1) return 'figure_form';
  let task: FigureTapTask;
  if (draft.plane) {
    const p = draft.plane;
    if (p.marks.length > TAP_MARKS_MAX) return 'grid';
    if (p.marks.some((m) => (m.label?.length ?? 0) > MARK_LABEL_MAX)) return 'figure_text';
    task = {
      type: 'figure_tap',
      figure: {
        kind: 'plane',
        grid: {
          x_min: p.x_min,
          x_max: p.x_max,
          y_min: p.y_min,
          y_max: p.y_max,
          step: p.step,
          axes: true,
        },
        marks: p.marks,
      },
      key: { kind: 'plane', x: p.key.x, y: p.key.y },
    };
  } else if (draft.number_line) {
    const l = draft.number_line;
    if (l.marks.length > TAP_MARKS_MAX) return 'grid';
    if (l.marks.some((m) => (m.label?.length ?? 0) > MARK_LABEL_MAX)) return 'figure_text';
    if (!(l.step > 0) || !(l.snap > 0)) return 'grid';
    task = {
      type: 'figure_tap',
      figure: {
        kind: 'number_line',
        min: l.min,
        max: l.max,
        step: l.step,
        snap: l.snap,
        marks: l.marks,
      },
      key: { kind: 'number_line', value: l.key },
    };
  } else if (draft.bars) {
    const b = draft.bars;
    if (b.bars.length < TAP_BARS_MIN || b.bars.length > TAP_BARS_MAX) return 'grid';
    if (b.bars.some((x) => x.label.length > BAR_LABEL_MAX)) return 'figure_text';
    const bars = b.bars.map((x, i) => ({ id: barId(i), label: x.label, value: x.value }));
    const named = bars.filter(
      (x) => x.label.toLocaleLowerCase('de') === b.key.toLocaleLowerCase('de'),
    );
    if (named.length !== 1) return 'bar_key';
    const keyBar = named[0]!;
    if (b.extreme !== null) {
      // "The highest" is checked, not believed: the key's bar alone has the extreme value.
      const values = bars.map((x) => x.value);
      const want = b.extreme === 'max' ? Math.max(...values) : Math.min(...values);
      if (keyBar.value !== want || values.filter((v) => v === want).length !== 1)
        return 'not_extreme';
    }
    task = {
      type: 'figure_tap',
      figure: { kind: 'bars', bars, unit: b.unit && b.unit.length > 0 ? b.unit : null },
      key: { kind: 'bars', id: keyBar.id },
    };
  } else {
    const c = draft.clock!;
    const snap = CLOCK_SNAPS.find((s) => s === c.snap);
    if (snap === undefined) return 'grid';
    const h = c.key.h === 0 ? 12 : c.key.h > 12 ? c.key.h - 12 : c.key.h;
    if (!Number.isInteger(h) || !Number.isInteger(c.key.m) || h < 1 || h > 12) return 'off_grid';
    if (c.key.m < 0 || c.key.m > 59) return 'off_grid';
    task = {
      type: 'figure_tap',
      figure: { kind: 'clock', snap },
      key: { kind: 'clock', h, m: c.key.m },
    };
  }
  const parsed = FigureTapTask.safeParse(task);
  if (!parsed.success) return 'grid';
  return figureTapProblem(parsed.data) ?? parsed.data;
}

// ─────────────── words ───────────────

/** A number as she reads it: decimal comma where usual, a real minus sign. */
export function numberWords(locale: string, n: number): string {
  const rounded = Math.round(n * 1e6) / 1e6;
  const plain = Object.is(rounded, -0) ? '0' : String(rounded);
  const local = locale === 'en' ? plain : plain.replace('.', ',');
  return local.replace('-', '−');
}

export function pointWords(locale: string, p: { x: number; y: number }): string {
  return t(locale, 'practice.figure.point', {
    x: numberWords(locale, p.x),
    y: numberWords(locale, p.y),
  });
}

function clockWords(h: number, m: number): string {
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** What a tap means in words: "(2 | −1)", "−1,5", "März", "3:15". */
export function tapWords(locale: string, figure: TapFigure, value: TapValue): string {
  switch (value.kind) {
    case 'plane':
      return pointWords(locale, value);
    case 'number_line':
      return numberWords(locale, value.value);
    case 'bars':
      return figure.kind === 'bars'
        ? (figure.bars.find((b) => b.id === value.id)?.label ?? '')
        : '';
    case 'clock':
      return clockWords(value.h, value.m);
    case 'periodic': {
      const e = elementOf(value.id);
      if (!e) return '';
      const name = elementName(locale, e);
      return name ? `${e.sym} (${name})` : e.sym;
    }
    case 'schematic':
      return figure.kind === 'schematic'
        ? (partNames(locale, figure.drawing, value.id)[0] ?? '')
        : '';
    case 'color_wheel':
      return colorName(locale, value.id) ?? '';
    case 'circuit':
      return value.id.toUpperCase();
  }
}

export function figureTapSolution(locale: string, task: FigureTapTask): string {
  return tapWords(locale, task.figure, task.key);
}

export function figureTapView(task: FigureTapTask): FigureTapTaskView {
  return { type: 'figure_tap', figure: task.figure };
}

// ─────────────── Regel 0: her tap ───────────────

/** How a wrong tap is off — what the reply can say without guessing. */
export type TapMiss =
  /** plane: x right, y not; y right, x not; both wrong; x and y swapped. */
  | 'x_right'
  | 'y_right'
  | 'swapped'
  | 'point'
  /** number line: too far left or right of the key. */
  | 'left'
  | 'right'
  /** bars: another bar. */
  | 'bar'
  /** clock: hour right, minutes not; minutes right, hour not; both wrong. */
  | 'hour_right'
  | 'minute_right'
  | 'time'
  /** periodic table: the right group (or period), another element; another element altogether. */
  | 'group_right'
  | 'period_right'
  | 'element'
  /** schematic: another part (the reply names the one she tapped). */
  | 'part'
  /** colour wheel: another field (named). */
  | 'color'
  /** circuit: another lamp. */
  | 'lamp';

export type FigureTapCheck = {
  type: 'figure_tap';
  correct: boolean;
  miss: TapMiss | null;
  /**
   * What she tapped, in words, where the reply names it ("Das ist die Vakuole."): only for
   * library figures, where each place is a named part. Naming the WRONG part is feedback, never
   * the key.
   */
  tapped?: { figure: TapFigure; value: TapValue };
};

/** Does her value stand on a place of this figure? Anything else was never a tap. */
function onFigure(figure: TapFigure, v: TapValue): boolean {
  switch (figure.kind) {
    case 'plane':
      return v.kind === 'plane' && onPlane(v, figure.grid);
    case 'number_line':
      return (
        v.kind === 'number_line' && gridIndex(v.value, figure.min, figure.max, figure.snap) !== null
      );
    case 'bars':
      return v.kind === 'bars' && figure.bars.some((b) => b.id === v.id);
    case 'clock':
      return v.kind === 'clock' && v.m % figure.snap === 0;
    case 'periodic': {
      if (v.kind !== 'periodic') return false;
      const e = elementOf(v.id);
      return e !== null && inTable(figure.table, e);
    }
    case 'schematic':
      return v.kind === 'schematic' && figure.parts.includes(v.id);
    case 'color_wheel':
      return v.kind === 'color_wheel';
    case 'circuit':
      return (
        v.kind === 'circuit' &&
        figure.circuit.blocks.some((b) =>
          b.branches.some((br) => br.some((p) => p.id === v.id && p.part === 'lamp')),
        )
      );
  }
}

/**
 * Her tap against the key, or null when it is no tap on this figure (another kind of figure, a
 * place between the grid points, a bar that is not there) — refused as invalid, never graded.
 */
export function checkFigureTap(
  task: FigureTapTask,
  answer: FigureTapAnswer,
): FigureTapCheck | null {
  const v = answer.value;
  const { figure, key } = task;
  if (!onFigure(figure, v)) return null;
  const done = (miss: TapMiss | null): FigureTapCheck => ({
    type: 'figure_tap',
    correct: miss === null,
    miss,
  });
  switch (key.kind) {
    case 'plane': {
      if (v.kind !== 'plane' || figure.kind !== 'plane') return null;
      const s = figure.grid.step;
      const xs = sameValue(v.x, key.x, s);
      const ys = sameValue(v.y, key.y, s);
      if (xs && ys) return done(null);
      if (sameValue(v.x, key.y, s) && sameValue(v.y, key.x, s)) return done('swapped');
      return done(xs ? 'x_right' : ys ? 'y_right' : 'point');
    }
    case 'number_line': {
      if (v.kind !== 'number_line' || figure.kind !== 'number_line') return null;
      if (sameValue(v.value, key.value, figure.snap)) return done(null);
      return done(v.value < key.value ? 'left' : 'right');
    }
    case 'bars':
      if (v.kind !== 'bars') return null;
      return done(v.id === key.id ? null : 'bar');
    case 'clock': {
      if (v.kind !== 'clock') return null;
      const hr = v.h === key.h;
      const mr = v.m === key.m;
      if (hr && mr) return done(null);
      return done(hr ? 'hour_right' : mr ? 'minute_right' : 'time');
    }
    case 'periodic': {
      if (v.kind !== 'periodic') return null;
      if (v.id === key.id) return done(null);
      const a = elementOf(v.id);
      const b = elementOf(key.id);
      const miss: TapMiss =
        a && b && a.group === b.group
          ? 'group_right'
          : a && b && a.period === b.period
            ? 'period_right'
            : 'element';
      return { ...done(miss), tapped: { figure, value: v } };
    }
    case 'schematic':
      if (v.kind !== 'schematic') return null;
      return v.id === key.id ? done(null) : { ...done('part'), tapped: { figure, value: v } };
    case 'color_wheel':
      if (v.kind !== 'color_wheel') return null;
      return v.id === key.id ? done(null) : { ...done('color'), tapped: { figure, value: v } };
    case 'circuit':
      if (v.kind !== 'circuit') return null;
      return done(v.id === key.id ? null : 'lamp');
  }
}

/**
 * The reply to a wrong tap. What is already right is said every time (that is feedback); WHERE
 * on a number line the place lies is said from the second miss on — it is the next rung of the
 * hint ladder and counts as help (`figureTapNamesPart`).
 */
export function figureTapReply(locale: string, check: FigureTapCheck, priorMisses: number): string {
  switch (check.miss) {
    case null:
      return t(locale, 'practice.correct');
    case 'x_right':
      return t(locale, 'practice.figure.x_right');
    case 'y_right':
      return t(locale, 'practice.figure.y_right');
    case 'swapped':
      return t(locale, 'practice.figure.swapped');
    case 'point':
      return t(locale, 'practice.figure.point_wrong');
    case 'left':
    case 'right':
      return priorMisses >= 1
        ? t(
            locale,
            check.miss === 'left'
              ? 'practice.figure.further_right'
              : 'practice.figure.further_left',
          )
        : t(locale, 'practice.figure.place_wrong');
    case 'bar':
      return t(locale, 'practice.figure.bar_wrong');
    case 'hour_right':
      return t(locale, 'practice.figure.hour_right');
    case 'minute_right':
      return t(locale, 'practice.figure.minute_right');
    case 'time':
      return t(locale, 'practice.figure.time_wrong');
    case 'group_right':
      return t(locale, 'practice.figure.group_right', { tapped: tappedWords(locale, check) });
    case 'period_right':
      return t(locale, 'practice.figure.period_right', { tapped: tappedWords(locale, check) });
    case 'element':
      return t(locale, 'practice.figure.element_wrong', { tapped: tappedWords(locale, check) });
    case 'part':
      return t(locale, 'practice.figure.part_wrong', { tapped: tappedWords(locale, check) });
    case 'color':
      return t(locale, 'practice.figure.color_wrong', { tapped: tappedWords(locale, check) });
    case 'lamp':
      return t(locale, 'practice.figure.lamp_wrong');
  }
}

function tappedWords(locale: string, check: FigureTapCheck): string {
  return check.tapped ? tapWords(locale, check.tapped.figure, check.tapped.value) : '';
}

export function figureTapNamesPart(check: FigureTapCheck, priorMisses: number): boolean {
  return (check.miss === 'left' || check.miss === 'right') && priorMisses >= 1;
}
