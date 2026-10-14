// Which forms and figures a call needs, decided before the call that writes them (issue #627,
// the D3 step #281 put off). docs/architecture.md §Schema budget.
//
// Vertex serves a response schema only up to a measured size (`llm/schemaBudget.ts`). The schema
// of a practice run or of a sheet reading holds every task form and every figure type, about three
// times that size, so Vertex refused it before the model read a word. Here a small first call (the
// fast model, no thinking, the same system prompt and the same message as the main call) picks,
// from closed lists, the forms and figure types this run or this sheet needs. Code then builds the
// main schema from exactly those (`pruned`). It adds them in the order the model ranked them, and
// only while the schema stays within the budget (`fitted`). It also drops anything the answer
// holds outside them (`keepChosen`, CLAUDE.md rule 1).
//
// A schema that already fits is sent as it is, without this call. When the choice cannot be made
// (refused, outage, unreadable), the main call goes out with the minimal set: plain questions,
// no figures, no extra forms. The run still starts.

import { ModelFigure, STRUCTURED_KINDS } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { isAppError } from '../../lib/errors.js';
import { callAhead, reserveCall, type Reservation } from '../../llm/call.js';
import type { JsonSchema, LlmMessage, LlmPurpose } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { promptVersion } from '../../llm/promptVersion.js';
import { withinBudget } from '../../llm/schemaBudget.js';

/** The figure types a model may draw: the tags of the figure unions. */
const FIGURE_TYPES: ReadonlySet<string> = new Set(
  ModelFigure.options.map((o) => o.shape.type.value),
);
const STRUCTURED: ReadonlySet<string> = new Set(STRUCTURED_KINDS);
/** The lists of their own a set or a reading may hold besides its questions. */
const BLOCKS = ['bars', 'staffs', 'codes', 'part_tasks', 'reading'] as const;

/** What a main call may use: task forms (structured kinds and blocks) and figure types. */
export type Keep = { forms: ReadonlySet<string>; figures: ReadonlySet<string> };

/** The schema a main call goes out with, and what its answer may hold (null: anything). */
export type Narrowed = {
  schema: JsonSchema;
  keep: Keep | null;
  /**
   * whole: the schema fits as it is · chosen: narrowed to the choice · minimal: the choice was
   * plain questions only · fallback: no choice could be made, so plain questions only — a
   * reading done so may lack what its sheet needed and never counts as complete (#664).
   */
  how: 'whole' | 'chosen' | 'minimal' | 'fallback';
};

/**
 * Something the answer held that the schema did not offer, taken out by `keepChosen` (#664):
 * where it stood, and the figure type or form that was not chosen.
 */
export type Loss = { at: string; kind: 'figure' | 'form'; name: string };

type Node = JsonSchema[string];
const isSchema = (n: Node | undefined): n is JsonSchema =>
  typeof n === 'object' && n !== null && !Array.isArray(n);

/** The tag of a union branch: its `type` property's one enum value. */
function tagOf(b: Node): string | null {
  if (!isSchema(b) || !isSchema(b.properties)) return null;
  const t = b.properties.type;
  return isSchema(t) &&
    Array.isArray(t.enum) &&
    t.enum.length === 1 &&
    typeof t.enum[0] === 'string'
    ? t.enum[0]
    : null;
}

/** Which set a union's tags all belong to, or null for any other union. */
function unionFamily(branches: Node[]): 'figures' | 'forms' | null {
  const tags = branches.map(tagOf);
  if (tags.length === 0 || tags.some((t) => t === null)) return null;
  if (tags.every((t) => FIGURE_TYPES.has(t!))) return 'figures';
  if (tags.every((t) => STRUCTURED.has(t!))) return 'forms';
  return null;
}

/** The forms and figure types a schema offers: what a choice can be made from. */
export function offered(schema: JsonSchema): { forms: string[]; figures: string[] } {
  const forms = new Set<string>();
  const figures = new Set<string>();
  const root = isSchema(schema.properties) ? schema.properties : {};
  for (const b of BLOCKS) if (b in root) forms.add(b);
  const walk = (n: Node): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isSchema(n)) return;
    if (Array.isArray(n.anyOf)) {
      const family = unionFamily(n.anyOf);
      for (const t of family ? n.anyOf.map(tagOf) : [])
        (family === 'figures' ? figures : forms).add(t!);
    }
    Object.values(n).forEach(walk);
  };
  walk(schema);
  return { forms: [...forms], figures: [...figures] };
}

