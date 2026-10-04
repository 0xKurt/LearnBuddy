// Markieren (issue #234): she taps words, the gaps where commas belong or the cuts between
// syllables. docs/architecture.md §Practice ("Structured items" → "Mark"). A structured kind like
// table, match, cloze and select_all: `structured.ts` dispatches here.
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
//   2. What SHE marked is compared with the key as a set — no model call per answer — and the
//      reply counts: "2 richtig, 1 fehlt noch, 1 zu viel". It never names a place.
//
// What code cannot check, and does not pretend to: whether the model's syllables are the right
// ones and whether a word really is the subject. Those are the model's knowledge; code checks
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
  markTargets,
  markedText,
  StructuredTask,
  type MarkAnswer,
  type MarkTask,
  type MarkTaskView,
  type MarkWord,
  type PartId,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t } from '../../i18n/index.js';
import { ItemDraft } from './items.js';
import { mentionsSolution } from './tutor.js';

// ─────────────── what the model may write ───────────────

/**
 * What the generator and the photo reading are told about marking tasks. Exact and minimal,
 * without an example sentence (models copy examples — repo convention).
 */
export const MARK_RULES = `Marking tasks ("structured", type "mark"): the learner TAPS places in a short text — words (the nouns of a text written all in lower case, parts of speech, sentence parts, signal words, the wrong words of an error text), the places where commas belong, or the cuts between syllables. mode "words": text is the sentence(s) exactly as she sees them, ${MARK_WORDS_MIN}–${MARK_WORDS_MAX} words; targets lists every word (or group of adjacent words) to be marked, each written exactly as in the text, with occurrence = which occurrence (1, 2 …) when that word stands in the text more than once, else null. categories: null, or ${MARK_CATEGORIES_MIN}–${MARK_CATEGORIES_MAX} short names (at most ${MARK_CATEGORY_MAX} characters) when each target belongs to one of them — then every target names its category, every category is used and the text has at most ${MARK_SORTED_WORDS_MAX} words. An error text: corrected is the same text with every error fixed, word for word, and targets are exactly the wrong words; otherwise corrected is null. mode "gaps": text is the sentence WITH every comma correctly placed — the app removes them and she taps where they belong; targets, categories and corrected null. mode "syllables": text is 1–${MARK_SYLLABLE_WORDS_MAX} words separated by spaces, letters only, at most ${MARK_SYLLABLE_LETTERS_MAX} letters each, with a hyphen at every syllable boundary; targets, categories and corrected null. The prompt (at most ${MARK_PROMPT_MAX} characters) says what to mark and never names the answer. Only a task with exactly one right set of marks.`;

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
  /** Fields that do not belong to the mode (targets for commas, categories with an error text). */
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

/** How two words are compared when the model names one: case set aside. */
function fold(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase();
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
      /** The places to mark, by id (a word, a gap, a cut), with their category's index. */
      key: Array<{ at: PartId; category: number | null }>;
      corrections: Array<{ at: PartId; text: string }>;
    };

/** The categories of a draft, or why they cannot be. */
function categoriesOf(draft: MarkDraft, words: number): string[] | MarkProblem {
  const categories = (draft.categories ?? []).map((c) => c.trim());
  if (categories.length === 0) return categories;
  if (categories.length < MARK_CATEGORIES_MIN || categories.length > MARK_CATEGORIES_MAX) {
    return 'count';
  }
  if (words > MARK_SORTED_WORDS_MAX) return 'count';
  if (categories.some((c) => c.length > MARK_CATEGORY_MAX)) return 'too_long';
  if (new Set(categories.map(fold)).size !== categories.length) return 'ambiguous';
  // An error text has nothing to sort: its marks are the errors.
  if (draft.corrected !== null) return 'form';
  return categories;
}

