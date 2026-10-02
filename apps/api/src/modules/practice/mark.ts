// Markieren (issue #234): she taps words, the gaps between words or the cuts between syllables.
// docs/architecture.md §Practice ("Structured items").
//
// Both directions of #224's "Regel 0", in code:
//
//   1. What the MODEL wrote is checked before it is stored, and a task that fails gives no
//      question (nothing is repaired). Code splits the text into words — the model never says
//      where a word stands. The model NAMES the words to mark; code finds them, and a word that
//      stands in the text twice needs its occurrence, or the task is ambiguous and dropped. A
//      named word that is not in the text drops the task too. An error text's corrected version
//      must differ from the text at exactly the marked words. Commas are found by code in the
//      sentence the model wrote with them; syllables by code in the words it wrote with hyphens.
//   2. What SHE marked is compared with the key as a set — 0 model calls per answer — and the
//      reply counts: "2 richtig, 1 fehlt noch, 1 zu viel".
//
// What code cannot check, and does not pretend to: whether the model's syllables are the right
// ones and whether a word is really the subject. Those are the model's knowledge; code checks
// that what it wrote is one unambiguous task about this very text.

import {
  cutId,
  gapId,
  MARK_AFFIX_MAX,
  MARK_CATEGORIES_MAX,
  MARK_CATEGORIES_MIN,
  MARK_CATEGORY_MAX,
  MARK_PROMPT_MAX,
  MARK_SORTED_WORDS_MAX,
  MARK_SYLLABLE_LETTERS_MAX,
  MARK_SYLLABLE_WORDS_MAX,
  MARK_WORD_MAX,
  MARK_WORDS_MAX,
  MARK_WORDS_MIN,
  MarkMode,
  StructuredTask,
  type MarkAnswer,
  type MarkCategory,
  type MarkPick,
  type MarkTask,
  type MarkTaskView,
  type MarkWord,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft } from './items.js';

// ─────────────── what the model may write ───────────────

/**
 * What the generator and the photo reading are told about marking tasks. Exact and minimal,
 * without an example sentence (models copy examples — repo convention).
 */
export const MARK_RULES = `Marking tasks ("structured", type "mark"): the learner TAPS places in a short text — words (parts of speech, the nouns of a text written all in lower case, sentence parts, signal words, the wrong words of an error text), the gaps where commas belong, or the cuts between syllables. mode "words": text is the sentence(s) exactly as she sees them, ${MARK_WORDS_MIN}–${MARK_WORDS_MAX} words; targets lists every word (or group of adjacent words) to be marked, each written exactly as in the text, with occurrence = which occurrence (1, 2 …) when that word stands in the text more than once, else null. categories: null, or ${MARK_CATEGORIES_MIN}–${MARK_CATEGORIES_MAX} short names (at most ${MARK_CATEGORY_MAX} characters) when each target belongs to one of them — then every target names its category, every category is used and the text has at most ${MARK_SORTED_WORDS_MAX} words. An error text: corrected is the same text with every error fixed, word for word, and targets are exactly the wrong words; otherwise corrected is null. mode "gaps": text is the sentence WITH every comma correctly placed — the app removes them and she taps where they belong; targets, categories and corrected null. mode "syllables": text is 1–${MARK_SYLLABLE_WORDS_MAX} words separated by spaces, letters only, at most ${MARK_SYLLABLE_LETTERS_MAX} letters each, with a hyphen at every syllable boundary; targets, categories and corrected null. The prompt (at most ${MARK_PROMPT_MAX} characters) says what to mark and never names the answer. Only a task with exactly one right set of marks.`;

const MarkTarget = z.object({
  word: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('The word (or adjacent words) to mark, exactly as written in the text'),
  occurrence: z
    .number()
    .int()
    .min(1)
    .max(MARK_WORDS_MAX)
    .nullable()
    .default(null)
    .describe('Which occurrence when it stands in the text more than once; else null'),
  category: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .nullable()
    .default(null)
    .describe('Its category when the task has categories; else null'),
});