/** An emptied union: the property that holds it goes. */
const GONE = Symbol('gone');

/**
 * `schema` with only the forms and figure types of `keep`: the other branches of every figure and
 * form union are taken out, and so are the other blocks and every property left without a value.
 */
function pruned(schema: JsonSchema, keep: Keep): JsonSchema {
  const isNull = (b: Node) => isSchema(b) && b.type === 'null';
  /** One schema node, or GONE when nothing of it is left (an emptied union, or its array). */
  const walk = (n: JsonSchema): JsonSchema | typeof GONE => {
    const out: JsonSchema = { ...n };
    if (isSchema(n.items)) {
      const items = walk(n.items);
      if (items === GONE) return GONE;
      out.items = items;
    }
    if (Array.isArray(n.anyOf)) {
      let branches = n.anyOf
        .map((b) => (isSchema(b) ? walk(b) : b))
        .filter((b): b is Node => b !== GONE);
      const family = unionFamily(branches);
      if (family) {
        const allowed = family === 'figures' ? keep.figures : keep.forms;
        branches = branches.filter((b) => allowed.has(tagOf(b)!));
      }
      if (branches.every(isNull) && !n.anyOf.every(isNull)) return GONE;
      out.anyOf = branches;
    }
    if (isSchema(n.properties)) {
      const props: JsonSchema = {};
      for (const [k, v] of Object.entries(n.properties)) {
        const kept = isSchema(v) ? walk(v) : v;
        if (kept !== GONE) props[k] = kept;
      }
      out.properties = props;
      if (Array.isArray(n.required))
        out.required = n.required.filter((k) => typeof k === 'string' && k in props);
    }
    return out;
  };
  const walked = walk(schema);
  const top = walked === GONE ? schema : walked;
  const props = isSchema(top.properties) ? { ...top.properties } : {};
  for (const b of BLOCKS) if (!keep.forms.has(b)) delete props[b];
  const required = Array.isArray(top.required)
    ? top.required.filter((k) => typeof k === 'string' && k in props)
    : [];
  return { ...top, properties: props, required };
}

/**
 * The most of `wanted` that fits: its forms and figure types added in the order the model ranked
 * them (one of each list in turn), each one only if the schema then still fits the budget.
 */
export function fitted(
  schema: JsonSchema,
  wanted: { forms: string[]; figures: string[] },
): Narrowed {
  const forms = new Set<string>();
  const figures = new Set<string>();
  let best = pruned(schema, { forms, figures });
  const order: ['forms' | 'figures', string][] = [];
  for (let i = 0; i < Math.max(wanted.forms.length, wanted.figures.length); i++) {
    if (wanted.figures[i]) order.push(['figures', wanted.figures[i]!]);
    if (wanted.forms[i]) order.push(['forms', wanted.forms[i]!]);
  }
  for (const [list, name] of order) {
    const into = list === 'forms' ? forms : figures;
    into.add(name);
    const next = pruned(schema, { forms, figures });
    if (withinBudget(next)) best = next;
    else into.delete(name);
  }
  return {
    schema: best,
    keep: { forms, figures },
    how: forms.size + figures.size > 0 ? 'chosen' : 'minimal',
  };
}

type Raw = { [key: string]: unknown };
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const figureType = (f: unknown): string | null =>
  isRaw(f) && typeof f.type === 'string' ? f.type : null;

/**
 * Whether a question or task leans on a figure that was not chosen: its own figure, or one of its
 * option pictures. Without it the question cannot be answered, so it goes.
 */
function outside(el: unknown, keep: Keep): string | null {
  if (!isRaw(el)) return null;
  const fig = figureType(el.figure);
  if (fig !== null && !keep.figures.has(fig)) return fig;
  if (Array.isArray(el.choice_figures))
    for (const f of el.choice_figures) {
      const type = figureType(f) ?? '';
      if (!keep.figures.has(type)) return type || 'unknown';
    }
  return null;
}

/** How many elements a block or the structured list held. */
const countOf = (v: unknown): number => (Array.isArray(v) ? v.length : v ? 1 : 0);

/**
 * The raw answer with nothing outside `keep`, at any depth. A question or task with a figure or
 * option pictures that were not chosen goes. It was written to be read off a drawing she would
 * not see, so taking only the figure off would leave a question she cannot answer. A block or a
 * structured form that was not chosen goes too. The schema already allows nothing else. This is
 * the code that holds to it (CLAUDE.md rule 1).
 */
