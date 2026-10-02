// Anschauung als Figur (issues #254, #255): a clock, euro money, a 20/100 dot field, base-ten
// blocks or a place-value chart, a solid drawn obliquely, a cube net, a point or a vector in 3D.
// docs/architecture.md §Practice ("Figures code draws from a task").
//
// The model picks a `VisualTask` (contracts/visual.ts) and nothing else. This file checks the
// task, writes the question, draws the figure and COMPUTES the key — the same construction as
// the note line (`staff.ts`, issue #226), because here too the key is read off the drawing.
// Where the model also stated what it expects (`total`, `claim`, `is_net`), that is recomputed
// and a disagreement costs the question; nothing is repaired (#224, "Regel 0").
//
// Answers are checked by code where the answer is a value: a time on the dial (7:30 = 19:30 =
// "halb acht"), an amount (3,45 € = 345 ct), the sum of laid coins, three coordinates. Counting
// and measuring questions are `numeric` and go through the ordinary numeric rules; the cube net
// is a two-option choice.

import {
  DENOMINATIONS,
  MONEY_SET_MAX,
  NOTE_FROM,
  SOLID_DIMS,
  SPACE_MAX,
  VisualTask,
  baseSides,
  centsOf,
  isPolyhedron,
  parseCoins,
  type AnswerSurface,
  type Denomination,
  type Figure,
  type LengthUnit,
  type Point3,
  type SolidKind,
} from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';
import {
  amountMatches,
  clockKey,
  connected,
  fewestPieces,
  foldsToCube,
  parseClockAnswer,
  parseTriple,
  sameOnDial,
  solidCounts,
  solidMeasure,
  usesPi,
} from './visualMath.js';

/** At most this many picture questions per set: they are a way in, not the whole practice. */
export const MAX_VISUAL_ITEMS = 6;

/**
 * What the generator is told. It says what the model may CHOOSE and what it must not write —
 * there is no field for it, and this sentence is there so the model does not try (CLAUDE.md
 * rule 1). Categories, never a written-out example.
 */
export const VISUAL_RULES = `Pictures ("visuals"): a clock with hands, euro coins and notes, a 20 or 100 dot field, base-ten blocks or a place-value chart, a solid drawn obliquely, six squares that may be a cube net, a point or vector in a 3D coordinate system. You choose only the task and its data; the app writes the question, draws the picture and computes the solution, so never write a question text, an answer or a figure for one, and never put such a picture into "items". Where a field says "your answer, checked", give the result you expect: if it differs from what the app computes, the question is dropped. Use them where looking at or setting the picture IS the task — reading or setting the time, counting or laying money, naming a number shown as dots or bundles, counting vertices, edges or faces, volume or surface area from measures, whether six squares fold into a cube, reading coordinates in space. At most ${MAX_VISUAL_ITEMS}, and an empty list wherever a picture would only be decoration. The ordinary questions in "items" are unaffected.`;

/** An item whose every field was computed from `visual_task`; `insertItems` stores both. */
export type VisualItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
  visual_task: VisualTask;
};

// ─────────────── words ───────────────

type SuffixOf<T> = T extends `practice.visual.${infer S}` ? S : never;
type VisualMessage = SuffixOf<MessageKey>;

function text(
  locale: string,
  suffix: VisualMessage,
  vars: Record<string, string | number> = {},
): string {
  return t(locale, `practice.visual.${suffix}`, vars);
}

/** A decimal comma wherever the language writes one; at most `digits` places, none trailing. */
export function localNumber(locale: string, n: number, digits = 2): string {
  const fixed = Number(n.toFixed(digits));
  const plain = String(fixed);
  return locale.startsWith('en') ? plain : plain.replace('.', ',');
}

/** An amount as she reads it: "3,45 €" (or "€3.45" in English). */
export function euroWord(locale: string, cents: number): string {
  const euros = (cents / 100).toFixed(2);
  return locale.startsWith('en') ? `€${euros}` : `${euros.replace('.', ',')} €`;
}

