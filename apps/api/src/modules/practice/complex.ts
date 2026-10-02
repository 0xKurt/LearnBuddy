// Zusammengesetzte Aufgaben wie in Klasse 8–10 (issue #297): Material plus Teilaufgaben a) b) c),
// die aufeinander aufbauen. docs/architecture.md §Practice ("Tasks with several parts").
//
// Die Teilaufgaben sind GEWÖHNLICHE Fragen einer vorhandenen Art, und jede wird von dem Prüfer
// beurteilt, der diese Art immer beurteilt: `usableItems` (Form, Schlüssel gegen die eigene
// Rechnung, Auswahl, Rubrik) beim Speichern, `ruleCheck` (Zahl, Term, Rechenweg, Gleichung …) und
// der Tutor mit Kernpunkten beim Antworten. Hier steht keine zweite Prüflogik (#296), nur das, was
// die Teile VERBINDET — und das in beide Richtungen von Regel 0 (#224):
//
//   · ERZEUGUNG. Eine Zahl-Teilaufgabe trägt ihre Rechnung (`calc`): einen Term über die Größen
//     des Materials (`givens`) und `[a]`, `[b]` … für frühere Ergebnisse. Code rechnet sie mit den
//     Werten des Materials und den Schlüsseln der früheren Teile nach; kommt ihr Schlüssel nicht
//     heraus, entsteht KEINE der Teilaufgaben. Ebenso, wenn eine Größe nicht im Material steht,
//     eine Abhängigkeit ins Leere zeigt (ein Teil, den es nicht gibt, oder einer, der erst danach
//     kommt), eine Teilaufgabe eine Zeile nennt, die es nicht gibt, oder eine Teilaufgabe die
//     Prüfung ihrer eigenen Art nicht besteht. Alles oder nichts: eine Aufgabe, aus der b) fehlt,
//     hätte ein c), das auf etwas zeigt, das sie nie gesehen hat.
//   · ANTWORT (Folgefehler). Ist b) gegen den Schlüssel nicht richtig, rechnet Code die Rechnung
//     von b) mit IHREN Ergebnissen der früheren Teile noch einmal und prüft ihre Antwort mit
//     demselben `ruleCheck` gegen diesen Wert. Passt sie, ist b) richtig — mit dem Hinweis, dass
//     sie mit ihrem Wert aus a) richtig weitergerechnet hat. Kein Modell, in keinem Zweig.
//
// Das Modell schreibt keine Kennung (CLAUDE.md Regel 2): die Gruppe vergibt der Server, die
// Teilaufgaben heißen nach ihrer Position, und `[a]` in einer Rechnung ist ein Buchstabe des
// Blatts, den Code in eine Position übersetzt.

import { randomUUID } from 'node:crypto';

import {
  COMPLEX_GIVENS_MAX,
  COMPLEX_LABELS,
  COMPLEX_PARTS_MAX,
  COMPLEX_PARTS_MIN,
  ComplexTask,
  complexLabel,
  PASSAGE_CHARS_MAX,
  PASSAGE_LINE_MAX,
  PASSAGE_LINES_MAX,
  type ComplexGiven,
  type ComplexMaterial,
  type ComplexView,
  type Figure,
  type Rubric,
  RUBRIC_MAX,
  RUBRIC_MIN,
} from '@learnbuddy/shared-types/contracts';
import {
  evaluateExpression,
  parseCanonicalKey,
  parseExpression,
  parseNumericInput,
  type Expr,
} from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft, MAX_ACCEPTED, usableFigure, usableItems, type StoredItem } from './items.js';
import { refsExist } from './reading.js';
import { lastValue } from './steps.js';

/** How many tasks with several parts one run or one sheet's reading holds: each is minutes of work. */
export const MAX_COMPLEX_TASKS = 2;

/** The answer forms a part may have: the ones that exist, each with its own checker. */
export const COMPLEX_PART_KINDS = [
  'numeric',
  'formula',
  'short',
  'multiple_choice',
  'long',
] as const;

