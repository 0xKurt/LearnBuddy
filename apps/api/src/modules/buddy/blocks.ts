// What each STATE block costs per turn, and whether the answer referred to it (issue #168).
//
// Every section of STATE (context.ts) travels in every single model call, and the prefix
// cache pays for only 9.2 % of it live (docs/decisions/prefix-cache-2026-10-01.md). So the
// question "which sections does an answer actually refer to" is worth measuring — but only
// if the measurement cannot change the thing it measures.
//
// Therefore this is a seam, not a feature: with no audit registered, `buildContext` does one
// null check and nothing else. Nothing here is reachable from a request path, nothing is
// written anywhere, and the serialized request is byte-identical with an audit registered
// and without one — proved on the real request in `src/__tests__/block-audit.int.test.ts`,
// not assumed.
//
// What the signal is: a string that only this block puts in front of the model — an alias
// (g1, st2, m3, f1, sh1), a goal or sheet title, a topic, a memory statement, the learner's
// name — occurring in what the model wrote back (reply, action arguments, lookup arguments).
// What it proves: the answer repeated something that was only in that block, so the block
// reached the answer. What it does NOT prove, and must never be read as:
//   * that the block was NEEDED. The model may answer correctly from the dialogue alone and
//     still echo a title; and a block can decide an answer without leaving a trace in it
//     (the contact rules stop an offer, "who can read this" shapes a sentence, a goal in
//     STATE is the reason Buddy does NOT ask again).
//   * that a block with zero references is dead. It means no answer in the sample repeated
//     anything from it — a reason to ask whether it belongs in every turn, nothing more.
//   * anything about blocks whose content is not quotable (the clock, the voice, the contact
//     rules): they are listed with `quotable: false` and their reference count stays null.

import type { BuddyState } from './state.js';

/** The sections of STATE, in the order `buildContext` emits them (its cache order). */
export const BLOCK_NAMES = [
  'learner',
  'knows',
  'temporary',
  'voice',
  'contact',
  'earlier',
  'material',
  'goals',
  'practice',
  'waiting',
  'now',
  'note',
] as const;

export type BlockName = (typeof BLOCK_NAMES)[number];

/**
 * Blocks whose content a model answer can quote. The others carry rules and the clock:
 * their effect on an answer is real but invisible to this signal, so they are never
 * reported as "referenced 0 times" — they are reported as not measurable this way.
 */
export const QUOTABLE: Record<BlockName, boolean> = {
  learner: true,
  knows: true,
  temporary: true,
  voice: false,
  contact: false,
  earlier: true,
  material: true,
  goals: true,
  practice: true,
  waiting: true,
  now: false,
  note: false,
};

export type BlockSample = {
  name: BlockName;
  /** Characters this block contributed to the STATE text of this one model context. */
  chars: number;
  /** The block as the model saw it (the audit uses it; nothing else reads it). */
  text: string;
  /**
   * Strings this block puts in front of the model: its aliases (`aliasesIn`) and the row
   * data it renders (`blockData`). "In principle only this block" — where two blocks offer
   * the same string, `referencedBlocks` credits neither.
   */
  data: readonly string[];
};

export type StateSample = { learnerId: string; blocks: readonly BlockSample[] };

type StateAudit = (sample: StateSample) => void;

let audit: StateAudit | null = null;

/** Register (or clear) the audit. Only evaluations and tests call this. */
export function setStateAudit(fn: StateAudit | null): void {
  audit = fn;
}

/**
 * Hand the audit one model context. The sample is built by the callback, so with no audit
 * registered not a single string is copied — the measurement costs nothing when it is off.
 */
export function reportState(build: () => StateSample): void {
  if (audit) audit(build());
}

const ALIAS = /\b(?:g|st|m|f|sh)\d{1,3}\b/g;

/** Aliases the model can address, read back out of the block that offered them. */
export function aliasesIn(text: string): string[] {
  return [...new Set(text.match(ALIAS) ?? [])];
}

const WORDISH = /[\p{L}\p{N}]/u;