export function keepChosen(raw: unknown, keep: Keep | null): unknown {
  return keptAndLost(raw, keep).kept;
}

/**
 * `keepChosen`, with every element it took out (#664): the filter protects what can be shown,
 * and says what it cost — a sheet whose tasks were dropped is not read completely (rule 5).
 */
export function keptAndLost(raw: unknown, keep: Keep | null): { kept: unknown; lost: Loss[] } {
  const lost: Loss[] = [];
  if (keep === null || !isRaw(raw)) return { kept: raw, lost };
  const clean = (v: unknown, at: string): unknown => {
    if (Array.isArray(v))
      return v.flatMap((el, i) => {
        const fig = outside(el, keep);
        if (fig === null) return [clean(el, `${at}[${i}]`)];
        lost.push({ at: `${at}[${i}]`, kind: 'figure', name: fig });
        return [];
      });
    if (!isRaw(v)) return v;
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, clean(x, at ? `${at}.${k}` : k)]),
    );
  };
  const out = clean(raw, '') as Raw;
  for (const b of BLOCKS)
    if (b in out && !keep.forms.has(b)) {
      for (let i = 0; i < countOf(out[b]); i++)
        lost.push({ at: `${b}[${i}]`, kind: 'form', name: b });
      out[b] = Array.isArray(out[b]) ? [] : null;
    }
  if (Array.isArray(out.structured))
    out.structured = out.structured.filter((s, i) => {
      const type = isRaw(s) && typeof s.type === 'string' ? s.type : null;
      const kept = type !== null && keep.forms.has(type);
      if (!kept) lost.push({ at: `structured[${i}]`, kind: 'form', name: type ?? 'unknown' });
      return kept;
    });
  return { kept: out, lost };
}

/** Whether a request is the choosing call. */
export function isChoosing(req: { purpose: LlmPurpose }): boolean {
  return req.purpose === 'forms';
}

/** The purpose of the call a choosing call chooses for, from its prompt version's name. */
export function chosenFor(req: { promptVersion: string }): 'explain' | 'extraction' | null {
  const m = /^forms-(explain|extraction)\./.exec(req.promptVersion);
  return m ? (m[1] as 'explain' | 'extraction') : null;
}

/**
 * The line the main call's system prompt gets when its schema was narrowed: the rules above
 * teach every form and figure, and only the ones named here can be used (#627). A principle, no
 * example question: written examples get copied.
 */
export function availableLine(narrowed: Narrowed): string | null {
  if (narrowed.how === 'whole' || narrowed.keep === null) return null;
  const { forms, figures } = narrowed.keep;
  if (forms.size + figures.size === 0)
    return 'IN THIS ANSWER NO FIGURE CAN BE DRAWN AND NO TASK FORM BESIDES PLAIN QUESTIONS CAN BE WRITTEN, whatever the rules above allow: every question must be answerable from its text alone, never from a picture or a drawing.';
  const list = (xs: ReadonlySet<string>) => (xs.size > 0 ? [...xs].join(', ') : 'none');
  return `IN THIS ANSWER ONLY THESE CAN BE USED, whatever the rules above allow: figures — ${list(figures)}; task forms besides plain questions — ${list(forms)}. A question that would need any other figure or form is not written; a question without a figure must be answerable from its text alone.`;
}

/** The forms and figure types an answer uses: what a perfect choice for it would have been. */
export function usedBy(raw: unknown): { forms: string[]; figures: string[] } {
  const forms = new Set<string>();
  const figures = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!isRaw(v)) return;
    const fig = figureType(v.figure);
    if (fig !== null) figures.add(fig);
    if (Array.isArray(v.choice_figures))
      for (const f of v.choice_figures) if (figureType(f) !== null) figures.add(figureType(f)!);
    Object.values(v).forEach(walk);
  };
  walk(raw);
  if (isRaw(raw)) {
    for (const b of BLOCKS) {
      const x = raw[b];
      if (
        (Array.isArray(x) && x.length > 0) ||
        (x !== null && x !== undefined && !Array.isArray(x))
      )
        forms.add(b);
    }
    if (Array.isArray(raw.structured))
      for (const t of raw.structured) if (isRaw(t) && typeof t.type === 'string') forms.add(t.type);
  }
  return { forms: [...forms], figures: [...figures] };
}