/** The model's marking task: the text and what to mark in it — never a position. */
export const MarkDraftBase = z.object({
  type: z.literal('mark'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .describe('The instruction: what to mark; never the answer'),
  mode: MarkMode,
  text: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe(
      'words: the text as she sees it · gaps: the sentence WITH its commas · syllables: the words with hyphens at every syllable boundary',
    ),
  targets: z
    .array(MarkTarget)
    .max(MARK_WORDS_MAX * 2)
    .nullable()
    .default(null)
    .describe('mode words: what to mark; null for gaps and syllables'),
  categories: z
    .array(z.string().trim().min(1).max(40))
    .max(MARK_CATEGORIES_MAX * 2)
    .nullable()
    .default(null)
    .describe(
      `mode words only: ${MARK_CATEGORIES_MIN}–${MARK_CATEGORIES_MAX} category names, or null`,
    ),
  corrected: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .nullable()
    .default(null)
    .describe('An error text only: the same text with every error fixed; else null'),
  topic: ItemDraft.shape.topic,
  difficulty: ItemDraft.shape.difficulty,
  prompt_lang: ItemDraft.shape.prompt_lang,
});
export type MarkDraft = Pick<
  z.infer<typeof MarkDraftBase>,
  'mode' | 'text' | 'targets' | 'categories' | 'corrected'
> & {
  /** Checked when given: the instruction above the text. */
  prompt?: string;
};

// ─────────────── Regel 0: what the model wrote, checked ───────────────

/** Why a marking task is not stored. Each one is a test (`__tests__/mark.test.ts`). */
export type MarkProblem =
  /** Too few or too many words, no target at all, or a category list of the wrong size. */
  | 'count'
  /** A word, a prompt, a category name or the punctuation around a word over its cap. */
  | 'too_long'
  /** A named word that does not stand in the text (or not that often). */
  | 'not_in_text'
  /** A word that stands in the text more than once without its occurrence, or one place twice. */
  | 'ambiguous'
  /** Fields that do not belong to the mode (targets for commas, categories without targets). */
  | 'form'
  /** A category nothing belongs to, or a target with a category the task does not have. */
  | 'empty_group'
  /** The corrected text does not differ from the text at exactly the marked words. */
  | 'correction'
  /** A syllable word that is not letters and hyphens, or an empty syllable. */
  | 'not_letters';

/** Letters and digits: what makes a stretch of text a word. */
const WORDISH = /[\p{L}\p{N}]/u;

type Split = Omit<MarkWord, 'id'>;

/**
 * The text as words, each with the marks around it — or null when a word or its punctuation is
 * over its cap. Pure mechanics: whitespace separates, letters and digits make the word, every
 * other character before or after it is shown with it and never tapped. A dash standing alone
 * joins the word before it.
 */
export function splitWords(text: string): Split[] | null {
  const out: Split[] = [];
  let pendingLead = '';
  for (const chunk of text.normalize('NFC').split(/\s+/).filter(Boolean)) {
    if (!WORDISH.test(chunk)) {
      // Punctuation on its own ("–", "…"): it belongs to the word before it.
      if (out.length > 0) out[out.length - 1]!.tail += ` ${chunk}`;
      else pendingLead += chunk;
      continue;
    }
    const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(chunk);
    if (!m) return null;
    out.push({ lead: pendingLead + (m[1] ?? ''), text: m[2] ?? '', tail: m[3] ?? '' });
    pendingLead = '';
  }
  for (const w of out) {
    if ([...w.text].length > MARK_WORD_MAX) return null;
    if (w.lead.length > MARK_AFFIX_MAX || w.tail.length > MARK_AFFIX_MAX) return null;
  }
  return out;
}

/** How two words are compared when the model names one: case and form of letters set aside. */
function fold(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase();
}

/** The words of a target ("der Hund" → ["der", "Hund"]), without the punctuation around them. */
function targetWords(word: string): string[] {
  return (splitWords(word) ?? []).map((w) => w.text);
}

/**
 * The positions of every occurrence of `seq` (consecutive words) in `words`, compared without
 * case: "Der" and "der" are the same word to find, so naming one of them without an occurrence
 * is ambiguous when both stand there.
 */
function occurrences(words: readonly Split[], seq: readonly string[]): number[] {
  const want = seq.map(fold);
  const at: number[] = [];
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => fold(words[i + k]!.text) === w)) at.push(i);
  }
  return at;
}

