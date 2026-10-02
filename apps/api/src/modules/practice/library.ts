// The figure library: periodic table (#250), our own schematic drawings (#252), circuits, logic
// gates and the colour wheel (#261). docs/architecture.md §Practice ("Figure library").
//
// The model CHOOSES — an element, a drawing and some of its parts, a net of lamps and
// resistors, a gate, a colour — and code writes everything a learner sees or is measured on:
// the question, the figure, the options and the key. Like the note lines (`staff.ts`) and for
// the same reason: a key written by someone other than the drawing can contradict it, and the
// rule check would then turn a right answer down with full authority (issue #157). A key that
// is COMPUTED from the drawing cannot.
//
// Regel 0, both directions, 0 model calls per answer:
//   1. What the MODEL chose is checked: the element exists (and has the fact asked for), the
//      parts belong to the drawing and fit its margins, the circuit is drawable and no short
//      circuit, the numbers come out as decimals she can type, the colours really mix. A choice
//      that fails gives no question — nothing is repaired.
//   2. What SHE answers is compared with the computed key: a tap by its id (`figureTap.ts`),
//      a number by value and unit, an option by its index, a truth table cell by cell.
//
// Schema size (#281): the model-facing union below is deliberately small — ids, an enum per
// task, a few numbers. Names, positions and facts are in code and in the language files, never
// in the schema, so the library can grow by a drawing without the schema growing at all.

import {
  circuitParts,
  complementOf,
  elementId,
  elementOf,
  inTable,
  logicInputs,
  mainGroupNumber,
  mixOf,
  pinOrder,
  SCHEMATIC_BOTTOM_MAX,
  SCHEMATIC_PARTS_MAX,
  SCHEMATIC_PARTS_MIN,
  SCHEMATIC_SIDE_MAX,
  SCHEMATICS,
  SchematicId,
  StructuredTask,
  valenceElectrons,
  WheelId,
  type Circuit,
  type CircuitBlock,
  type CircuitPart,
  type ElementFacts,
  type Figure,
  type FigureTapTask,
  type LogicNet,
  type PeriodicTableKind,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { libraryTerm, t, type MessageKey } from '../../i18n/index.js';
import {
  CIRCUIT_ASKS,
  circuitProblem,
  connectionOf,
  decimalOf,
  litLamps,
  truthTable,
  values,
  type Q,
} from './circuit.js';
import { figureTapProblem, numberWords } from './figureTap.js';
import type { StoredItem } from './items.js';
import { colorName, elementName, partNames, partObject } from './libraryNames.js';
import { matchTaskFrom, solutionOf } from './structured.js';
import { tableTaskFrom } from './table.js';

/** Inputs of a logic net whose truth table still fits the phone with its gates (four rows). */
export const LOGIC_INPUTS_MAX = 2;

/** Tasks the model may choose per set, and the questions they may become. */
export const MAX_FIGURE_TASKS = 4;
export const MAX_FIGURE_ITEMS = 8;

export const ELEMENT_ASKS = [
  'find',
  'locate',
  'protons',
  'electrons',
  'neutrons',
  'valence',
  'group',
  'period',
  'class',
  'more_en',
] as const;

const Sym = z.string().trim().min(1).max(3);

const CircuitPartDraft = z.object({
  part: z.enum(['lamp', 'resistor', 'switch']),
  ohm: z.number().positive().max(1_000_000).nullable().default(null),
  open: z.boolean().default(false),
  /** The part an ammeter or voltmeter is put at (current, voltage). */
  asked: z.boolean().default(false),
});
type CircuitPartDraft = z.infer<typeof CircuitPartDraft>;

/** What the model chooses. Nothing in here is shown as written; code builds every question. */
export const FigureTaskDraft = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('element'),
    ask: z.enum(ELEMENT_ASKS),
    element: Sym.describe('Element symbol'),
    other: Sym.nullable().default(null).describe('more_en: the second element; else null'),
    full: z.boolean().default(false).describe('true for the full 18-group table (upper school)'),
  }),
  z.object({
    task: z.literal('label'),
    drawing: SchematicId,
    ask: z.enum(['tap', 'name', 'match']),
    parts: z.array(z.string().trim().min(1).max(20)).max(SCHEMATIC_PARTS_MAX * 2),
  }),
  z.object({
    task: z.literal('circuit'),
    ask: z.enum(CIRCUIT_ASKS),
    voltage: z.number().positive().max(1000).nullable().default(null),
    blocks: z
      .array(z.object({ branches: z.array(z.array(CircuitPartDraft).max(6)).max(6) }))
      .max(6)
      .describe('In series along the wire; a block with several branches is a parallel part'),
  }),
  z.object({
    task: z.literal('logic'),
    gate: z.enum(['and', 'or', 'xor', 'nand', 'nor', 'not']),
    then: z.enum(['and', 'or', 'xor', 'nand', 'nor']).nullable().default(null),
  }),
  z.object({
    task: z.literal('color'),
    ask: z.enum(['find', 'complement', 'mix']),
    color: WheelId,
    with: WheelId.nullable().default(null),
  }),
]);
export type FigureTaskDraft = z.infer<typeof FigureTaskDraft>;