/**
 * Does `needle` stand in `haystack` as a word of its own? Case-insensitive, and bounded on
 * each side that is itself a letter or digit: "Mathe" must not count as found inside
 * "Mathearbeit", or the shortest datum would collect every longer one's hits.
 *
 * It errs towards missing a reference, never towards inventing one: a German compound
 * ("Mathehausaufgabe") built around a datum is not counted, and neither is a paraphrase.
 */
export function occursIn(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  for (let at = h.indexOf(n); at >= 0; at = h.indexOf(n, at + 1)) {
    const before = at > 0 ? h[at - 1]! : '';
    const after = at + n.length < h.length ? h[at + n.length]! : '';
    const leftFree = !WORDISH.test(n[0]!) || before === '' || !WORDISH.test(before);
    const rightFree = !WORDISH.test(n[n.length - 1]!) || after === '' || !WORDISH.test(after);
    if (leftFree && rightFree) return true;
  }
  return false;
}

const keep = (xs: Array<string | null | undefined>): string[] =>
  [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.trim().length >= 3))].map(
    (x) => x.trim(),
  );

/**
 * What each block puts in front of the model, read from the rows it renders — not parsed back
 * out of the text, so a title with a comma or a quote in it cannot be mangled. Kept honest by
 * `__tests__/blocks.test.ts`: every string here must really occur in its own block's text, or
 * the attribution has drifted away from context.ts and the test fails.
 */
export function blockData(
  state: BuddyState,
  learner: { display_name: string },
): Record<BlockName, string[]> {
  const permanent = state.memories.filter((m) => m.kind !== 'constraint');
  const temporary = state.memories.filter((m) => m.kind === 'constraint');
  const prepared = state.steps.filter(
    (s) => s.kind === 'practice' && s.state === 'prepared' && (s.payload.item_ids?.length ?? 0) > 0,
  );
  return {
    learner: keep([learner.display_name]),
    knows: keep(permanent.map((m) => m.statement)),
    temporary: keep(temporary.map((m) => m.statement)),
    voice: [],
    contact: [],
    earlier: keep(state.summaries.flatMap((s) => [s.summary, ...s.topics])),
    material: keep([
      ...state.subjects.map((s) => s.name),
      ...state.topics.map((t) => t.topic),
      ...state.materials.map((m) => m.title),
    ]),
    goals: keep([
      ...state.goals.map((g) => g.title),
      ...state.goals.flatMap((g) => g.topics),
      ...state.steps.map((s) => s.title),
    ]),
    practice: keep([
      state.focus?.material_title,
      state.focus?.subject_name,
      state.focus?.goal_title,
      state.focus?.said,
      // Three sessions, and only their shaky topics: that is what context.ts prints of a
      // session — the secure ones travel in the material block, not here.
      ...state.sessions.slice(0, 3).flatMap((s) => s.shaky_topics),
      // Her questions kept for after practice (issue #391), as context.ts prints them.
      ...state.later
        .filter((n) => n.recall_block === null)
        .flatMap((n) => [n.text, n.session_title]),
    ]),
    waiting: keep([...state.standing.map((o) => o.text), ...prepared.map((s) => s.title)]),
    now: [],
    note: [],
  };
}

/**
 * Which blocks the model's own words point back at, and which strings were the evidence.
 *
 * A string that two blocks both offer (a subject name stands in `material` and next to a goal
 * in `goals`; a prepared step's alias stands in `goals` and in `waiting`) proves nothing about
 * which of them was read: it is counted for neither and listed under `shared`, so the table
 * never silently credits one block with another's content.
 */
export function referencedBlocks(
  blocks: readonly BlockSample[],
  output: string,
): { byBlock: Partial<Record<BlockName, string[]>>; shared: string[] } {
  const owners = new Map<string, BlockName[]>();
  for (const b of blocks) {
    for (const d of b.data) {
      const at = owners.get(d);
      if (at) at.push(b.name);
      else owners.set(d, [b.name]);
    }
  }
  const byBlock: Partial<Record<BlockName, string[]>> = {};
  const shared: string[] = [];
  for (const [datum, where] of owners) {
    if (!occursIn(output, datum)) continue;
    if (where.length > 1) {
      shared.push(datum);
      continue;
    }
    const name = where[0]!;
    (byBlock[name] ??= []).push(datum);
  }
  return { byBlock, shared };
}