/**
 * What the generator and the photo reading are told. Principles and bans, never an example task:
 * models copy examples (standing owner rule).
 */
export const COMPLEX_RULES = `TASKS WITH SEVERAL PARTS ("complex"): a task as a class test asks it from grade 8 on — shared MATERIAL and ${COMPLEX_PARTS_MIN}–${COMPLEX_PARTS_MAX} PARTS a), b), c) … in order, later parts building on earlier ones. Material: lines = its text line by line (the situation, a source, measured values; from a photo exactly as printed, your own in lines of at most 36 characters), at most ${PASSAGE_LINES_MAX} lines; title = the heading or null; givens = EVERY quantity a part calculates with — name (the symbol, e.g. as in the text: letters, digits, _), value (a plain number), unit — and each value must stand in the material as a number. Parts: prompt = the instruction of that part with its operator (berechne, gib an, stelle auf, erkläre, begründe, beurteile …), never its letter and never the material again; kind = numeric (one number, unit in "unit"), formula (a term, an equation, a reaction equation), short, multiple_choice (choices, correct_choice) or long (an explanation, a reasoning, a judgement — points = the points a complete answer makes, as a teacher names them); uses = the letters of earlier parts it builds on. A numeric part ALWAYS has calc: the calculation that gives its answer, as a term over the givens' names and [a], [b] … for the result of an earlier part (+ - * / ^, sqrt(), parentheses); its answer is the value of calc, rounded only as the part says. Every other part has calc null. A part's answer follows from the material and the earlier parts alone. A part may name a line ("Z. 3") only if that line exists.`;

const Label = z.enum(COMPLEX_LABELS);

/** One part as the model writes it: the fields of an ordinary question, plus how it is connected. */
export const ComplexPartDraft = z.object({
  kind: z.enum(COMPLEX_PART_KINDS),
  prompt: z.string().trim().min(1).max(400),
  answer: ItemDraft.shape.answer,
  accepted_answers: z.array(z.string().trim().min(1).max(200)).max(MAX_ACCEPTED).default([]),
  unit: ItemDraft.shape.unit.default(null),
  choices: ItemDraft.shape.choices.default(null),
  correct_choice: ItemDraft.shape.correct_choice.default(null),
  tolerance: ItemDraft.shape.tolerance,
  uses: z
    .array(Label)
    .max(COMPLEX_PARTS_MAX - 1)
    .default([]),
  calc: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .default(null)
    .describe('numeric only: the calculation over the givens and [a], [b] …; else null'),
  hints: ItemDraft.shape.hints,
  // The key points of an open part (#258), as names only. Code turns them into the rubric every
  // free text has (#211, judged elements: the tutor must quote her text for each) — the same
  // checker, at a fifth of the schema the full rubric would cost every reading (#281).
  points: z
    .array(z.string().trim().min(1).max(40))
    .max(RUBRIC_MAX)
    .default([])
    .describe('long only: the 2–4 points a complete answer makes, 1–4 words each; else []'),
  difficulty: ItemDraft.shape.difficulty,
});
export type ComplexPartDraft = z.infer<typeof ComplexPartDraft>;

const Given = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,7}$/),
  value: z.number(),
  unit: z.string().trim().max(16).nullable().default(null),
});

/** One task as the model writes it (a sheet's reading leaves out the figure: `ComplexSheetDraft`). */
export const ComplexDraft = z.object({
  title: z.string().trim().min(1).max(80).nullable(),
  topic: z.string().trim().min(1).max(60).describe('2–4 words: what the task is about'),
  lang: z.string().regex(/^[a-z]{2}$/),
  lines: z
    .array(z.string().max(PASSAGE_LINE_MAX * 2))
    .max(PASSAGE_LINES_MAX * 2)
    .default([]),
  figure: ItemDraft.shape.figure,
  givens: z.array(Given).max(COMPLEX_GIVENS_MAX).default([]),
  parts: z.array(ComplexPartDraft).max(COMPLEX_PARTS_MAX),
});
export type ComplexDraft = z.infer<typeof ComplexDraft>;