/** One piece: "2 €", "20 ct", "5 €"-Schein. */
function pieceWord(locale: string, cents: number): string {
  return cents >= 100
    ? text(locale, 'euros', { n: cents / 100 })
    : text(locale, 'cents', { n: cents });
}

/** Some pieces in words, largest first: "2 € + 1 € + 20 ct". */
export function piecesWord(locale: string, pieces: readonly number[]): string {
  return [...pieces]
    .sort((a, b) => b - a)
    .map((p) => pieceWord(locale, p))
    .join(' + ');
}

function timeWord(locale: string, hour: number, minute: number): string {
  return text(locale, 'time', { time: clockKey({ hour, minute }) });
}

/** A point as the language writes it: "(2|3|1)" in German, "(2, 3, 1)" in English. */
export function tupleWord(locale: string, p: readonly number[]): string {
  return locale.startsWith('de')
    ? `(${p.join('|')})`
    : `(${p.join(locale.startsWith('en') ? ', ' : '; ')})`;
}

function solidWord(locale: string, solid: SolidKind): string {
  return text(locale, `solid.${solid}`);
}

function unitWord(unit: LengthUnit, power: 1 | 2 | 3): string {
  return power === 1 ? unit : `${unit}${power === 2 ? '²' : '³'}`;
}

const COMMON = {
  accepted_answers: [] as string[],
  unit: null,
  choices: null,
  correct_choice: null,
  prompt_lang: null,
  lang: null,
  tolerance: null,
  spelling: null,
  source_excerpt: null,
  // None of the state-dependent curriculum places is a clock, coins or a solid (issue #214),
  // none of this is a writing task (issue #211) or heard from a text (issue #210).
  curriculum_point: null,
  rubric: null,
  listen_task: null,
} as const;

// ─────────────── the checks on what the model chose ───────────────

/** Two measures that differ by more than this factor no longer draw as one readable solid. */
const ASPECT_MAX = 8;

/**
 * The task if every one of its parameters makes a question whose key can be computed and read
 * off its drawing — otherwise null, and there is no question. Each rejection costs the model a
 * question, never the learner a verdict.
 */
export function usableVisualTask(task: VisualTask): VisualTask | null {
  switch (task.task) {
    case 'clock':
      // Any minute can be read off 60 marks. Setting a clock is #248's `figure_tap`.
      return task;
    case 'money': {
      const cents = centsOf(task.pieces);
      // The model's own sum, in euros, must be whole cents and the sum of its pieces.
      if (Math.abs(task.total * 100 - Math.round(task.total * 100)) > 1e-6) return null;
      if (Math.round(task.total * 100) !== cents) return null;
      if (task.set && cents > MONEY_SET_MAX) return null;
      return task;
    }
    case 'quantity': {
      const max = { twenty_field: 20, hundred_field: 100, blocks: 999, chart: 9999 }[task.look];
      return task.number <= max ? task : null;
    }
    case 'solid': {
      const ask = task.ask;
      if (ask === 'vertices' || ask === 'edges' || ask === 'faces') {
        // Ecken, Kanten, Flächen of a cylinder, cone or sphere are counted differently from one
        // textbook to the next ("eine Spitze", "eine gekrümmte Fläche") — a key would be a claim.
        if (!isPolyhedron(task.solid) || task.dims.length > 0) return null;
        const counts = solidCounts(task.solid);
        return counts !== null && counts[ask] === task.claim ? task : null;
      }
      const need = SOLID_DIMS[task.solid];
      const names = task.dims.map((d) => d.name);
      if (names.length !== need.length || !need.every((n) => names.includes(n))) return null;
      const values = task.dims.map((d) => d.value);
      if (Math.max(...values) / Math.min(...values) > ASPECT_MAX) return null;
      const exact = solidMeasure(task.solid, ask, task.dims);
      // The model's own result, within half a percent (it may have used π = 3.14).
      return Math.abs(task.claim - exact) <= Math.max(0.05, exact * 0.005) ? task : null;
    }
    case 'cube_net':
      if (!connected(task.cells)) return null;
      return foldsToCube(task.cells) === task.is_net ? task : null;
    case 'point3d':
      return task.p.x + task.p.y + task.p.z === 0 || onDrawnAxis(task.p) ? null : task;
    case 'vector3d':
      if (onDrawnAxis(task.a) || onDrawnAxis(task.b)) return null;
      return task.a.x === task.b.x && task.a.y === task.b.y && task.a.z === task.b.z ? null : task;
  }
}