/** Where each named target stands, with its category — or why it cannot be found. */
function targetsAt(
  draft: MarkDraft,
  words: readonly Split[],
  categories: readonly string[],
): Map<number, number | null> | MarkProblem {
  const catIndex = new Map(categories.map((c, i) => [fold(c), i]));
  const marked = new Map<number, number | null>();
  for (const target of draft.targets ?? []) {
    const seq = (splitWords(target.word) ?? []).map((w) => w.text);
    if (seq.length === 0) return 'not_in_text';
    const found = occurrences(words, seq);
    const start = target.occurrence === null ? found[0] : found[target.occurrence - 1];
    if (start === undefined) return 'not_in_text';
    if (target.occurrence === null && found.length > 1) return 'ambiguous';
    let category: number | null = null;
    if (categories.length > 0) {
      const c = target.category === null ? undefined : catIndex.get(fold(target.category));
      if (c === undefined) return 'empty_group';
      category = c;
    } else if (target.category !== null) {
      return 'form';
    }
    for (let k = 0; k < seq.length; k++) {
      // One place marked twice (or in two categories) is no single right answer.
      if (marked.has(start + k)) return 'ambiguous';
      marked.set(start + k, category);
    }
  }
  return marked;
}

/** An error text: the words where the corrected version differs — exactly the marked ones. */
function correctionsOf(
  corrected: string,
  words: readonly Split[],
  marked: ReadonlyMap<number, number | null>,
): Array<{ at: PartId; text: string }> | null {
  const fixed = splitWords(corrected);
  if (!fixed || fixed.length !== words.length) return null;
  const differs = words.flatMap((w, i) => (w.text !== fixed[i]!.text ? [i] : []));
  if (differs.length !== marked.size || !differs.every((i) => marked.has(i))) return null;
  return differs.map((i) => ({ at: wordId(i), text: fixed[i]!.text }));
}

function buildWords(draft: MarkDraft): Built {
  const words = splitWords(draft.text);
  if (!words) return { problem: 'too_long' };
  if (words.length < MARK_WORDS_MIN || words.length > MARK_WORDS_MAX) return { problem: 'count' };
  if ((draft.targets ?? []).length === 0) return { problem: 'count' };
  const categories = categoriesOf(draft, words.length);
  if (!Array.isArray(categories)) return { problem: categories };
  const marked = targetsAt(draft, words, categories);
  if (!(marked instanceof Map)) return { problem: marked };
  if (categories.length > 0) {
    const used = new Set(marked.values());
    if (categories.some((_, i) => !used.has(i))) return { problem: 'empty_group' };
  }
  let corrections: Array<{ at: PartId; text: string }> = [];
  if (draft.corrected !== null) {
    const found = correctionsOf(draft.corrected, words, marked);
    if (!found) return { problem: 'correction' };
    corrections = found;
  }
  const key = [...marked.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, category]) => ({ at: wordId(i), category }));
  return { problem: null, words, categories, key, corrections };
}

/** Only `words` carries targets, categories and a correction; the other modes none of them. */
function onlyText(draft: MarkDraft): boolean {
  return draft.targets === null && draft.categories === null && draft.corrected === null;
}

function buildGaps(draft: MarkDraft): Built {
  if (!onlyText(draft)) return { problem: 'form' };
  const words = splitWords(draft.text);
  if (!words) return { problem: 'too_long' };
  if (words.length < MARK_WORDS_MIN || words.length > MARK_WORDS_MAX) return { problem: 'count' };
  // A comma after the last word belongs to no gap she could tap, and one inside a word
  // ("Hund,Katze") to none either.
  if (words[words.length - 1]!.tail.includes(',')) return { problem: 'form' };
  if (words.some((w) => w.text.includes(',') || w.lead.includes(','))) return { problem: 'form' };
  const key = words.flatMap((w, i) =>
    w.tail.includes(',') ? [{ at: gapId(i), category: null }] : [],
  );
  if (key.length === 0) return { problem: 'count' };
  // She sees the sentence without the commas she has to set.
  const shown = words.map((w) => ({ ...w, tail: w.tail.replace(/,/g, '') }));
  return { problem: null, words: shown, categories: [], key, corrections: [] };
}