/**
 * A task read from a photo. The figure is left out of what the reading is shown — its schema is
 * the largest union there is (#281: every nested union costs native tokens on every reading), and
 * what a sheet prints as a table or a function is transcribed into the lines.
 */
export const ComplexSheetDraft = ComplexDraft.omit({ figure: true });

/** How a draft is parsed: a part that does not fit costs the task (all or nothing, see above). */
export const ComplexDraftParse = ComplexDraft;

// ─────────────── the calculation ───────────────

const FUNCTION_NAMES = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'pi']);
/** The letters a calculation's names become for the parser: one each, never `e` (Euler). */
const SLOTS = 'ABCDFGHIJKLMNOPQRSTUVWXYZ';

/** Where a slot's value comes from. */
type Source = { from: 'given'; name: string } | { from: 'part'; part: number };

export type Calc = { tree: Expr; slots: ReadonlyMap<string, Source> };

/**
 * A calculation read: every name it uses is a given of the material or `[x]` for an earlier part,
 * and the rest is the school-maths grammar of `shared-math` (no eval). Null when it uses anything
 * else — a name nobody defined, a part that does not come before `part`, or syntax that does not
 * parse.
 */
export function readCalc(calc: string, givens: readonly ComplexGiven[], part: number): Calc | null {
  const slots = new Map<string, Source>();
  const byKey = new Map<string, string>();
  const names = new Set(givens.map((g) => g.name));
  let unknown = false;
  const slotFor = (key: string, source: Source): string | null => {
    const known = byKey.get(key);
    if (known) return known;
    const letter = SLOTS[slots.size];
    if (letter === undefined) return null;
    slots.set(letter, source);
    byKey.set(key, letter);
    return letter;
  };
  const src = calc.replace(
    /\[([a-z])\]|[A-Za-z][A-Za-z0-9_]*/g,
    (whole, ref: string | undefined) => {
      if (ref !== undefined) {
        const at = (COMPLEX_LABELS as readonly string[]).indexOf(ref);
        if (at < 0 || at >= part) {
          unknown = true;
          return whole;
        }
        const letter = slotFor(`[${ref}]`, { from: 'part', part: at });
        if (letter === null) unknown = true;
        return letter === null ? whole : ` ${letter} `;
      }
      // A given's name wins over a function name: a mass called `e` is a mass here.
      if (names.has(whole)) {
        const letter = slotFor(whole, { from: 'given', name: whole });
        if (letter === null) unknown = true;
        return letter === null ? whole : ` ${letter} `;
      }
      if (FUNCTION_NAMES.has(whole)) return whole;
      unknown = true;
      return whole;
    },
  );
  if (unknown) return null;
  const tree = parseExpression(src, 'letters');
  return tree ? { tree, slots } : null;
}

/** The value of a calculation, the parts' values given by position. NaN when one is missing. */
export function evaluateCalc(
  calc: Calc,
  givens: readonly ComplexGiven[],
  parts: ReadonlyMap<number, number>,
): number {
  const env: Record<string, number> = {};
  for (const [letter, source] of calc.slots) {
    const v =
      source.from === 'given'
        ? givens.find((g) => g.name === source.name)?.value
        : parts.get(source.part);
    if (v === undefined || !Number.isFinite(v)) return NaN;
    env[letter] = v;
  }
  return evaluateExpression(calc.tree, env);
}

/** The parts a calculation reads. */
function partsRead(calc: Calc): number[] {
  return [...calc.slots.values()].flatMap((s) => (s.from === 'part' ? [s.part] : []));
}

/** Decimals a key is written with ("12.35" → 2, "8" → 0); null for a fraction or no number. */
function decimalsOf(key: string): number | null {
  const k = parseCanonicalKey(key);
  if (k.value === null) return null;
  if (k.form === 'integer') return 0;
  if (k.form === 'decimal') return k.decimals;
  return null;
}