/** The checked parts of a draft, from which the task is built (or why there is none). */
type Built =
  | { problem: MarkProblem }
  | {
      problem: null;
      words: Split[];
      categories: string[];
      key: Array<{ at: PartId; category: number | null }>;
      corrections: Array<{ at: PartId; text: string }>;
    };

function buildWords(draft: MarkDraft): Built {
  const words = splitWords(draft.text);
  if (!words) return { problem: 'too_long' };
  if (words.length < MARK_WORDS_MIN || words.length > MARK_WORDS_MAX) return { problem: 'count' };
  const targets = draft.targets ?? [];
  if (targets.length === 0) return { problem: 'count' };
  const categories = (draft.categories ?? []).map((c) => c.trim());
  if (categories.length > 0) {
    if (categories.length < MARK_CATEGORIES_MIN || categories.length > MARK_CATEGORIES_MAX) {
      return { problem: 'count' };
    }
    if (words.length > MARK_SORTED_WORDS_MAX) return { problem: 'count' };
    if (categories.some((c) => c.length > MARK_CATEGORY_MAX)) return { problem: 'too_long' };
    if (new Set(categories.map(fold)).size !== categories.length) return { problem: 'ambiguous' };
    // An error text has nothing to sort: its marks are the errors.
    if (draft.corrected !== null) return { problem: 'form' };
  }
  const catIndex = new Map(categories.map((c, i) => [fold(c), i]));
  const marked = new Map<number, number | null>();
  for (const target of targets) {
    const seq = targetWords(target.word);
    if (seq.length === 0) return { problem: 'not_in_text' };
    const found = occurrences(words, seq);
    if (found.length === 0) return { problem: 'not_in_text' };
    let start: number;
    if (target.occurrence === null) {
      if (found.length > 1) return { problem: 'ambiguous' };
      start = found[0]!;
    } else {
      const at = found[target.occurrence - 1];
      if (at === undefined) return { problem: 'not_in_text' };
      start = at;
    }
    let category: number | null = null;
    if (categories.length > 0) {
      const c = target.category === null ? undefined : catIndex.get(fold(target.category));
      if (c === undefined) return { problem: 'empty_group' };
      category = c;
    } else if (target.category !== null) {
      return { problem: 'form' };
    }
    for (let k = 0; k < seq.length; k++) {
      // One place marked twice (or in two categories) is no single right answer.
      if (marked.has(start + k)) return { problem: 'ambiguous' };
      marked.set(start + k, category);
    }
  }
  if (categories.length > 0) {
    const used = new Set(marked.values());
    if (categories.some((_, i) => !used.has(i))) return { problem: 'empty_group' };
  }
  const corrections: Array<{ at: PartId; text: string }> = [];
  if (draft.corrected !== null) {
    // An error text: the corrected version differs from the text at exactly the marked words.
    const fixed = splitWords(draft.corrected);
    if (!fixed || fixed.length !== words.length) return { problem: 'correction' };
    const differs = new Set<number>();
    words.forEach((w, i) => {
      if (w.text.normalize('NFC') !== fixed[i]!.text.normalize('NFC')) differs.add(i);
    });
    const markedAt = [...marked.keys()];
    if (differs.size !== markedAt.length || !markedAt.every((i) => differs.has(i))) {
      return { problem: 'correction' };
    }
    for (const i of [...differs].sort((a, b) => a - b)) {
      corrections.push({ at: wordId(i), text: fixed[i]!.text });
    }
  }
  const key = [...marked.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, category]) => ({ at: wordId(i), category }));
  return { problem: null, words, categories, key, corrections };
}

