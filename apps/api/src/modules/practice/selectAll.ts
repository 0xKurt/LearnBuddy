// Mehrfachauswahl mit mehreren richtigen Antworten (issue #240): "Kreuze alle richtigen an".
// docs/architecture.md §Practice ("Structured items" → "Select all").
//
// A structured kind like order and match (`structured.ts` dispatches here), not a second meaning
// of `multiple_choice`: a single choice is tapped and judged at once by its index; a set is
// collected and sent with "Prüfen" as `parts`, with the key that never leaves the server.
//
// Both directions of #224's "Regel 0", both code:
//
//   1. What the MODEL wrote is checked before it is stored, and a draft that fails gives no
//      question — nothing is repaired: 3–6 options, at least two right and at least one wrong
//      (one right is ordinary multiple choice, all right is no question), no two options alike
//      as written or by value ("0,5" and "1/2", `sameOption` — the one check multiple choice
//      uses too), and nothing over the caps a 360×740 phone holds (`contracts/structured.ts`).
//      The model only marks each option right or not; ids, display order and key are code's
//      (CLAUDE.md rule 2).
//   2. What SHE answers is the set she ticked, compared with the key as a set. The reply counts
//      what she found and what does not belong — never which right one is missing, that would
//      be the answer.

import {
  SELECT_LONG_MAX,
  SELECT_MAX,
  SELECT_MIN,
  SELECT_OPTION_MAX,
  SELECT_PROMPT_MAX,
  SELECT_RIGHT_MIN,
  SELECT_SHORT_CHARS,
  SELECT_SHORT_MATH_CHARS,
  SelectAllTask,
  type PartId,
  type SelectAllAnswer,
} from '@learnbuddy/shared-types/contracts';
import { plainMath } from '@learnbuddy/shared-math';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { idAt, sameness, shuffleWhere } from './arrange.js';
import { sameOption } from './choiceCheck.js';
import { dollarMathRuns } from './dollarMath.js';
import { ItemDraft } from './items.js';
import { mentionsSolution } from './tutor.js';

/** How the ticked options stand in a row, in the conversation and in the solution. */
const SELECT_JOIN = '; ';

/**
 * What the generator and the photo reading are told about select-all tasks. Exact and minimal,
 * and deliberately without an example sentence: models copy examples (repo convention).
 */
export const SELECT_RULES = `Select-all tasks ("structured", type "select_all"): only for a question with SEVERAL right answers among given options ("tick all that apply"). ${SELECT_MIN}–${SELECT_MAX} options when every option has at most ${SELECT_SHORT_CHARS} characters, otherwise ${SELECT_MIN}–${SELECT_LONG_MAX}; an option is a word, a form or a short statement of at most ${SELECT_OPTION_MAX} characters; correct true for every right one. At least ${SELECT_RIGHT_MIN} right and at least one wrong; a question with exactly one right answer is an ordinary multiple_choice item, never this. No two options alike, none that is right or wrong only depending on how it is read, and no option about the other options ("all of them", "none of these"). The app shuffles them. prompt: the question, at most ${SELECT_PROMPT_MAX} characters; it never lists the options and never says how many are right.`;

/** Parsed generously: an option over its cap is a counted rejection (`too_long`), not a parse error. */
const SelectText = z
  .string()
  .trim()
  .min(1)
  .max(SELECT_OPTION_MAX * 2);