/**
 * Does the key say the calculation's value? A whole-number key exactly; a decimal key as the value
 * rounded to its decimals (key 12.35 for 12.3456); a declared tolerance where the part has one.
 * The same reading of a key the learner's answer gets (`compareNumbers`, decision D-1).
 */
export function keySaysValue(key: string, value: number, tolerance: number | null): boolean {
  const k = parseCanonicalKey(key);
  if (k.value === null || !Number.isFinite(value)) return false;
  const eps = 1e-9 * Math.max(1, Math.abs(value));
  const d = decimalsOf(key);
  const half = d !== null && d > 0 ? 0.5 * 10 ** -d : 0;
  return Math.abs(k.value - value) <= Math.max(half, tolerance ?? 0) + eps;
}

// ─────────────── the material ───────────────

/** Every number written in a text, read both ways a sheet writes them (2,5 and 2.5; 1.000 and 1 000). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const plain = text.replace(/[−–]/g, '-').replace(/(\d)[\u00a0\u202f ](?=\d{3}(?!\d))/g, '$1');
  for (const m of plain.matchAll(/-?\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    const candidates = new Set<number>();
    // Decimal comma, with points as thousands separators ("1.250,5").
    candidates.add(Number(raw.replace(/\./g, '').replace(',', '.')));
    // Decimal point, with commas as thousands separators ("1,250.5").
    candidates.add(Number(raw.replace(/,/g, '')));
    // One separator only: either reading.
    if (/^-?\d+[.,]\d+$/.test(raw)) candidates.add(Number(raw.replace(',', '.')));
    for (const c of candidates) if (Number.isFinite(c)) out.push(c);
  }
  return out;
}

/** The value stands in the material: in its text or in the data of its figure. */
function standsInMaterial(value: number, text: string): boolean {
  const eps = 1e-9 * Math.max(1, Math.abs(value));
  return numbersIn(text).some((n) => Math.abs(n - value) <= eps || Math.abs(-n - value) <= eps);
}

/** The material as stored, or null when it is none (no text and no figure, sizes, unusable figure). */
function materialFrom(draft: {
  title: string | null;
  lines: readonly string[];
  figure?: ComplexDraft['figure'];
  givens: readonly ComplexGiven[];
}): ComplexMaterial | null {
  const lines = draft.lines.map((l) => l.replace(/\s+$/u, '').replace(/\t/g, ' '));
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length > PASSAGE_LINES_MAX || lines.some((l) => l.length > PASSAGE_LINE_MAX))
    return null;
  if (lines.join('\n').length > PASSAGE_CHARS_MAX) return null;
  const rawFigure = draft.figure ?? null;
  const figure: Figure | null = rawFigure ? usableFigure(rawFigure) : null;
  // A figure that cannot be drawn is a material that is not all there.
  if (rawFigure && !figure) return null;
  if (lines.length === 0 && !figure) return null;
  // Two quantities of one name are two answers to "what is m?".
  const names = draft.givens.map((g) => g.name);
  if (new Set(names).size !== names.length) return null;
  const text = [draft.title ?? '', ...lines, figure ? JSON.stringify(figure) : ''].join('\n');
  if (!draft.givens.every((g) => standsInMaterial(g.value, text))) return null;
  return { title: draft.title, lines, figure, givens: [...draft.givens] };
}

// ─────────────── the task, all or nothing ───────────────