/**
 * Would this point be DRAWN onto an axis that is not its own? The school drawing puts x₁ at 45°,
 * half a unit across and half a unit down per unit (`Axes3d` in the app). So (2|3|1) lands
 * exactly on the x₂-axis — the step down of x₁ and the step up of x₃ cancel — and (2|1|0) on
 * the x₃-axis. The dashed path still says which point it is, but a dot sitting on an axis
 * invites the wrong reading, so such a point gets no question.
 */
export function onDrawnAxis(p: Point3): boolean {
  if (p.x === 0) return false;
  return p.z * 2 === p.x || p.y * 2 === p.x;
}

/** The task a stored row carries, or null (an unreadable column is no task, never a guess). */
export function visualTaskOf(stored: unknown): VisualTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = VisualTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The coins and notes she lays with: every coin, and the notes from 5 € on only if they fit. */
function offerFor(cents: number): Denomination[] {
  return DENOMINATIONS.filter((d) => d < NOTE_FROM || d <= cents);
}

/**
 * What she touches: the coins to lay — null for every other picture. (A clock she SETS is a
 * `figure_tap` question of #248, one mechanism for tapping in a figure, not a surface here.)
 */
export function visualSurfaceOf(task: VisualTask): AnswerSurface | null {
  if (task.task === 'money' && task.set) {
    return { mode: 'coins', offer: offerFor(centsOf(task.pieces)) };
  }
  return null;
}

// ─────────────── the question ───────────────

function digitsOf(n: number) {
  return {
    thousands: Math.floor(n / 1000) % 10,
    hundreds: Math.floor(n / 100) % 10,
    tens: Math.floor(n / 10) % 10,
    ones: n % 10,
  };
}

function axesSize(points: readonly Point3[]): number {
  const most = Math.max(...points.flatMap((p) => [p.x, p.y, p.z]));
  return Math.min(SPACE_MAX, Math.max(3, most));
}

/**
 * The question a checked task becomes, or null. Null is the worst that can happen — no set of
 * parameters can produce a key that disagrees with its own drawing.
 */