/** The answer of the choosing call: two closed lists, of what `full` offers. */
export function choiceFor(full: JsonSchema) {
  const { forms, figures } = offered(full);
  // A list with nothing to offer is not shown at all (a help run offers figures only).
  const shape: Record<string, z.ZodTypeAny> = {};
  if (forms.length > 0) shape.forms = z.array(z.enum(forms as [string, ...string[]]));
  if (figures.length > 0) shape.figures = z.array(z.enum(figures as [string, ...string[]]));
  return z.object(shape);
}

/** How the choosing call's answer is read: two lists, and only offered names count. */
const ChoiceRead = z.object({
  forms: z.array(z.string()).default([]),
  figures: z.array(z.string()).default([]),
});

/** The largest schema a main call can go out with: `full`, or with everything chosen that fits. */
export function widest(full: JsonSchema): JsonSchema {
  return withinBudget(full) ? full : fitted(full, offered(full)).schema;
}

/** What the choosing call is told on top of the main call's system prompt (listed in `learning/schemas.ts`). */
export const CHOOSER = `NOW ONLY CHOOSE, DO NOT WRITE THE TASK. Before the answer above is written, choose what it needs from the two lists of this answer's schema: "forms" — the task forms beyond plain questions (the structured kinds and the separate lists of tasks), and "figures" — the figure types its questions need drawn. Choose the fewest that serve this learner and this material well, the most needed first; an empty list when plain questions serve. What is not chosen cannot be used.`;

/**
 * The schema the main call goes out with: `full` when it fits; otherwise narrowed to what a first,
 * small call chose, or to the minimal set when that call fails (`fallback`). When a choice is
 * needed, her allowance for the main call is held first (#665): the main call uses
 * `reservation`, and a caller that never gets there gives it back (`releaseCall`).
 */
export async function chooseForms(
  deps: Deps,
  learnerId: string,
  localDay: string,
  call: {
    purpose: Extract<LlmPurpose, 'explain' | 'extraction'>;
    promptVersion: string;
    system: string;
    contents: LlmMessage[];
    full: JsonSchema;
  },
): Promise<Narrowed & { reservation: Reservation | null }> {
  if (withinBudget(call.full))
    return { schema: call.full, keep: null, how: 'whole', reservation: null };
  // Before the choosing call, never after it: a run her limit refuses costs no choice (#665).
  const reservation = await reserveCall(deps, learnerId, localDay, call.purpose);
  const narrowed = await narrow(deps, reservation, call);
  // Which set the main call goes out with, for the function log (#665): no prompt, no answer.
  console.info(
    `[forms] ${call.purpose}: ${narrowed.how}` +
      (narrowed.keep
        ? ` forms=${[...narrowed.keep.forms].join(',') || '-'} figures=${[...narrowed.keep.figures].join(',') || '-'}`
        : ''),
  );
  return { ...narrowed, reservation };
}

async function narrow(
  deps: Deps,
  reservation: Reservation,
  call: Parameters<typeof chooseForms>[3],
): Promise<Narrowed> {
  const Choice = choiceFor(call.full);
  try {
    // Metered with the call it belongs to (`callAhead`): her daily limit counts runs, not calls.
    const res = await callAhead(deps, reservation, {
      purpose: 'forms',
      tier: 'fast',
      promptVersion: promptVersion(`forms-${call.purpose}`, CHOOSER, call.promptVersion),
      system: `${call.system}\n\n${CHOOSER}`,
      contents: call.contents,
      schema: toJsonSchema(Choice),
      maxOutputTokens: 300,
      temperature: 0,
      timeoutMs: 20_000,
      thinkingBudget: 0,
    });
    const parsed = ChoiceRead.safeParse(res.json);
    if (parsed.success) {
      const can = offered(call.full);
      const wanted = {
        forms: parsed.data.forms.filter((f) => can.forms.includes(f)),
        figures: parsed.data.figures.filter((f) => can.figures.includes(f)),
      };
      const named = parsed.data.forms.length + parsed.data.figures.length;
      // Only names it was not offered: no choice was made, whatever the answer's shape.
      if (named === 0 || wanted.forms.length + wanted.figures.length > 0)
        return fitted(call.full, wanted);
    }
  } catch (err) {
    if (isAppError(err)) throw err;
  }
  console.warn(`[forms] ${call.purpose}: no choice, the minimal set goes out (#627)`);
  return { ...fitted(call.full, { forms: [], figures: [] }), how: 'fallback' };
}