function drawingList(): string {
  return Object.entries(SCHEMATICS)
    .map(([id, d]) => `${id} (${Object.keys(d.parts).join(', ')})`)
    .join('; ');
}

/**
 * What the generator is told. It says what the model may CHOOSE and that it writes nothing
 * else — there is no field for a question, an answer or a figure. Categories, never an example
 * sentence (models copy examples; repo convention).
 */
export const FIGURE_LIBRARY_RULES = `Library figures ("figures"): the app draws them and writes the question, options and solution from what you choose — never write a question text or an answer for one, and never describe them in "figure". At most ${MAX_FIGURE_TASKS}, and only where the subject uses them; an empty list otherwise. element (chemistry): the periodic table; ask find (tap the named element), locate (tap the element at its group and period), protons, electrons, neutrons, valence (main groups only), group, period, class (metal, metalloid or nonmetal), more_en (which of element and other has the higher electronegativity); element and other are symbols; full true only for the upper school's full table. label (biology, chemistry, traffic education): one of these drawings with the parts to point at, ${SCHEMATIC_PARTS_MIN}–${SCHEMATIC_PARTS_MAX} of its part ids — ${drawingList()}; ask tap (one question per part: tap it), name (one question per part: which name has the numbered part), match (3–4 parts: link numbers and names). circuit (physics, primary science): a battery with voltage in V and blocks in series along the wire; a block holds 1–3 branches side by side (parallel), a branch 1–3 parts in series: lamp or resistor with ohm, or switch (open true or false); at most 4 parts side by side and 8 in all. ask dark_lamp (exactly one lamp stays dark), lit_lamp (exactly one lamp lights), lit_count, connection (series, parallel or mixed), resistance (equivalent resistance; every ohm given), current (an ammeter at the part marked asked), voltage (a voltmeter across the part marked asked); the app computes every value, so choose values that give round results. logic (computer science): a gate on A and B, or not on A followed by a second gate (then) on its output and B; then is null after any other gate; the learner fills in the truth table. color (art): Itten's twelve-part wheel; ask find (tap color), complement (tap the complement of color), mix (tap what color and with mix to: two primaries, or a primary and a neighbouring secondary).`;

// ─────────────── shared pieces ───────────────

/** The fields every library question has the same way (no model fields among them). */
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
  // None of the curriculum places (#214) is one of these facts, and none is a written text (#211).
  curriculum_point: null,
  rubric: null,
  task: null,
  bar_task: null,
  staff_task: null,
  listen_task: null,
} satisfies Partial<StoredItem>;

/**
 * A sentence of the library in her language. Its first letter is a capital even where it starts
 * with a name that is written small in that language ("zolfo è un non metallo").
 */