export function visualItem(raw: VisualTask, locale: string): VisualItem | null {
  const task = usableVisualTask(raw);
  if (task === null) return null;
  const common = { ...COMMON, visual_task: task };
  switch (task.task) {
    case 'clock': {
      const time = { hour: task.hour, minute: task.minute };
      const key = clockKey(time);
      const quarter = task.minute % 15 === 0;
      return {
        ...common,
        kind: 'short',
        prompt: text(locale, 'clock_read_prompt'),
        answer: key,
        // The afternoon reading of the same dial (issue #254: 7:30 and 19:30 are the same
        // position of the hands, and the question never asks for the 24-hour count).
        accepted_answers: [clockKey({ hour: task.hour + 12, minute: task.minute })],
        topic: text(locale, 'topic_clock'),
        difficulty: task.minute === 0 ? 1 : quarter ? 2 : task.minute % 5 === 0 ? 3 : 4,
        figure: { type: 'clock', hour: task.hour, minute: task.minute },
        hints: [text(locale, 'hint_clock_hands'), text(locale, 'hint_clock_five')],
        worked_solution: text(locale, task.minute === 0 ? 'worked_clock_full' : 'worked_clock', {
          hour: task.hour,
          minute: task.minute,
          answer: timeWord(locale, task.hour, task.minute),
        }),
      };
    }
    case 'money': {
      const cents = centsOf(task.pieces);
      const amount = euroWord(locale, cents);
      if (task.set) {
        const way = fewestPieces(cents, offerFor(cents));
        return {
          ...common,
          kind: 'short',
          prompt: text(locale, 'money_set_prompt', { amount }),
          answer: amount,
          topic: text(locale, 'topic_money'),
          difficulty: way.length > 5 ? 3 : 2,
          figure: null,
          hints: [text(locale, 'hint_money_big'), text(locale, 'hint_money_hundred')],
          worked_solution: text(locale, 'worked_money_set', {
            amount,
            pieces: piecesWord(locale, way),
          }),
        };
      }
      return {
        ...common,
        kind: 'numeric',
        prompt: text(locale, 'money_count_prompt'),
        answer: (cents / 100).toFixed(2),
        unit: '€',
        topic: text(locale, 'topic_money'),
        difficulty: task.pieces.length > 6 ? 3 : 2,
        figure: { type: 'money', pieces: [...task.pieces].sort((a, b) => b - a) },
        hints: [text(locale, 'hint_money_big'), text(locale, 'hint_money_hundred')],
        worked_solution: text(locale, 'worked_money_count', {
          pieces: piecesWord(locale, task.pieces),
          amount,
        }),
      };
    }
    case 'quantity': {
      const field = task.look === 'twenty_field' || task.look === 'hundred_field';
      const d = digitsOf(task.number);
      const figure: Figure = field
        ? {
            type: 'dot_field',
            size: task.look === 'twenty_field' ? 20 : 100,
            filled: task.number,
          }
        : { type: 'base_ten', look: task.look === 'blocks' ? 'blocks' : 'chart', ...d };
      return {
        ...common,
        kind: 'numeric',
        prompt: text(locale, field ? 'quantity_field_prompt' : 'quantity_bundles_prompt'),
        answer: String(task.number),
        topic: text(locale, field ? 'topic_field' : 'topic_place_value'),
        difficulty: task.number <= 20 ? 1 : task.number <= 100 ? 2 : 3,
        figure,
        hints: field
          ? [text(locale, 'hint_field_five'), text(locale, 'hint_field_rows')]
          : [text(locale, 'hint_bundles_place'), text(locale, 'hint_bundles_zero')],
        worked_solution: field
          ? text(locale, 'worked_field', { answer: task.number })
          : text(locale, d.thousands > 0 ? 'worked_bundles_thousands' : 'worked_bundles', {
              thousands: d.thousands,
              hundreds: d.hundreds,
              tens: d.tens,
              ones: d.ones,
              answer: task.number,
            }),
      };
    }
    case 'solid':
      return solidItem(task, locale, common);
    case 'cube_net': {
      const yes = text(locale, 'net_yes');
      const no = text(locale, 'net_no');
      const isNet = foldsToCube(task.cells);
      return {
        ...common,
        kind: 'multiple_choice',
        prompt: text(locale, 'net_prompt'),
        choices: [yes, no],
        correct_choice: isNet ? 0 : 1,
        answer: isNet ? yes : no,
        topic: text(locale, 'topic_net'),
        difficulty: 3,
        figure: { type: 'cube_net', cells: task.cells },
        hints: [text(locale, 'hint_net_base'), text(locale, 'hint_net_fold')],
        worked_solution: text(locale, isNet ? 'worked_net_yes' : 'worked_net_no'),
      };
    }
    case 'point3d': {
      const answer = tupleWord(locale, [task.p.x, task.p.y, task.p.z]);
      return {
        ...common,
        kind: 'short',
        prompt: text(locale, 'point_prompt'),
        answer,
        topic: text(locale, 'topic_space'),
        difficulty: 3,
        figure: {
          type: 'axes3d',
          size: axesSize([task.p]),
          points: [{ name: 'P', at: task.p }],
          arrow: false,
        },
        hints: [text(locale, 'hint_point_path'), text(locale, 'hint_point_order')],
        worked_solution: text(locale, 'worked_point', {
          x: task.p.x,
          y: task.p.y,
          z: task.p.z,
          answer,
        }),
      };
    }
    case 'vector3d': {
      const v = [task.b.x - task.a.x, task.b.y - task.a.y, task.b.z - task.a.z];
      const answer = tupleWord(locale, v);
      return {
        ...common,
        kind: 'short',
        prompt: text(locale, 'vector_prompt'),
        answer,
        topic: text(locale, 'topic_space'),
        difficulty: 4,
        figure: {
          type: 'axes3d',
          size: axesSize([task.a, task.b]),
          points: [
            { name: 'A', at: task.a },
            { name: 'B', at: task.b },
          ],
          arrow: true,
        },
        hints: [text(locale, 'hint_point_path'), text(locale, 'hint_vector_minus')],
        worked_solution: text(locale, 'worked_vector', {
          a: tupleWord(locale, [task.a.x, task.a.y, task.a.z]),
          b: tupleWord(locale, [task.b.x, task.b.y, task.b.z]),
          answer,
        }),
      };
    }
  }
}

