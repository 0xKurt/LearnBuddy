// Zuordnen (issue #229): each thing to its one partner (pairs) or to its one group (groups).
// docs/architecture.md §Practice ("Structured items"). A structured kind like table, cloze and
// select_all: `structured.ts` dispatches here.
//
// Both directions of #224's "Regel 0", both code:
//
//   1. What the MODEL wrote is checked before it is stored, and a draft that fails gives no
//      question — nothing is repaired: the counts, the caps a 360×740 phone holds, no thing
//      written twice and none linked to two places. The model writes only the correct links;
//      code names the elements, shuffles them (never already solved) and keeps the key.
//   2. What SHE linked is compared with the key link by link. The reply counts first and names
//      the first wrong link only from the second miss on (then it counts as help).

import {
  MATCH_ELEMENT_MAX,
  MATCH_GROUP_TEXT_MAX,
  MATCH_GROUPED_MAX,
  MATCH_GROUPED_MIN,
  MATCH_GROUPS_MAX,
  MATCH_GROUPS_MIN,
  MATCH_PAIRS_MAX,
  MATCH_PAIRS_MIN,
  MATCH_PROMPT_MAX,
  MATCH_WORD_MAX,
  StructuredTask,
  type MatchAnswer,
  type MatchElement,
  type MatchForm,
  type MatchLink,
  type MatchTask,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { plainMath } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { idAt, rightIdAt, sameness, shuffleWhere } from './arrange.js';
import { dollarMathRuns } from './dollarMath.js';
import { ItemDraft } from './items.js';

/** Why a match task is not stored. Each one is a test (`__tests__/match.test.ts`). */
export type MatchProblem =
  /** Too few or too many pairs, groups or things to sort. */
  | 'count'
  /** Two texts that read the same once case, spacing and math markup are set aside. */
  | 'duplicate'
  /** Neither pairs nor groups, or both: which task is meant is a guess. */
  | 'form'
  /** One element linked to two places (a left with two rights, a thing in two groups). */
  | 'ambiguous'
  /** A group nothing belongs to. */
  | 'empty_group'
  /** The key misses a left element, names one twice or names an id that is not there. */
  | 'not_mapping'
  /**
   * A text, a word or the prompt over its cap (MATCH_ELEMENT_MAX, MATCH_GROUP_TEXT_MAX,
   * MATCH_WORD_MAX, MATCH_PROMPT_MAX): it would not fit a 360×740 phone without scrolling.
   */
  | 'too_long';

// ─────────────── what the model may write ───────────────

/**
 * What the generator and the photo reading are told about match items — exact, minimal and
 * without an example sentence, like ORDER_RULES.
 */
export const MATCH_RULES = `Match tasks ("structured", type "match"): only when the learner has to link given things — each thing to its one partner (pairs) or each thing to its one category (groups). Fill exactly one of pairs and groups, the other null. pairs: ${MATCH_PAIRS_MIN}–${MATCH_PAIRS_MAX} correct pairs {left, right}; every left has exactly one right and every right exactly one left. groups: ${MATCH_GROUPS_MIN}–${MATCH_GROUPS_MAX} groups {name, elements}, ${MATCH_GROUPED_MIN}–${MATCH_GROUPED_MAX} elements in all, every element in exactly one group, no group empty. A pair's side has at most ${MATCH_ELEMENT_MAX} characters, a thing to sort and a group's name at most ${MATCH_GROUP_TEXT_MAX}, and no single word more than ${MATCH_WORD_MAX}; no two of them are alike. The prompt has at most ${MATCH_PROMPT_MAX} characters. Write only the correct links; the app shuffles them. prompt: the instruction, saying what goes with what; it never lists the elements. If anything could belong to two places, write no match task.`;

/**
 * Parsed generously on purpose: a text over the caps is not a broken draft but one that does not
 * fit the phone, and `matchDraftProblem` says so by name (`too_long`) instead of the parse
 * silently dropping it.
 */
const MatchText = z.string().trim().min(1).max(80);

/** The model's match task: the correct links, nothing else — code builds key and display. */
export const MatchDraftBase = z.object({
  type: z.literal('match'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: what to link with what; never the elements themselves'),
  pairs: z
    .array(z.object({ left: MatchText, right: MatchText }))
    .max(MATCH_PAIRS_MAX * 2)
    .nullable()
    .default(null)
    .describe(
      `${MATCH_PAIRS_MIN}–${MATCH_PAIRS_MAX} correct pairs; null when the task sorts into groups`,
    ),
  groups: z
    .array(
      z.object({
        name: MatchText,
        elements: z.array(MatchText).max(MATCH_GROUPED_MAX * 2),
      }),
    )
    .max(MATCH_GROUPS_MAX * 2)
    .nullable()
    .default(null)
    .describe(
      `${MATCH_GROUPS_MIN}–${MATCH_GROUPS_MAX} groups with their elements (${MATCH_GROUPED_MIN}–${MATCH_GROUPED_MAX} in all); null when the task pairs`,
    ),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type MatchDraft = Pick<z.infer<typeof MatchDraftBase>, 'pairs' | 'groups'> & {
  /** Checked when given: the instruction that stands above the parts. */
  prompt?: string;
};

export const MatchDraftWithHelp = MatchDraftBase.extend({
  hints: ItemDraft.shape.hints,
  worked_solution: ItemDraft.shape.worked_solution,
});

// ─────────────── match (#229): Regel 0 and the stored task ───────────────

/** How a pair reads as text ("Hund – dog"), and how links and groups stand in a row. */
export const MATCH_PAIR_JOIN = ' – ';
const MATCH_LIST_JOIN = '; ';

/** What is wrong with a match task (stored or built), or null when it holds together. */
export function matchProblem(task: MatchTask): MatchProblem | null {
  const { left, right, key } = task;
  if (task.form === 'pairs') {
    if (left.length < MATCH_PAIRS_MIN || left.length > MATCH_PAIRS_MAX) return 'count';
    if (right.length !== left.length) return 'count';
  } else {
    if (right.length < MATCH_GROUPS_MIN || right.length > MATCH_GROUPS_MAX) return 'count';
    if (left.length < MATCH_GROUPED_MIN || left.length > MATCH_GROUPED_MAX) return 'count';
  }
  const textMax = task.form === 'pairs' ? MATCH_ELEMENT_MAX : MATCH_GROUP_TEXT_MAX;
  if ([...left, ...right].some((e) => !fitsText(e.text, textMax))) return 'too_long';
  // Every text once — across both sides: a thing named like its group or its partner is
  // no task to solve.
  const seen = new Set<string>();
  for (const e of [...left, ...right]) {
    const s = sameness(e.text);
    if (s === '' || seen.has(s)) return 'duplicate';
    seen.add(s);
  }
  const leftIds = new Set(left.map((e) => e.id));
  const rightIds = new Set(right.map((e) => e.id));
  if (leftIds.size !== left.length || rightIds.size !== right.length) return 'not_mapping';
  if ([...leftIds].some((id) => rightIds.has(id))) return 'not_mapping';
  if (key.length !== left.length || new Set(key.map((k) => k.left)).size !== key.length) {
    return 'not_mapping';
  }
  if (!key.every((k) => leftIds.has(k.left) && rightIds.has(k.right))) return 'not_mapping';
  const used = new Map<string, number>();
  for (const k of key) used.set(k.right, (used.get(k.right) ?? 0) + 1);
  if (task.form === 'pairs') {
    // One partner each way: a right with two lefts leaves another right without one.
    if (right.some((r) => used.get(r.id) !== 1)) return 'ambiguous';
  } else if (right.some((g) => !used.has(g.id))) {
    return 'empty_group';
  }
  return null;
}

/** Whether a text fits its cap, and no word in it is longer than a column holds. */
function fitsText(text: string, max: number): boolean {
  const plain = plainMath(text).trim();
  return plain.length <= max && plain.split(/\s+/).every((w) => w.length <= MATCH_WORD_MAX);
}

/**
 * What is wrong with the model's draft before anything is built, or null. The draft is
 * where an ambiguity can still be SEEN (the same thing written to two places); once ids are
 * given it would read as a mere duplicate.
 */
export function matchDraftProblem(draft: MatchDraft): MatchProblem | null {
  const { pairs, groups } = draft;
  if ((pairs === null) === (groups === null)) return 'form';
  if (draft.prompt !== undefined && draft.prompt.trim().length > MATCH_PROMPT_MAX) {
    return 'too_long';
  }
  if (
    pairs !== null &&
    pairs.some((p) => !fitsText(p.left, MATCH_ELEMENT_MAX) || !fitsText(p.right, MATCH_ELEMENT_MAX))
  ) {
    return 'too_long';
  }
  if (
    groups !== null &&
    groups.some(
      (g) =>
        !fitsText(g.name, MATCH_GROUP_TEXT_MAX) ||
        g.elements.some((e) => !fitsText(e, MATCH_GROUP_TEXT_MAX)),
    )
  ) {
    return 'too_long';
  }
  if (pairs !== null) {
    if (pairs.length < MATCH_PAIRS_MIN || pairs.length > MATCH_PAIRS_MAX) return 'count';
    const partnerOf = new Map<string, string>();
    const partnerOfRight = new Map<string, string>();
    for (const p of pairs) {
      const l = sameness(p.left);
      const r = sameness(p.right);
      const lr = partnerOf.get(l);
      const rl = partnerOfRight.get(r);
      if ((lr !== undefined && lr !== r) || (rl !== undefined && rl !== l)) return 'ambiguous';
      if (lr !== undefined) return 'duplicate';
      partnerOf.set(l, r);
      partnerOfRight.set(r, l);
    }
    return null;
  }
  const gs = groups ?? [];
  if (gs.length < MATCH_GROUPS_MIN || gs.length > MATCH_GROUPS_MAX) return 'count';
  if (gs.some((g) => g.elements.length === 0)) return 'empty_group';
  const total = gs.reduce((n, g) => n + g.elements.length, 0);
  if (total < MATCH_GROUPED_MIN || total > MATCH_GROUPED_MAX) return 'count';
  const groupOf = new Map<string, number>();
  for (const [gi, g] of gs.entries()) {
    for (const e of g.elements) {
      const s = sameness(e);
      const before = groupOf.get(s);
      if (before !== undefined) return before === gi ? 'duplicate' : 'ambiguous';
      groupOf.set(s, gi);
    }
  }
  return null;
}

/**
 * The stored task for the model's correct links, or null when Regel 0 rejects it. The
 * display is never already solved: pairs never line up in more than a few rows, and the
 * elements of a grouping never stand sorted by their groups.
 */
export function matchTaskFrom(draft: MatchDraft): MatchTask | null {
  if (matchDraftProblem(draft) !== null) return null;
  const clean = (x: string) => dollarMathRuns(x.trim());
  let form: MatchForm;
  /** In the model's order: each left text and the index of its right. */
  let links: Array<{ text: string; to: number }>;
  let rights: string[];
  if (draft.pairs !== null) {
    form = 'pairs';
    links = draft.pairs.map((p, i) => ({ text: clean(p.left), to: i }));
    rights = draft.pairs.map((p) => clean(p.right));
  } else {
    form = 'groups';
    const groups = draft.groups ?? [];
    rights = groups.map((g) => clean(g.name));
    links = groups.flatMap((g, gi) => g.elements.map((e) => ({ text: clean(e), to: gi })));
  }
  const n = links.length;
  const seed = [form, ...links.map((l) => `${l.text}\u0001${rights[l.to]}`)].join('\u0000');
  // shownLeft[p] = the index (in `links`) of the left element at display position p.
  const shownLeft =
    form === 'pairs'
      ? shuffleWhere(n, seed, () => true)
      : shuffleWhere(n, seed, (idx) => {
          // Sorted by group (every group's elements together, in the groups' order) would be
          // the solution laid out — never that.
          const groupsInRow = idx.map((i) => links[i]!.to);
          return groupsInRow.some((g, i) => i > 0 && g < groupsInRow[i - 1]!);
        });
  if (!shownLeft) return null;
  // Pairs: the right column shuffled too, so that fewer than half of the rows line up.
  const shownRight =
    form === 'pairs'
      ? shuffleWhere(n, `${seed}\u0002`, (idx) => {
          const aligned = shownLeft.filter((li, p) => idx[p] === links[li]!.to).length;
          return aligned * 2 < n;
        })
      : rights.map((_, i) => i);
  if (!shownRight) return null;
  const left: MatchElement[] = shownLeft.map((li, p) => ({ id: idAt(p), text: links[li]!.text }));
  const right: MatchElement[] = shownRight.map((ri, p) => ({
    id: rightIdAt(p),
    text: rights[ri]!,
  }));
  const key: MatchLink[] = shownLeft.map((li, p) => ({
    left: idAt(p),
    right: rightIdAt(shownRight.indexOf(links[li]!.to)),
  }));
  const task: MatchTask = { type: 'match', form, left, right, key };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'match') return null;
  return matchProblem(parsed.data) === null ? parsed.data : null;
}

/** The solution in words: "a – 1; b – 2" for pairs, "Nomen: Haus, Baum; Verben: …" for groups. */
export function matchText(task: MatchTask, links: readonly MatchLink[]): string {
  const leftText = new Map(task.left.map((e) => [e.id, e.text]));
  const rightText = new Map(task.right.map((e) => [e.id, e.text]));
  // In the order she sees the left side, whatever order the links came in.
  const at = new Map(task.left.map((e, i) => [e.id, i]));
  const sorted = [...links].sort((a, b) => (at.get(a.left) ?? 0) - (at.get(b.left) ?? 0));
  if (task.form === 'pairs') {
    return sorted
      .map((k) => `${leftText.get(k.left) ?? ''}${MATCH_PAIR_JOIN}${rightText.get(k.right) ?? ''}`)
      .join(MATCH_LIST_JOIN);
  }
  return task.right
    .map((g) => {
      const members = sorted.filter((k) => k.right === g.id).map((k) => leftText.get(k.left));
      return members.length === 0 ? null : `${g.text}: ${members.join(', ')}`;
    })
    .filter((x): x is string => x !== null)
    .join(MATCH_LIST_JOIN);
}

/** A hint that states a whole correct link (both of its sides) gives that link away. */
export function namesALink(hint: string, task: MatchTask): boolean {
  // Whole words only: "ich" is not named by "sich".
  const words = (x: string) =>
    ` ${sameness(x)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()} `;
  const h = words(hint);
  const textOf = new Map([...task.left, ...task.right].map((e) => [e.id, words(e.text)]));
  return task.key.some((k) => {
    const l = textOf.get(k.left);
    const r = textOf.get(k.right);
    return l !== undefined && r !== undefined && h.includes(l) && h.includes(r);
  });
}

// ─────────────── her answer, checked ───────────────

/** How many links are right, and the first wrong one in her reading order. */
export type MatchCheck = {
  type: 'match';
  form: MatchForm;
  correct: boolean;
  /** Per left element, in the order she sees them: is it linked to its right place? */
  parts: Array<{ id: PartId; ok: boolean }>;
  right: number;
  total: number;
  /** The first left element (as shown) that is linked wrongly, or null. */
  first_wrong_text: string | null;
};

export function checkMatch(task: MatchTask, answer: MatchAnswer): MatchCheck | null {
  const leftIds = new Set(task.left.map((e) => e.id));
  const rightIds = new Set(task.right.map((e) => e.id));
  const given = new Map<string, string>();
  for (const k of answer.links) {
    // Every left element exactly once, to a right one that is there (else: 400, not graded).
    if (!leftIds.has(k.left) || !rightIds.has(k.right) || given.has(k.left)) return null;
    given.set(k.left, k.right);
  }
  if (given.size !== leftIds.size) return null;
  // Pairs are pairs: one right element cannot be the partner of two.
  if (task.form === 'pairs' && new Set(given.values()).size !== given.size) return null;
  const want = new Map(task.key.map((k) => [k.left, k.right]));
  const parts = task.left.map((e) => ({ id: e.id, ok: want.get(e.id) === given.get(e.id) }));
  const right = parts.filter((p) => p.ok).length;
  const wrong = parts.find((p) => !p.ok);
  return {
    type: 'match',
    form: task.form,
    correct: right === parts.length,
    parts,
    right,
    total: parts.length,
    first_wrong_text: wrong ? (task.left.find((e) => e.id === wrong.id)?.text ?? null) : null,
  };
}

/**
 * Does the reply to this wrong answer name the wrong link? From the second miss on — the next
 * rung of the hint ladder, so it counts as help (`structuredNamesPart`).
 */
export function matchNamesPart(check: MatchCheck, priorMisses: number): boolean {
  return !check.correct && priorMisses >= 1;
}

/** The reply to a wrong match: first the count ("4 von 5 Paaren stimmen"), later which one. */
export function matchReply(locale: string, check: MatchCheck, priorMisses: number): string {
  const pairs = check.form === 'pairs';
  const base =
    check.right === 0
      ? t(locale, pairs ? 'practice.match.pairs_none' : 'practice.match.groups_none')
      : t(locale, pairs ? 'practice.match.pairs_some' : 'practice.match.groups_some', {
          count: check.right,
          total: check.total,
        });
  return matchNamesPart(check, priorMisses) && check.first_wrong_text !== null
    ? `${base} ${t(locale, 'practice.match.look_at', { text: check.first_wrong_text })}`
    : base;
}