function buildGaps(draft: MarkDraft): Built {
  if (draft.targets !== null || draft.categories !== null || draft.corrected !== null) {
    return { problem: 'form' };
  }
  const words = splitWords(draft.text);
  if (!words) return { problem: 'too_long' };
  if (words.length < MARK_WORDS_MIN || words.length > MARK_WORDS_MAX) return { problem: 'count' };
  const key: Array<{ at: PartId; category: number | null }> = [];
  words.forEach((w, i) => {
    if (!w.tail.includes(',')) return;
    // A comma after the last word belongs to no gap she could tap.
    if (i < words.length - 1) key.push({ at: gapId(i), category: null });
  });
  if (words[words.length - 1]!.tail.includes(',')) return { problem: 'form' };
  if (key.length === 0) return { problem: 'count' };
  // She sees the sentence without the commas she has to set.
  const shown = words.map((w) => ({ ...w, tail: w.tail.replace(/,/g, '') }));
  return { problem: null, words: shown, categories: [], key, corrections: [] };
}

function buildSyllables(draft: MarkDraft): Built {
  if (draft.targets !== null || draft.categories !== null || draft.corrected !== null) {
    return { problem: 'form' };
  }
  const chunks = draft.text.normalize('NFC').split(/\s+/).filter(Boolean);
  if (chunks.length < 1 || chunks.length > MARK_SYLLABLE_WORDS_MAX) return { problem: 'count' };
  const words: Split[] = [];
  const key: Array<{ at: PartId; category: number | null }> = [];
  for (const [wi, chunk] of chunks.entries()) {
    if (!/^\p{L}+(?:-\p{L}+)*$/u.test(chunk)) return { problem: 'not_letters' };
    const syllables = chunk.split('-');
    const letters = [...syllables.join('')];
    if (letters.length > MARK_SYLLABLE_LETTERS_MAX) return { problem: 'too_long' };
    let at = 0;
    for (const s of syllables.slice(0, -1)) {
      at += [...s].length;
      key.push({ at: cutId(wi, at), category: null });
    }
    words.push({ lead: '', text: letters.join(''), tail: '' });
  }
  if (key.length === 0) return { problem: 'count' };
  return { problem: null, words, categories: [], key, corrections: [] };
}

function build(draft: MarkDraft): Built {
  if (draft.prompt !== undefined && draft.prompt.trim().length > MARK_PROMPT_MAX) {
    return { problem: 'too_long' };
  }
  switch (draft.mode) {
    case 'words':
      return buildWords(draft);
    case 'gaps':
      return buildGaps(draft);
    case 'syllables':
      return buildSyllables(draft);
  }
}

/** What is wrong with the model's marking task, or null when it is one clear task. */
export function markDraftProblem(draft: MarkDraft): MarkProblem | null {
  return build(draft).problem;
}

/** Word ids by position: w1, w2 … */
function wordId(index: number): PartId {
  return `w${index + 1}`;
}

/** Category ids by position: k1, k2 … */
function categoryId(index: number): PartId {
  return `k${index + 1}`;
}

/**
 * The stored task for the model's draft, or null when Regel 0 rejects it. The ids say where a
 * target stands, never whether it is one — every word, gap or cut has one.
 */
export function markTaskFrom(draft: MarkDraft): MarkTask | null {
  const built = build(draft);
  if (built.problem !== null) return null;
  const categories: MarkCategory[] = built.categories.map((name, i) => ({
    id: categoryId(i),
    name,
  }));
  const task: MarkTask = {
    type: 'mark',
    mode: draft.mode,
    words: built.words.map((w, i) => ({ id: wordId(i), ...w })),
    categories,
    key: built.key.map((k) => ({
      at: k.at,
      category: k.category === null ? null : categoryId(k.category),
    })),
    corrections: built.corrections,
  };
  const parsed = StructuredTask.safeParse(task);
  if (!parsed.success || parsed.data.type !== 'mark') return null;
  return markProblem(parsed.data) === null ? parsed.data : null;
}