type SolidTask = Extract<VisualTask, { task: 'solid' }>;

function solidItem(
  task: SolidTask,
  locale: string,
  common: typeof COMMON & { visual_task: VisualTask },
): VisualItem | null {
  const name = solidWord(locale, task.solid);
  const ask = task.ask;
  if (ask === 'vertices' || ask === 'edges' || ask === 'faces') {
    const counts = solidCounts(task.solid);
    if (counts === null) return null;
    const n = baseSides(task.solid) ?? 4;
    const pyramid = task.solid.startsWith('pyramid');
    return {
      ...common,
      kind: 'numeric',
      prompt: text(locale, `count_${ask}_prompt`, { solid: name }),
      answer: String(counts[ask]),
      topic: text(locale, 'topic_solids'),
      difficulty: task.solid === 'cube' || task.solid === 'cuboid' ? 1 : 2,
      figure: { type: 'solid', solid: task.solid, dims: [], unit: task.unit, labeled: false },
      hints: [text(locale, `hint_count_${ask}`), text(locale, 'hint_count_hidden')],
      worked_solution: text(locale, `worked_${pyramid ? 'pyramid' : 'prism'}_${ask}`, {
        solid: name,
        n,
        answer: counts[ask],
      }),
    };
  }
  const exact = solidMeasure(task.solid, ask, task.dims);
  const power = ask === 'volume' ? 3 : 2;
  const unit = unitWord(task.unit, power);
  // Whole cents of a unit are a key as they stand; anything else is rounded to one decimal, the
  // question says so, and ±0.05 is what "rounded to one decimal" means (D-1).
  const whole = Math.abs(exact * 100 - Math.round(exact * 100)) < 1e-6;
  const key = whole ? Number(exact.toFixed(2)) : Number(exact.toFixed(1));
  // Computed with π = 3.14, as many textbooks do: the same question, the same reasoning.
  const textbook = usesPi(task.solid)
    ? Number(solidMeasure(task.solid, ask, task.dims, 3.14).toFixed(1))
    : null;
  const dimsWord = SOLID_DIMS[task.solid]
    .map((n) => {
      const value = task.dims.find((d) => d.name === n)?.value ?? 0;
      return `${n} = ${localNumber(locale, value)} ${task.unit}`;
    })
    .join(', ');
  return {
    ...common,
    kind: 'numeric',
    prompt:
      text(locale, `${ask}_prompt`, { solid: name, dims: dimsWord }) +
      (whole ? '' : ` ${text(locale, 'round_one')}`),
    answer: String(key),
    accepted_answers: textbook !== null && textbook !== key ? [String(textbook)] : [],
    unit,
    tolerance: whole ? null : 0.05,
    topic: text(locale, 'topic_solids'),
    difficulty: usesPi(task.solid) || task.solid.startsWith('pyramid') ? 4 : 3,
    figure: {
      type: 'solid',
      solid: task.solid,
      dims: task.dims,
      unit: task.unit,
      labeled: true,
    },
    hints: [
      text(locale, `hint_${ask}`, { solid: name }),
      text(locale, `formula_${ask}.${task.solid}`),
    ],
    worked_solution: text(locale, 'worked_measure', {
      formula: text(locale, `formula_${ask}.${task.solid}`),
      dims: dimsWord,
      answer: `${localNumber(locale, key, whole ? 2 : 1)} ${unit}`,
    }),
  };
}