/** The model's select-all task: the options, each marked right or not — code builds the rest. */
export const SelectDraftBase = z.object({
  type: z.literal('select_all'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(SELECT_PROMPT_MAX * 4)
    .describe(
      `The question, at most ${SELECT_PROMPT_MAX} characters; never the options, never how many are right`,
    ),
  options: z
    .array(z.object({ text: SelectText, correct: z.boolean() }))
    .max(SELECT_MAX * 2)
    .describe(
      `${SELECT_MIN}–${SELECT_MAX} options; at least ${SELECT_RIGHT_MIN} with correct true and at least one with correct false`,
    ),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});

export type SelectDraft = Pick<z.infer<typeof SelectDraftBase>, 'options'> & {
  /** Checked when given: the question that stands above the options. */
  prompt?: string;
};

/** Why a select-all draft or task is not stored. Each one is a test (`select-all.test.ts`). */
export type SelectProblem =
  /** Fewer than SELECT_MIN, or more than fit (SELECT_MAX short ones, SELECT_LONG_MAX longer). */
  | 'count'
  /** Two options alike, as written or by value, or an empty one. */
  | 'duplicate'
  /** An option or the question over its cap: it would not fit the phone without scrolling. */
  | 'too_long'
  /** Fewer than SELECT_RIGHT_MIN right options, or every option right. */
  | 'right_count'
  /** A stored key that names an option twice or one that is not there. */
  | 'not_mapping';

/** An option that is nothing but one piece of math — the app sets it larger. */
function mathOnly(text: string): boolean {
  return /^\s*\$[^$]+\$\s*$/.test(text);
}

/** An option that stands in ONE line of half a 360-pt phone (the app's grid, issue #203). */
function shortOption(text: string): boolean {
  const max = mathOnly(text) ? SELECT_SHORT_MATH_CHARS : SELECT_SHORT_CHARS;
  return plainMath(text).trim().length <= max;
}

/** What is wrong with a list of options and their marks, or null. Shared by draft and task. */
function optionsProblem(
  options: ReadonlyArray<{ text: string; right: boolean }>,
): SelectProblem | null {
  if (options.some((o) => plainMath(o.text).trim().length > SELECT_OPTION_MAX)) return 'too_long';
  // Six fit two by two; once one is longer they stand one under the other, and four fit.
  const max = options.every((o) => shortOption(o.text)) ? SELECT_MAX : SELECT_LONG_MAX;
  if (options.length < SELECT_MIN || options.length > max) return 'count';
  for (let i = 0; i < options.length; i++) {
    if (sameness(options[i]!.text) === '') return 'duplicate';
    for (let j = 0; j < i; j++) {
      if (sameOption(options[i]!.text, options[j]!.text)) return 'duplicate';
    }
  }
  const right = options.filter((o) => o.right).length;
  if (right < SELECT_RIGHT_MIN || right === options.length) return 'right_count';
  return null;
}

/** What is wrong with the model's select-all draft, or null. */
export function selectDraftProblem(draft: SelectDraft): SelectProblem | null {
  if (draft.prompt !== undefined && plainMath(draft.prompt).trim().length > SELECT_PROMPT_MAX) {
    return 'too_long';
  }
  return optionsProblem(draft.options.map((o) => ({ text: o.text, right: o.correct })));
}

/** What is wrong with a select-all task (stored or built), or null. */
export function selectProblem(task: SelectAllTask): SelectProblem | null {
  const ids = new Set(task.options.map((o) => o.id));
  if (ids.size !== task.options.length) return 'not_mapping';
  if (new Set(task.key).size !== task.key.length || !task.key.every((id) => ids.has(id))) {
    return 'not_mapping';
  }
  const key = new Set(task.key);
  return optionsProblem(task.options.map((o) => ({ text: o.text, right: key.has(o.id) })));
}

/**
 * The stored task for the model's marked options, or null when Regel 0 rejects it. The display
 * order is a shuffle that is the same for the same content, and it never puts every right option
 * first — the order the model wrote them in would often be the solution laid out.
 */
export function selectTaskFrom(draft: SelectDraft): SelectAllTask | null {
  if (selectDraftProblem(draft) !== null) return null;
  const options = draft.options.map((o) => ({
    text: dollarMathRuns(o.text.trim()),
    right: o.correct,
  }));
  const seed = ['select_all', ...options.map((o) => `${o.text}\u0001${o.right ? 1 : 0}`)].join(
    '\u0000',
  );
  const rightCount = options.filter((o) => o.right).length;
  const shown = shuffleWhere(options.length, seed, (idx) =>
    // Some wrong option stands among the first `rightCount` places.
    idx.slice(0, rightCount).some((i) => !options[i]!.right),
  );
  if (!shown) return null;
  const parsed = SelectAllTask.safeParse({
    type: 'select_all',
    options: shown.map((oi, p) => ({ id: idAt(p), text: options[oi]!.text })),
    key: shown.flatMap((oi, p) => (options[oi]!.right ? [idAt(p)] : [])),
  });
  if (!parsed.success) return null;
  return selectProblem(parsed.data) === null ? parsed.data : null;
}

/** The words of a text, compared like options are (`sameness`), markup and marks set aside. */
function wordsOf(text: string): Set<string> {
  return new Set(
    sameness(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

/**
 * Does a hint name an option? Then it says whether that option is right, and a hint must never
 * do that. Named means: the whole option (the check every prepared hint goes through), or a word
 * of at least four letters that belongs to this option alone — not to another option and not to
 * the question — like "Klingel" for "Eine helltönende Klingel". A word several options share
 * ("Singular") says nothing about one of them.
 */
export function namesAnOption(hint: string, task: SelectAllTask, prompt: string): boolean {
  const said = wordsOf(hint);
  const asked = wordsOf(prompt);
  const words = task.options.map((o) => wordsOf(o.text));
  return task.options.some((o, i) => {
    if (mentionsSolution(hint, o.text, prompt)) return true;
    return [...words[i]!].some(
      (w) =>
        w.length >= 4 &&
        said.has(w) &&
        !asked.has(w) &&
        words.every((other, j) => j === i || !other.has(w)),
    );
  });
}

/** Options by id, in the order she sees them, as one line ("Genitiv Sg.; Dativ Sg."). */
export function selectText(task: SelectAllTask, ids: readonly PartId[]): string {
  const set = new Set(ids);
  return task.options
    .filter((o) => set.has(o.id))
    .map((o) => o.text)
    .join(SELECT_JOIN);
}

/** How many right ones she found, and how many she ticked that are not. */
export type SelectCheck = {
  type: 'select_all';
  correct: boolean;
  /** Per option, in the order she sees them: ticked exactly when it is right? */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** Right options she ticked. */
  found: number;
  /** Right options there are. */
  total: number;
  /** Options she ticked that are not right. */
  extra: number;
  /** The first option (as shown) she ticked and that is not right, or null. */
  first_extra_text: string | null;
};

/** Her set against the key; null when she ticked an option twice or one that is not there. */
export function checkSelect(task: SelectAllTask, answer: SelectAllAnswer): SelectCheck | null {
  const ids = new Set(task.options.map((o) => o.id));
  const chosen = new Set(answer.chosen);
  if (chosen.size !== answer.chosen.length || ![...chosen].every((id) => ids.has(id))) return null;
  const key = new Set(task.key);
  const parts = task.options.map((o) => ({ id: o.id, ok: chosen.has(o.id) === key.has(o.id) }));
  const extras = task.options.filter((o) => chosen.has(o.id) && !key.has(o.id));
  return {
    type: 'select_all',
    correct: parts.every((p) => p.ok),
    parts,
    found: task.key.filter((id) => chosen.has(id)).length,
    total: key.size,
    extra: extras.length,
    first_extra_text: extras[0]?.text ?? null,
  };
}

/**
 * From the second miss on, the reply names one option she ticked that does not belong — the next
 * rung of the hint ladder, so it counts as help (`structuredNamesPart`). A right one she missed
 * is never named.
 */
export function selectNamesPart(check: SelectCheck, priorMisses: number): boolean {
  return !check.correct && priorMisses >= 1 && check.first_extra_text !== null;
}

/** The reply to a wrong set: counted, never harsh — what she found, then what does not belong. */
export function selectReply(locale: string, check: SelectCheck, priorMisses: number): string {
  const found =
    check.found === 0
      ? t(locale, 'practice.select.none')
      : check.found === check.total
        ? t(locale, 'practice.select.all_found')
        : t(locale, 'practice.select.found_some', { count: check.found, total: check.total });
  const extra =
    check.extra === 0 || check.found === 0
      ? ''
      : ` ${t(locale, 'practice.select.extra', { count: check.extra })}`;
  return selectNamesPart(check, priorMisses) && check.first_extra_text !== null
    ? `${found}${extra} ${t(locale, 'practice.select.look_at', { text: check.first_extra_text })}`
    : `${found}${extra}`;
}