/** The parts of a task as questions to store — every one of them, or none. */
export function complexItems(
  draft: Omit<ComplexDraft, 'figure'> & { figure?: ComplexDraft['figure'] },
  /** The learner's app language: the next step a key point names is said in it. */
  locale: string,
  opts: { newGroup?: () => string } = {},
): StoredItem[] {
  const parts = draft.parts;
  if (parts.length < COMPLEX_PARTS_MIN || parts.length > COMPLEX_PARTS_MAX) return [];
  const material = materialFrom(draft);
  if (!material) return [];
  const lineCount = material.lines.length;
  const keyValues = new Map<number, number>();
  const group = (opts.newGroup ?? randomUUID)();
  const out: StoredItem[] = [];
  for (const [index, p] of parts.entries()) {
    // A line the part names must exist in the material (as for a reading question, #233).
    if (!refsExist(p.prompt, lineCount)) return [];
    // A dependency must point at a part that comes before this one.
    const uses = new Set<number>();
    for (const label of p.uses) {
      const at = (COMPLEX_LABELS as readonly string[]).indexOf(label);
      if (at < 0 || at >= index) return [];
      uses.add(at);
    }
    let calc: string | null = null;
    if (p.kind === 'numeric') {
      // A number in a task with material is computed FROM it: no calculation, no part.
      if (p.calc === null) return [];
      const read = readCalc(p.calc, material.givens, index);
      if (!read) return [];
      for (const at of partsRead(read)) {
        // It calculates with an earlier result, so that result has to be a number.
        if (parts[at]?.kind !== 'numeric') return [];
        uses.add(at);
      }
      const value = evaluateCalc(read, material.givens, keyValues);
      if (!keySaysValue(p.answer, value, p.tolerance)) return [];
      calc = p.calc;
    }
    const [usable] = usableItems([
      {
        kind: p.kind,
        prompt: p.prompt,
        answer: p.answer,
        accepted_answers: p.accepted_answers,
        unit: p.unit,
        choices: p.choices,
        correct_choice: p.correct_choice,
        topic: draft.topic,
        difficulty: p.difficulty,
        prompt_lang: draft.lang,
        lang: null,
        figure: null,
        tolerance: p.tolerance,
        spelling: p.kind === 'short' || p.kind === 'long' ? 'gentle' : null,
        source_excerpt: null,
        curriculum_point: null,
        hints: p.hints,
        worked_solution: null,
        rubric: rubricFrom(p, locale),
      },
    ]);
    // The part fails the check of its own kind (a key against its own arithmetic, a choice that
    // is not one, a rubric that leaks): no task.
    if (!usable) return [];
    if (p.kind === 'numeric') {
      const v = parseCanonicalKey(usable.answer).value;
      if (v === null) return [];
      keyValues.set(index, v);
    }
    const task = ComplexTask.safeParse({
      group,
      part: index,
      parts: parts.length,
      material,
      uses: [...uses].sort((a, b) => a - b),
      calc,
    });
    if (!task.success) return [];
    out.push({ ...usable, complex_task: task.data });
  }
  return out;
}

/**
 * The rubric of an open part, from its key points: one judged element each (#211, #258). Fewer
 * than two points is no rubric — the part then behaves like every free text without one.
 */
function rubricFrom(p: ComplexPartDraft, locale: string): Rubric | null {
  if (p.kind !== 'long' || p.points.length < RUBRIC_MIN) return null;
  return {
    form: t(locale, 'practice.complex.form'),
    elements: p.points.map((name) => ({
      name,
      missing: t(locale, 'practice.complex.point_missing'),
      check: { by: 'judged' as const },
    })),
  };
}

/** A stored row's task, or null (an unreadable column is no task). */
export function complexTaskOf(stored: unknown): ComplexTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = ComplexTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** The alias of each part's task in one view ('k1', 'k2' …), by the order the parts stand in. */
export function complexRefs(
  rows: ReadonlyArray<{ id: string; complex_task: unknown }>,
): Map<string, string> {
  const refs = new Map<string, string>();
  const byGroup = new Map<string, string>();
  for (const row of rows) {
    const task = complexTaskOf(row.complex_task);
    if (!task) continue;
    const ref = byGroup.get(task.group) ?? `k${byGroup.size + 1}`;
    byGroup.set(task.group, ref);
    refs.set(row.id, ref);
  }
  return refs;
}

/** What the app shows above a part: the material and where the part stands. Never the key. */
export function complexViewOf(task: ComplexTask, ref: string): ComplexView {
  return {
    ref,
    label: COMPLEX_LABELS[task.part]!,
    labels: COMPLEX_LABELS.slice(0, task.parts),
    title: task.material.title,
    lines: task.material.lines,
    figure: task.material.figure,
  };
}

// ─────────────── Folgefehler ───────────────