/** The tasks of one prepared set, as questions; unusable parameters yield nothing. */
export function visualItems(tasks: readonly VisualTask[], locale: string): VisualItem[] {
  return tasks.slice(0, MAX_VISUAL_ITEMS).flatMap((task) => {
    const item = visualItem(task, locale);
    return item ? [item] : [];
  });
}

// ─────────────── her answer ───────────────

/**
 * Code's verdict on her answer to a picture question, or null when there is nothing code can say
 * (the answer is not a time, an amount, coins or three numbers at all; or the question is one the
 * ordinary rules check). Null is never "wrong": the answer then goes the usual way, to the rules
 * against `items.answer` and, where they cannot decide, to the tutor.
 */
export function checkVisual(
  task: VisualTask,
  answer: string,
  locale: string,
): 'correct' | 'incorrect' | null {
  switch (task.task) {
    case 'clock': {
      const said = parseClockAnswer(answer, locale);
      if (said === null) return null;
      return sameOnDial(said, { hour: task.hour, minute: task.minute }) ? 'correct' : 'incorrect';
    }
    case 'money': {
      const cents = centsOf(task.pieces);
      if (task.set) {
        const laid = parseCoins(answer);
        if (laid !== null) return centsOf(laid) === cents ? 'correct' : 'incorrect';
      }
      const typed = amountMatches(answer, cents);
      return typed === null ? null : typed ? 'correct' : 'incorrect';
    }
    case 'point3d':
    case 'vector3d': {
      const said = parseTriple(answer);
      if (said === null) return null;
      const want =
        task.task === 'point3d'
          ? [task.p.x, task.p.y, task.p.z]
          : [task.b.x - task.a.x, task.b.y - task.a.y, task.b.z - task.a.z];
      return said.every((v, i) => v === want[i]) ? 'correct' : 'incorrect';
    }
    default:
      return null;
  }
}

/** Her laid coins in words for the thread ("2 € + 1 € + 20 ct"), or null for anything else. */
export function writtenVisual(task: VisualTask, answer: string, locale: string): string | null {
  if (task.task !== 'money' || !task.set) return null;
  const laid = parseCoins(answer);
  return laid === null ? null : piecesWord(locale, laid);
}

/**
 * A wrong answer to a picture question gets a fixed, kind line from code — at every try, never a
 * model's. Not to save a call: the tutor does not SEE the clock, the coins or the solid (rule 5),
 * and a model writing about a picture it has not got produces exactly the confident wrong
 * sentence nobody could catch. Code knows where to look and says that. The third miss explains
 * the solution, as everywhere.
 */
export function visualAgain(locale: string, task: VisualTask): string {
  switch (task.task) {
    case 'clock':
      return text(locale, 'again_clock');
    case 'money':
      return text(locale, 'again_money');
    case 'quantity':
      return text(
        locale,
        task.look === 'twenty_field' || task.look === 'hundred_field'
          ? 'again_field'
          : 'again_bundles',
      );
    case 'solid':
      return text(
        locale,
        task.ask === 'volume' || task.ask === 'surface' ? 'again_measure' : 'again_count',
      );
    case 'cube_net':
      return text(locale, 'again_net');
    case 'point3d':
      return text(locale, 'again_point');
    case 'vector3d':
      return text(locale, 'again_vector');
  }
}