function say(locale: string, key: string, vars: Record<string, string | number> = {}): string {
  const text = t(locale, `practice.library.${key}` as MessageKey, vars);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic shuffle (the same task always shows the same options). */
function shuffled<T>(xs: readonly T[], seed: string): T[] {
  const out = [...xs];
  let a = hash(seed);
  for (let i = out.length - 1; i > 0; i--) {
    a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Options with the right one among them, or null when two read the same. */
function choicesWith(
  right: string,
  others: readonly string[],
  seed: string,
): { choices: string[]; correct_choice: number; answer: string } | null {
  const all = shuffled([right, ...others], seed);
  if (new Set(all.map((x) => x.toLocaleLowerCase())).size !== all.length) return null;
  return { choices: all, correct_choice: all.indexOf(right), answer: right };
}

function tapItem(
  task: FigureTapTask,
  locale: string,
  fields: {
    prompt: string;
    topic: string;
    difficulty: number;
    hints: string[];
    worked_solution: string | null;
  },
): StoredItem | null {
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'figure_tap') return null;
  if (figureTapProblem(parsed.data) !== null) return null;
  return {
    ...COMMON,
    kind: 'figure_tap',
    task: parsed.data,
    answer: solutionOf(parsed.data, locale),
    figure: null,
    ...fields,
  };
}

// ─────────────── the periodic table (#250) ───────────────

/** Neutrons from the rounded mass — only where the rounding is not a coin toss and an isotope is stable. */
export function neutronsOf(e: ElementFacts): number | null {
  if (!e.stable) return null;
  const frac = e.mass - Math.floor(e.mass);
  if (Math.abs(frac - 0.5) < 0.1) return null;
  return Math.round(e.mass) - e.z;
}

function elementItems(
  d: Extract<FigureTaskDraft, { task: 'element' }>,
  locale: string,
): StoredItem[] {
  const e = elementOf(d.element);
  if (!e) return [];
  const name = elementName(locale, e);
  if (!name) return [];
  const table: PeriodicTableKind = d.full || !inTable('main', e) ? 'full' : 'main';
  const id = elementId(e);
  const topic = say(locale, 'topic_periodic');
  const shown: Figure = { type: 'periodic', table, mark: id };
  const vars = { name, sym: e.sym };
  const numeric = (
    prompt: string,
    value: number,
    hint: string,
    worked: string,
    difficulty: number,
  ): StoredItem[] => [
    {
      ...COMMON,
      kind: 'numeric',
      prompt,
      answer: String(value),
      topic,
      difficulty,
      figure: shown,
      hints: [hint],
      worked_solution: worked,
    },
  ];
  const main = mainGroupNumber(e.group);
  switch (d.ask) {
    case 'find': {
      const item = tapItem(
        {
          type: 'figure_tap',
          figure: { kind: 'periodic', table },
          key: { kind: 'periodic', id },
        },
        locale,
        {
          prompt: say(locale, 'el_find', vars),
          topic,
          difficulty: 1,
          hints: [say(locale, 'hint_find', { sym: e.sym })],
          worked_solution: say(locale, 'worked_place', {
            ...vars,
            group: groupWords(locale, e, table),
            period: e.period,
          }),
        },
      );
      return item ? [item] : [];
    }
    case 'locate': {
      const item = tapItem(
        {
          type: 'figure_tap',
          figure: { kind: 'periodic', table },
          key: { kind: 'periodic', id },
        },
        locale,
        {
          prompt: say(locale, 'el_locate', {
            group: groupWords(locale, e, table),
            period: e.period,
          }),
          topic,
          difficulty: 2,
          hints: [say(locale, 'hint_locate')],
          worked_solution: say(locale, 'worked_place', {
            ...vars,
            group: groupWords(locale, e, table),
            period: e.period,
          }),
        },
      );
      return item ? [item] : [];
    }
    case 'protons':
      return numeric(
        say(locale, 'el_protons', vars),
        e.z,
        say(locale, 'hint_z'),
        say(locale, 'worked_protons', { ...vars, z: e.z }),
        1,
      );
    case 'electrons':
      return numeric(
        say(locale, 'el_electrons', vars),
        e.z,
        say(locale, 'hint_electrons'),
        say(locale, 'worked_electrons', { ...vars, z: e.z }),
        2,
      );
    case 'neutrons': {
      const n = neutronsOf(e);
      if (n === null) return [];
      const mass = numberWords(locale, e.mass);
      return numeric(
        say(locale, 'el_neutrons', { ...vars, mass }),
        n,
        say(locale, 'hint_neutrons'),
        say(locale, 'worked_neutrons', {
          ...vars,
          mass,
          rounded: Math.round(e.mass),
          z: e.z,
          n,
        }),
        3,
      );
    }
    case 'valence': {
      const v = valenceElectrons(e);
      if (v === null) return [];
      return numeric(
        say(locale, 'el_valence', vars),
        v,
        say(locale, 'hint_valence'),
        say(locale, 'worked_valence', { ...vars, group: main ?? 0, v }),
        2,
      );
    }
    case 'group': {
      if (main === null) return [];
      return [
        {
          ...COMMON,
          kind: 'short',
          prompt: say(locale, 'el_group', vars),
          answer: String(main),
          accepted_answers: [romanOf(main)],
          topic,
          difficulty: 1,
          figure: shown,
          hints: [say(locale, 'hint_group')],
          worked_solution: say(locale, 'worked_group', { ...vars, group: main }),
        },
      ];
    }
    case 'period':
      return numeric(
        say(locale, 'el_period', vars),
        e.period,
        say(locale, 'hint_period'),
        say(locale, 'worked_period', { ...vars, period: e.period }),
        1,
      );
    case 'class': {
      if (e.cls === 'unclear') return [];
      const word = (c: string) => say(locale, `class_${c}`);
      const picked = choicesWith(
        word(e.cls),
        ['metal', 'metalloid', 'nonmetal'].filter((c) => c !== e.cls).map(word),
        `class:${id}`,
      );
      if (!picked) return [];
      return [
        {
          ...COMMON,
          kind: 'multiple_choice',
          prompt: say(locale, 'el_class', vars),
          ...picked,
          topic,
          difficulty: 2,
          figure: shown,
          hints: [say(locale, 'hint_class')],
          worked_solution: say(locale, 'worked_class', { ...vars, cls: word(e.cls) }),
        },
      ];
    }
    case 'more_en': {
      const o = d.other ? elementOf(d.other) : null;
      if (!o || o.z === e.z || e.en === null || o.en === null) return [];
      // Close values depend on the table a school uses: only a clear difference is a question.
      if (Math.abs(e.en - o.en) < 0.2) return [];
      const oname = elementName(locale, o);
      if (!oname) return [];
      const winner = e.en > o.en ? name : oname;
      const loser = e.en > o.en ? oname : name;
      const picked = choicesWith(winner, [loser], `en:${id}:${elementId(o)}`);
      if (!picked) return [];
      return [
        {
          ...COMMON,
          kind: 'multiple_choice',
          prompt: say(locale, 'el_more_en'),
          ...picked,
          topic,
          difficulty: 3,
          figure: { type: 'periodic', table: inTable('main', o) ? table : 'full', mark: null },
          hints: [say(locale, 'hint_en')],
          worked_solution: say(locale, 'worked_en', {
            winner,
            loser,
            a: numberWords(locale, Math.max(e.en, o.en)),
            b: numberWords(locale, Math.min(e.en, o.en)),
          }),
        },
      ];
    }
  }
}

function romanOf(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n] ?? String(n);
}

/** "6. Hauptgruppe" in the main-group table, "Gruppe 16" in the full one. */
function groupWords(locale: string, e: ElementFacts, table: PeriodicTableKind): string {
  const main = mainGroupNumber(e.group);
  return table === 'main' && main !== null
    ? say(locale, 'main_group', { n: main })
    : say(locale, 'iupac_group', { n: e.group });
}

// ─────────────── schematic drawings (#252) ───────────────

/** Why a choice of parts gives no drawing. */
export type LabelProblem =
  | 'unknown_part'
  | 'duplicate_part'
  | 'part_count'
  /** More pins on one side than it holds at 44 pt. */
  | 'crowded';

export function labelProblem(drawing: SchematicId, parts: readonly string[]): LabelProblem | null {
  const d = SCHEMATICS[drawing].parts;
  if (parts.some((id) => !(id in d))) return 'unknown_part';
  if (new Set(parts).size !== parts.length) return 'duplicate_part';
  if (parts.length < SCHEMATIC_PARTS_MIN || parts.length > SCHEMATIC_PARTS_MAX) return 'part_count';
  const count = (side: 'l' | 'r' | 'b') => parts.filter((id) => d[id]!.side === side).length;
  if (count('l') > SCHEMATIC_SIDE_MAX || count('r') > SCHEMATIC_SIDE_MAX) return 'crowded';
  if (count('b') > SCHEMATIC_BOTTOM_MAX) return 'crowded';
  return null;
}

function labelItems(d: Extract<FigureTaskDraft, { task: 'label' }>, locale: string): StoredItem[] {
  const wanted = d.parts.map((x) => x.trim().toLowerCase());
  if (labelProblem(d.drawing, wanted) !== null) return [];
  const parts = pinOrder(d.drawing, wanted);
  const names = parts.map((p) => partNames(locale, d.drawing, p));
  if (names.some((n) => n.length === 0)) return [];
  const topic = libraryTerm(locale, `drawings.${d.drawing}`);
  if (!topic) return [];
  switch (d.ask) {
    case 'tap':
      return parts.flatMap((part, i) => {
        const object = partObject(locale, d.drawing, part);
        if (!object) return [];
        const item = tapItem(
          {
            type: 'figure_tap',
            figure: { kind: 'schematic', drawing: d.drawing, parts },
            key: { kind: 'schematic', id: part },
          },
          locale,
          {
            prompt: say(locale, 'part_tap', { part: object }),
            topic,
            difficulty: 2,
            hints: [say(locale, 'hint_part')],
            worked_solution: say(locale, 'worked_part', { n: i + 1, name: names[i]![0]! }),
          },
        );
        return item ? [item] : [];
      });
    case 'name':
      return parts.flatMap((part, i) => {
        const right = names[i]![0]!;
        // Three other names of the same drawing: what is beside it on the sheet.
        const others = shuffled(
          names.filter((_, j) => j !== i).map((n) => n[0]!),
          `name:${d.drawing}:${part}`,
        ).slice(0, 3);
        const picked = choicesWith(right, others, `opts:${d.drawing}:${part}`);
        if (!picked) return [];
        return [
          {
            ...COMMON,
            kind: 'multiple_choice' as const,
            prompt: say(locale, 'part_name', { n: i + 1 }),
            ...picked,
            topic,
            difficulty: 2,
            figure: { type: 'schematic', drawing: d.drawing, parts, focus: part },
            hints: [say(locale, 'hint_part_name')],
            worked_solution: say(locale, 'worked_part', { n: i + 1, name: right }),
          },
        ];
      });
    case 'match': {
      if (parts.length < 3 || parts.length > 4) return [];
      const task = matchTaskFrom({
        pairs: parts.map((_, i) => ({ left: String(i + 1), right: names[i]![0]! })),
        groups: null,
      });
      if (!task) return [];
      return [
        {
          ...COMMON,
          kind: 'match',
          task,
          prompt: say(locale, 'part_match'),
          answer: solutionOf(task, locale),
          topic,
          difficulty: 2,
          figure: { type: 'schematic', drawing: d.drawing, parts, focus: null },
          hints: [say(locale, 'hint_part_name')],
          worked_solution: null,
        },
      ];
    }
  }
}

// ─────────────── circuits (#261) ───────────────

/** The model's net as the figure draws it: ids by kind and reading order, never the model's. */
export function circuitFrom(
  voltage: number | null,
  blocks: ReadonlyArray<{ branches: ReadonlyArray<ReadonlyArray<CircuitPartDraft>> }>,
): { circuit: Circuit; asked: string[] } | null {
  const counts = { lamp: 0, resistor: 0, switch: 0 };
  const prefix = { lamp: 'l', resistor: 'r', switch: 's' } as const;
  const asked: string[] = [];
  const built: CircuitBlock[] = blocks.map((b) => ({
    branches: b.branches.map((br) =>
      br.map((p): CircuitPart => {
        counts[p.part] += 1;
        const id = `${prefix[p.part]}${counts[p.part]}`;
        if (p.asked) asked.push(id);
        return {
          id,
          part: p.part,
          ohm: p.part === 'switch' ? null : p.ohm,
          open: p.part === 'switch' ? p.open : false,
        };
      }),
    ),
  }));
  if (built.length === 0 || built.some((b) => b.branches.length === 0)) return null;
  if (built.some((b) => b.branches.some((br) => br.length === 0))) return null;
  const circuit: Circuit = { voltage, blocks: built, meter: null };
  if (circuitProblem(circuit) !== null) return null;
  return { circuit, asked };
}

/** A part as she reads it in the figure: L1, R2, S1. */
function partLabel(id: string): string {
  return id.toUpperCase();
}

function circuitItems(
  d: Extract<FigureTaskDraft, { task: 'circuit' }>,
  locale: string,
): StoredItem[] {
  const built = circuitFrom(d.voltage, d.blocks);
  if (!built) return [];
  const { circuit, asked } = built;
  const topic = say(locale, 'topic_circuit');
  const lamps = circuitParts(circuit).filter((p) => p.part === 'lamp');
  const lit = litLamps(circuit);
  const shown: Figure = { type: 'circuit', ...circuit };
  const number = (
    prompt: string,
    value: Q,
    unit: string,
    figure: Figure,
    worked: string,
  ): StoredItem[] => {
    const answer = decimalOf(value);
    if (answer === null) return [];
    return [
      {
        ...COMMON,
        kind: 'numeric',
        prompt,
        answer,
        unit,
        topic,
        difficulty: 3,
        figure,
        hints: [say(locale, `hint_${d.ask}`)],
        worked_solution: say(locale, worked, {
          value: numberWords(locale, Number(answer)),
          unit,
        }),
      },
    ];
  };
  switch (d.ask) {
    case 'dark_lamp':
    case 'lit_lamp': {
      if (asked.length > 0 || lamps.length < 2) return [];
      const dark = lamps.filter((l) => !lit.includes(l.id)).map((l) => l.id);
      const one = d.ask === 'dark_lamp' ? dark : lit;
      if (one.length !== 1) return [];
      const item = tapItem(
        {
          type: 'figure_tap',
          figure: { kind: 'circuit', circuit },
          key: { kind: 'circuit', id: one[0]! },
        },
        locale,
        {
          prompt: say(locale, d.ask === 'dark_lamp' ? 'c_dark' : 'c_lit'),
          topic,
          difficulty: 2,
          hints: [say(locale, 'hint_path')],
          worked_solution: say(locale, d.ask === 'dark_lamp' ? 'worked_dark' : 'worked_lit', {
            lamp: partLabel(one[0]!),
          }),
        },
      );
      return item ? [item] : [];
    }
    case 'lit_count': {
      if (asked.length > 0 || lamps.length < 2) return [];
      return [
        {
          ...COMMON,
          kind: 'numeric',
          prompt: say(locale, 'c_count'),
          answer: String(lit.length),
          topic,
          difficulty: 2,
          figure: shown,
          hints: [say(locale, 'hint_path')],
          worked_solution: say(locale, 'worked_count', {
            n: lit.length,
            lamps: lit.map(partLabel).join(', ') || '—',
          }),
        },
      ];
    }
    case 'connection': {
      if (asked.length > 0) return [];
      const consumers = circuitParts(circuit).filter((p) => p.part !== 'switch');
      if (consumers.length < 2) return [];
      const kind = connectionOf(circuit);
      const word = (k: string) => say(locale, `conn_${k}`);
      const picked = choicesWith(
        word(kind),
        ['series', 'parallel', 'mixed'].filter((k) => k !== kind).map(word),
        `conn:${JSON.stringify(circuit)}`,
      );
      if (!picked) return [];
      return [
        {
          ...COMMON,
          kind: 'multiple_choice',
          prompt: say(locale, 'c_connection'),
          ...picked,
          topic,
          difficulty: 2,
          figure: shown,
          hints: [say(locale, 'hint_connection')],
          worked_solution: say(locale, `worked_conn_${kind}`),
        },
      ];
    }
    case 'resistance': {
      if (asked.length > 0) return [];
      const v = values(circuit.voltage === null ? { ...circuit, voltage: 1 } : circuit);
      if (!v) return [];
      return number(say(locale, 'c_resistance'), v.resistance, 'Ω', shown, 'worked_resistance');
    }
    case 'current':
    case 'voltage': {
      if (asked.length !== 1) return [];
      const at = asked[0]!;
      const part = circuitParts(circuit).find((p) => p.id === at);
      if (!part || part.part === 'switch') return [];
      const v = values(circuit);
      if (!v) return [];
      const meter = { kind: d.ask === 'current' ? 'ammeter' : 'voltmeter', at } as const;
      const figure: Figure = { type: 'circuit', ...circuit, meter };
      return d.ask === 'current'
        ? number(say(locale, 'c_current'), v.partCurrent.get(at)!, 'A', figure, 'worked_current')
        : number(say(locale, 'c_voltage'), v.partVoltage.get(at)!, 'V', figure, 'worked_voltage');
    }
  }
}

// ─────────────── logic gates (#261) ───────────────

function logicItems(d: Extract<FigureTaskDraft, { task: 'logic' }>, locale: string): StoredItem[] {
  const net: LogicNet = { gate: d.gate, then: d.then };
  const inputs = logicInputs(net);
  // Two inputs at most: a table of eight rows next to its gates does not fit a 360×740 phone
  // without scrolling (rule 16, measured in the walkthrough) — so a second gate follows a NOT.
  if (inputs.length > LOGIC_INPUTS_MAX) return [];
  const rows = truthTable(net);
  const bit = (b: boolean) => (b ? '1' : '0');
  // Laid out across, as textbooks also print it: one row per input and per output, one column
  // per case. Two rows fewer than the table standing upright — which is what lets it stand under
  // its gates on a 360×740 phone with Buddy's reply above it (rule 16, measured).
  const shown = (name: string, i: number) => [
    { text: name, gap: false, also: [] },
    ...rows.map((r) => ({ text: bit(r.inputs[i]!), gap: false, also: [] })),
  ];
  const asked = (name: string, of: (r: (typeof rows)[number]) => boolean) => [
    { text: name, gap: false, also: [] },
    ...rows.map((r) => ({ text: bit(of(r)), gap: true, also: [] })),
  ];
  const task = tableTaskFrom({
    header: [inputs[0]!, ...rows.map((r) => bit(r.inputs[0]!))],
    rows: [
      ...inputs.slice(1).map((name, i) => shown(name, i + 1)),
      ...(net.then ? [asked('X', (r) => r.x === true)] : []),
      asked('Q', (r) => r.q),
    ],
    family: null,
    fn: null,
    x_in: null,
  });
  if (!task) return [];
  return [
    {
      ...COMMON,
      kind: 'table_fill',
      task,
      prompt: say(locale, net.then ? 'logic_two' : 'logic_one'),
      answer: solutionOf(task, locale),
      topic: say(locale, 'topic_logic'),
      difficulty: net.then ? 3 : 2,
      figure: { type: 'logic', ...net },
      hints: [say(locale, `hint_gate_${net.gate}`)],
      worked_solution: null,
    },
  ];
}

// ─────────────── the colour wheel (#261) ───────────────

function colorItems(d: Extract<FigureTaskDraft, { task: 'color' }>, locale: string): StoredItem[] {
  const name = colorName(locale, d.color);
  if (!name) return [];
  let key: WheelId;
  let prompt: string;
  let hint: string;
  let difficulty: number;
  switch (d.ask) {
    case 'find':
      if (d.with !== null) return [];
      key = d.color;
      prompt = say(locale, 'col_find', { color: name });
      hint = say(locale, 'hint_col_find');
      difficulty = 1;
      break;
    case 'complement':
      if (d.with !== null) return [];
      key = complementOf(d.color);
      prompt = say(locale, 'col_complement', { color: name });
      hint = say(locale, 'hint_col_complement');
      difficulty = 2;
      break;
    case 'mix': {
      if (d.with === null) return [];
      const other = colorName(locale, d.with);
      const mixed = mixOf(d.color, d.with);
      if (!other || mixed === null) return [];
      key = mixed;
      prompt = say(locale, 'col_mix', { a: name, b: other });
      hint = say(locale, 'hint_col_mix');
      difficulty = 2;
      break;
    }
  }
  const keyName = colorName(locale, key);
  if (!keyName) return [];
  const item = tapItem(
    { type: 'figure_tap', figure: { kind: 'color_wheel' }, key: { kind: 'color_wheel', id: key } },
    locale,
    {
      prompt,
      topic: say(locale, 'topic_color'),
      difficulty,
      hints: [hint],
      worked_solution: say(locale, `worked_col_${d.ask}`, { color: name, key: keyName }),
    },
  );
  return item ? [item] : [];
}

// ─────────────── the set ───────────────

/** The questions one chosen task becomes — none when Regel 0 rejects the choice. */
export function libraryTaskItems(draft: FigureTaskDraft, locale: string): StoredItem[] {
  switch (draft.task) {
    case 'element':
      return elementItems(draft, locale);
    case 'label':
      return labelItems(draft, locale);
    case 'circuit':
      return circuitItems(draft, locale);
    case 'logic':
      return logicItems(draft, locale);
    case 'color':
      return colorItems(draft, locale);
  }
}

/** Every chosen task's questions, capped for the set. */
export function libraryItems(drafts: readonly FigureTaskDraft[], locale: string): StoredItem[] {
  return drafts
    .slice(0, MAX_FIGURE_TASKS)
    .flatMap((d) => libraryTaskItems(d, locale))
    .slice(0, MAX_FIGURE_ITEMS);
}