/** Every place she can tap in this task, in reading order. */
export function markTargets(task: Pick<MarkTask, 'mode' | 'words'>): PartId[] {
  switch (task.mode) {
    case 'words':
      return task.words.map((w) => w.id);
    case 'gaps':
      return task.words.slice(0, -1).map((_, i) => gapId(i));
    case 'syllables':
      return task.words.flatMap((w, wi) =>
        [...w.text].slice(0, -1).map((_, li) => cutId(wi, li + 1)),
      );
  }
}

/** What is wrong with a stored or built marking task, or null when it holds together. */
export function markProblem(task: MarkTask): MarkProblem | null {
  const n = task.words.length;
  if (task.mode === 'syllables') {
    if (n < 1 || n > MARK_SYLLABLE_WORDS_MAX) return 'count';
    if (task.words.some((w) => !/^\p{L}+$/u.test(w.text))) return 'not_letters';
    if (task.words.some((w) => [...w.text].length > MARK_SYLLABLE_LETTERS_MAX)) return 'too_long';
  } else if (n < MARK_WORDS_MIN || n > MARK_WORDS_MAX) {
    return 'count';
  }
  if (task.words.some((w, i) => w.id !== wordId(i))) return 'form';
  if (task.mode !== 'words' && (task.categories.length > 0 || task.corrections.length > 0)) {
    return 'form';
  }
  const cats = task.categories.length;
  if (cats !== 0 && (cats < MARK_CATEGORIES_MIN || cats > MARK_CATEGORIES_MAX)) return 'count';
  if (cats !== 0 && n > MARK_SORTED_WORDS_MAX) return 'count';
  const targets = new Set(markTargets(task));
  const catIds = new Set(task.categories.map((c) => c.id));
  if (task.key.length === 0) return 'count';
  const seen = new Set<string>();
  for (const k of task.key) {
    if (!targets.has(k.at)) return 'not_in_text';
    if (seen.has(k.at)) return 'ambiguous';
    seen.add(k.at);
    if (cats === 0 ? k.category !== null : k.category === null || !catIds.has(k.category)) {
      return 'empty_group';
    }
  }
  if (cats > 0 && task.categories.some((c) => !task.key.some((k) => k.category === c.id))) {
    return 'empty_group';
  }
  if (task.corrections.length > 0) {
    // Exactly the marked words are corrected, each to something else.
    if (task.corrections.length !== task.key.length) return 'correction';
    const byId = new Map(task.words.map((w) => [w.id, w.text]));
    for (const c of task.corrections) {
      if (!seen.has(c.at) || byId.get(c.at) === c.text) return 'correction';
    }
  }
  return null;
}

/** What the app shows: the words and the categories — never the key or the corrections. */
export function markView(task: MarkTask): MarkTaskView {
  return { type: 'mark', mode: task.mode, words: task.words, categories: task.categories };
}

// ─────────────── the task and her marks as text ───────────────

/** Words that stand next to each other in one run ("der Hund"); runs apart with " … ". */
function runsOf(task: MarkTask, ids: ReadonlySet<string>): string {
  const runs: string[][] = [];
  let last = -2;
  task.words.forEach((w, i) => {
    if (!ids.has(w.id)) return;
    if (i === last + 1 && runs.length > 0) runs[runs.length - 1]!.push(w.text);
    else runs.push([w.text]);
    last = i;
  });
  return runs.map((r) => r.join(' ')).join(', ');
}

/** The text with commas set (gaps) or hyphens at the cuts (syllables) where `ids` says. */
function textWith(task: MarkTask, ids: ReadonlySet<string>): string {
  if (task.mode === 'gaps') {
    return task.words
      .map((w, i) => `${w.lead}${w.text}${ids.has(gapId(i)) ? ',' : ''}${w.tail}`)
      .join(' ');
  }
  return task.words
    .map((w, wi) =>
      [...w.text].map((ch, li) => (ids.has(cutId(wi, li + 1)) ? `${ch}-` : ch)).join(''),
    )
    .join(' ');
}

/**
 * Marks as she reads them: "Subjekt: der Hund; Prädikat: bellt", "Hund, Katze", the sentence
 * with its commas, the words with their syllables.
 */