function buildSyllables(draft: MarkDraft): Built {
  if (!onlyText(draft)) return { problem: 'form' };
  const chunks = draft.text.normalize('NFC').split(/\s+/).filter(Boolean);
  if (chunks.length < 1 || chunks.length > MARK_SYLLABLE_WORDS_MAX) return { problem: 'count' };
  const words: Split[] = [];
  const key: Array<{ at: PartId; category: null }> = [];
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
  const parsed = StructuredTask.safeParse({
    type: 'mark',
    mode: draft.mode,
    words: built.words.map((w, i) => ({ id: wordId(i), ...w })),
    categories: built.categories.map((name, i) => ({ id: categoryId(i), name })),
    key: built.key.map((k) => ({
      at: k.at,
      category: k.category === null ? null : categoryId(k.category),
    })),
    corrections: built.corrections,
  });
  if (!parsed.success || parsed.data.type !== 'mark') return null;
  return markProblem(parsed.data) === null ? parsed.data : null;
}

/** What is wrong with the size and form of a stored task, before its key is looked at. */
function shapeProblem(task: MarkTask): MarkProblem | null {
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
  return null;
}

/** What is wrong with a stored or built marking task, or null when it holds together. */
export function markProblem(task: MarkTask): MarkProblem | null {
  const shape = shapeProblem(task);
  if (shape !== null) return shape;
  if (task.key.length === 0) return 'count';
  const targets = new Set(markTargets(task));
  const catIds = new Set(task.categories.map((c) => c.id));
  const sorted = catIds.size > 0;
  const seen = new Set<string>();
  for (const k of task.key) {
    if (!targets.has(k.at)) return 'not_in_text';
    if (seen.has(k.at)) return 'ambiguous';
    seen.add(k.at);
    if (sorted ? k.category === null || !catIds.has(k.category) : k.category !== null) {
      return 'empty_group';
    }
  }
  if (task.categories.some((c) => !task.key.some((k) => k.category === c.id))) {
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

/** The solution as she reads it. An error text names each error with its correction. */
export function markSolution(task: MarkTask): string {
  if (task.corrections.length === 0) return markedText(task, task.key);
  const byId = new Map(task.words.map((w) => [w.id, w.text]));
  return task.corrections.map((c) => `${byId.get(c.at) ?? ''} → ${c.text}`).join(', ');
}

/** Her marks as they stand in the conversation. */
export function markAnswerText(task: MarkTask, answer: MarkAnswer): string {
  return markedText(task, answer.marks);
}

/** The words of the task as one plain text (to find it in a reading text, #233). */
export function markPlainText(task: MarkTask): string {
  return task.words.map((w) => `${w.lead}${w.text}${w.tail}`).join(' ');
}

/**
 * What a hint must not say (`hints.ts`, `structuredItem`): every word that is to be marked
 * (words), the word a comma belongs after (gaps), every word cut into its syllables
 * (syllables), and the whole solution. The text itself is NOT what she may read here — every
 * target stands in it, so a hint naming one would always pass as "visible".
 */
export function markSecrets(task: MarkTask): string[] {
  const byId = new Map(task.words.map((w) => [w.id, w.text]));
  const own =
    task.mode === 'words'
      ? task.key.map((k) => byId.get(k.at) ?? '')
      : task.mode === 'gaps'
        ? task.key.map((k) => task.words[Number(k.at.slice(1)) - 1]?.text ?? '')
        : markedText(task, task.key).split(' ');
  return [markSolution(task), ...own.filter((s) => s !== '')];
}

/** Does a hint give a mark away? Then it is dropped, as every prepared hint that names the answer. */
export function namesAMark(hint: string, task: MarkTask, prompt: string): boolean {
  return markSecrets(task).some((s) => mentionsSolution(hint, s, prompt));
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
  const counts: Array<[number, 'right' | 'misfiled' | 'missing' | 'extra']> = [
    [check.right, 'right'],
    [check.misfiled, 'misfiled'],
    [check.missing, 'missing'],
    [check.extra, 'extra'],
  ];
  const parts = counts
    .filter(([n]) => n > 0)
    .map(([count, what]) => t(locale, `practice.mark.${what}`, { count }));
  return t(locale, 'practice.mark.reply', { parts: parts.join(', ') });
}