/**
 * The number she arrived at in an earlier part: the value of her answer, or of the last line of a
 * written way to it (#209), whether every step of that way holds or not. Null when her answer is no number code can read — then nothing is
 * carried, and her later part is judged against the key alone.
 */
export function herValue(answer: string): number | null {
  // The last line, sound or not: a way that broke is exactly how a wrong a) comes about, and the
  // value it ends in is the one she carried on with.
  const text = lastValue(answer) ?? answer;
  const given = parseNumericInput(text);
  if (given.value === null || given.form === 'expression') return null;
  return given.value;
}

/**
 * The key this part has when it is calculated with HER results of the parts it builds on, written
 * as precisely as the key is (or, when her value needs it, to two decimals) — or null when there
 * is nothing to carry: no calculation, none of her earlier results differ from their keys, or one
 * of them cannot be read.
 */
export function carriedKey(
  task: ComplexTask,
  key: string,
  /** The keys of the earlier parts, by position. */
  keys: ReadonlyMap<number, string>,
  /** Her latest answers to the earlier parts, by position. */
  hers: ReadonlyMap<number, string>,
): { key: string; from: number[] } | null {
  if (task.calc === null) return null;
  const calc = readCalc(task.calc, task.material.givens, task.part);
  if (!calc) return null;
  const values = new Map<number, number>();
  const from: number[] = [];
  for (const at of partsRead(calc)) {
    const own = parseCanonicalKey(keys.get(at) ?? '').value;
    if (own === null) return null;
    const answer = hers.get(at);
    const v = answer === undefined ? null : herValue(answer);
    if (v === null || keySaysValue(keys.get(at)!, v, null)) {
      values.set(at, own);
      continue;
    }
    values.set(at, v);
    from.push(at);
  }
  if (from.length === 0) return null;
  const value = evaluateCalc(calc, task.material.givens, values);
  if (!Number.isFinite(value)) return null;
  // As precise as the key: a part that says "auf eine Nachkommastelle" keeps saying it. Only a
  // whole-number key whose recomputed value is not whole needs places it did not have.
  const d = decimalsOf(key) ?? 2;
  const whole = Math.abs(Math.round(value) - value) <= 1e-9 * Math.max(1, Math.abs(value));
  const places = d > 0 || whole ? d : 2;
  return { key: value.toFixed(places), from: from.sort((a, b) => a - b) };
}

/** "a" or "a und b" for the reply — the letters of the parts she carried her results from. */
export function labelsOf(parts: readonly number[], and: string): string {
  const labels = parts.map((p) => `${complexLabel(p)})`);
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} ${and} ${labels[labels.length - 1]}`;
}

/** An earlier part of the same task in this run: its key and her latest answer to it. */
export type EarlierPart = { part: number; prompt: string; key: string; hers: string | null };

/** The material as the tutor reads it: numbered lines, the quantities, and her earlier parts. */
export function tutorMaterial(task: ComplexTask, earlier: readonly EarlierPart[]): string {
  const lines = task.material.lines.map((l, n) => `${n + 1}  ${l}`);
  const givens = task.material.givens.map(
    (g) => `${g.name} = ${g.value}${g.unit ? ` ${g.unit}` : ''}`,
  );
  const before = earlier
    .filter((e) => task.uses.includes(e.part))
    .map((e) => `${complexLabel(e.part)}) ${e.prompt} — HER ANSWER: ${e.hers ?? '(none yet)'}`);
  return [
    task.material.title ? `TASK: ${task.material.title}` : null,
    lines.length > 0 ? lines.join('\n') : null,
    givens.length > 0 ? `QUANTITIES: ${givens.join(', ')}` : null,
    `THIS IS PART ${complexLabel(task.part)}) OF ${task.parts}.`,
    before.length > 0
      ? `IT BUILDS ON (judge with HER results there — a value carried on correctly from a wrong earlier part is right here):\n${before.join('\n')}`
      : null,
  ]
    .filter((x): x is string => x !== null)
    .join('\n');
}