function marksText(task: MarkTask, marks: readonly MarkPick[]): string {
  if (task.mode !== 'words') return textWith(task, new Set(marks.map((m) => m.at)));
  if (task.categories.length === 0) return runsOf(task, new Set(marks.map((m) => m.at)));
  return task.categories
    .map((c) => {
      const ids = new Set(marks.filter((m) => m.category === c.id).map((m) => m.at));
      return ids.size === 0 ? null : `${c.name}: ${runsOf(task, ids)}`;
    })
    .filter((x): x is string => x !== null)
    .join('; ');
}

/** The solution as she reads it. An error text names each error with its correction. */
export function markSolution(task: MarkTask): string {
  if (task.corrections.length > 0) {
    const byId = new Map(task.words.map((w) => [w.id, w.text]));
    return task.corrections.map((c) => `${byId.get(c.at) ?? ''} → ${c.text}`).join(', ');
  }
  return marksText(task, task.key);
}

/** Her marks as they stand in the conversation. */
export function markAnswerText(task: MarkTask, answer: MarkAnswer): string {
  // Nothing marked is an answer too, and the thread shows it as one.
  if (answer.marks.length === 0) return '—';
  return marksText(task, answer.marks);
}

/** The words of the task as one plain text (to find it in a reading text, #233). */
export function markPlainText(task: MarkTask): string {
  return task.words.map((w) => `${w.lead}${w.text}${w.tail}`).join(' ');
}

// ─────────────── Regel 0: her marks, checked ───────────────

export type MarkCheck = {
  type: 'mark';
  correct: boolean;
  /** Per mark she set: is it a key place with the key's category? */
  parts: Array<{ id: PartId; ok: boolean }>;
  /** Key places she marked with the right category. */
  right: number;
  /** Key places she marked, but with another category. */
  misfiled: number;
  /** Key places she did not mark. */
  missing: number;
  /** Places she marked that are not in the key. */
  extra: number;
};

/**
 * Her marks against the key, or null when they do not fit the task (a place that is not one, a
 * place twice, a category the task does not have or lacks) — refused, not graded.
 */
export function checkMark(task: MarkTask, answer: MarkAnswer): MarkCheck | null {
  const targets = new Set(markTargets(task));
  const catIds = new Set(task.categories.map((c) => c.id));
  const given = new Map<string, string | null>();
  for (const m of answer.marks) {
    if (!targets.has(m.at) || given.has(m.at)) return null;
    if (catIds.size === 0 ? m.category !== null : m.category === null || !catIds.has(m.category)) {
      return null;
    }
    given.set(m.at, m.category);
  }
  const want = new Map(task.key.map((k) => [k.at, k.category]));
  let right = 0;
  let misfiled = 0;
  let extra = 0;
  const parts = answer.marks.map((m) => {
    const ok = want.has(m.at) && want.get(m.at) === m.category;
    if (ok) right++;
    else if (want.has(m.at)) misfiled++;
    else extra++;
    return { id: m.at, ok };
  });
  const missing = [...want.keys()].filter((at) => !given.has(at)).length;
  return {
    type: 'mark',
    correct: right === want.size && extra === 0,
    parts,
    right,
    misfiled,
    missing,
    extra,
  };
}

/**
 * The reply to marks that are not right yet: counts, never places ("2 richtig, 1 fehlt noch,
 * 1 zu viel"). Naming a place would solve it for her; the counts tell her where to look.
 */
export function markReply(locale: string, check: MarkCheck): string {
  const parts: string[] = [];
  if (check.right > 0) parts.push(t(locale, 'practice.mark.right', { count: check.right }));
  if (check.misfiled > 0) {
    parts.push(t(locale, 'practice.mark.misfiled', { count: check.misfiled }));
  }
  if (check.missing > 0) parts.push(t(locale, 'practice.mark.missing', { count: check.missing }));
  if (check.extra > 0) parts.push(t(locale, 'practice.mark.extra', { count: check.extra }));
  if (parts.length === 0) return t(locale, 'practice.mark.nothing');
  return t(locale, 'practice.mark.reply', { parts: parts.join(', ') });
}
