// What kind of page a study reading recognised, and what code makes of it (issue #259, #224
// Baustein QUELLE). docs/architecture.md §Material "Corrected tests and the notebook entry".
//
// The model says WHICH source a page is and, for a corrected test, which tasks the teacher
// marked and which new questions it wrote for each. Everything that follows is code (CLAUDE.md
// rule 1): only questions listed under a marked task on a real page are kept, a question that is
// the original task again is dropped, the grade has no field anywhere, the stored transcript is
// built here from the marked tasks alone, and a notebook entry gives at most a handful.

import { MaterialSource } from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { samePrompt } from '../practice/items.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import {
  ExtractionParse,
  ExtractionResult,
  EXTRACT_SYSTEM,
  HOMEWORK_SYSTEM,
  HomeworkExtraction,
  LEAN_RULES,
} from './extract.js';
import { PHOTO_RETENTION_DAYS } from './purge.js';
import { promptVersion } from '../../llm/promptVersion.js';

/** The most questions a notebook entry gives: a short run the next morning, not a sheet. */
const NOTEBOOK_QUESTIONS = 5;

/** The most marked tasks one corrected test may name; a test has rarely more tasks than this. */
const MOST_MARKED = 20;

/**
 * One task the teacher marked as (partly) wrong, and the new questions written for it. The
 * prompts link a question to its task word for word: a question no marked task lists is not
 * practice of a mistake, and is dropped.
 */
const MarkedTask = z.object({
  page: z.number().int().min(1).max(20).describe('Which attached page the task is on'),
  task: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .describe('The task as printed — its instruction and its numbers or words; never points'),
  questions: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(3)
    .describe('The prompts of the new questions written for it, word for word'),
});
type MarkedTask = z.infer<typeof MarkedTask>;

const SOURCE_FIELDS = {
  source: MaterialSource.describe('What kind of page this is').default('sheet').catch('sheet'),
  // As forgiving as the reports around it: one broken entry costs only itself.
  marked: z
    .preprocess(
      (v) => (Array.isArray(v) ? v.filter((t) => MarkedTask.safeParse(t).success) : v),
      z.array(MarkedTask).max(MOST_MARKED),
    )
    .describe('corrected_test only: the tasks marked wrong, with the new questions for each')
    .default([])
    .catch([]),
};

/** The study reading's schema: the sheet's fields plus what kind of page it is. */
const StudyExtraction = ExtractionResult.extend(SOURCE_FIELDS);
/** How every reading is parsed; homework has no source fields and parses as a sheet. */
export const ReadingParse = ExtractionParse.extend(SOURCE_FIELDS);
type Reading = z.infer<typeof ReadingParse>;

/**
 * Appended to the study reading (never to homework, which is helped task by task as printed).
 * Categories, never a filled-in example: a sample task in a prompt comes back as a task of her
 * sheet (the reason NOT_PRACTICABLE_RULES names forms, not sentences).
 */
export const SOURCE_RULES = `SOURCE — decide what kind of page this is and set source:
- "corrected_test": a class test, quiz or exam a teacher has already corrected — correction marks in another colour than the learner's writing (usually red): ticks, crosses, underlining, a corrected word or number, a remark beside a task.
- "notebook_entry": the learner's own notebook entry of a lesson — what was copied from the board or dictated, in an exercise book, usually in the learner's handwriting.
- "sheet": anything else (a worksheet, a textbook page, a vocabulary list). When in doubt, "sheet".

For a corrected_test these rules REPLACE how many questions rule 5 asks for and what they cover:
- marked: every task the teacher marked as wrong or partly wrong — its page and the task as printed (its instruction and its numbers or words, at most 160 characters). A task marked fully right is not named.
- For each marked task write 1–3 NEW questions of the same kind that practise exactly what went wrong there, with OTHER numbers or OTHER words than the task as printed — never the printed task itself and never the learner's own answer. List their prompts, word for word as you wrote them in items or structured, in that task's questions.
- No other questions at all: nothing for tasks that were not marked. reading and unclear stay empty, more_items false.
- extracted_text: only the marked tasks as printed.
- NEVER write the grade, the points, a score, a teacher's remark or a name into ANY field, the title included. There is no place for them.
- Nothing marked wrong: marked and items stay empty.
For a notebook_entry: at most ${NOTEBOOK_QUESTIONS} short questions about what the entry says matters most — what a short unannounced test about the last lesson would ask — and more_items false.
For a sheet: marked stays empty; everything else as above.`;

const numbersOf = (text: string): string =>
  (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => n.replace(',', '.'))
    .sort()
    .join(' ');

const wordsOf = (text: string): string[] => samePrompt(text).match(/\p{L}{2,}/gu) ?? [];

/**
 * Whether a question is a NEW task and not the marked one again (issue #259 "Mechanisch
 * geprüft"): with numbers in the task, the numbers must differ; without, at least one word of
 * the task must be gone. The same text, reworded around the same values, is the same task.
 */
export function differsFromOriginal(prompt: string, original: string): boolean {
  if (samePrompt(prompt) === samePrompt(original)) return false;
  const was = numbersOf(original);
  if (was !== '') return numbersOf(prompt) !== was;
  const now = new Set(wordsOf(prompt));
  return wordsOf(original).some((w) => !now.has(w));
}

/** Only questions a marked task on a real page lists, and only new ones. */
function practiceOfMistakes(x: Reading, marked: MarkedTask[]) {
  const originalOf = new Map<string, string>();
  for (const m of marked) for (const q of m.questions) originalOf.set(samePrompt(q), m.task);
  const keep = (prompt: string): boolean => {
    const original = originalOf.get(samePrompt(prompt));
    return original !== undefined && differsFromOriginal(prompt, original);
  };
  return {
    items: x.items.filter((it) => keep(it.prompt)),
    structured: x.structured.filter((it) => keep(it.prompt)),
  };
}

/**
 * What a reading becomes once code has applied its source. `nothingMarked`: a corrected test with
 * no marked task on any of its pages — nothing to practise (`nothing_marked`), and nothing of it
 * kept. The caller decides it only after the photo was found readable: a blurry test is
 * `unreadable`, not a test without mistakes.
 */
export function applySource(
  x: Reading,
  photoCount: number,
): { reading: Reading; nothingMarked: boolean } {
  if (x.source === 'notebook_entry') {
    const items = x.items.slice(0, NOTEBOOK_QUESTIONS);
    const structured = x.structured.slice(0, NOTEBOOK_QUESTIONS - items.length);
    const reading = { ...x, items, structured, reading: [], marked: [], more_items: false };
    return { reading, nothingMarked: false };
  }
  if (x.source !== 'corrected_test') return { reading: { ...x, marked: [] }, nothingMarked: false };
  const marked = x.marked.filter((m) => m.page <= photoCount);
  return {
    nothingMarked: marked.length === 0,
    reading: {
      ...x,
      ...practiceOfMistakes(x, marked),
      marked,
      reading: [],
      unclear: [],
      more_items: false,
      // Built here, never taken from the model: the faithful transcript of a corrected test
      // holds the grade and the teacher's remarks, and nothing of them may be stored.
      extracted_text: marked.map((m) => `- ${m.task}`).join('\n'),
    },
  };
}

/**
 * How long the photos of a sheet that was read are kept: a corrected test shows a grade and the
 * teacher's remarks, so its photos go right after the reading (no second reading, no figure crop
 * and no unclear spot needs them — `applySource` asks for none).
 */
export function photoRetentionMs(source: MaterialSource): number {
  return source === 'corrected_test' ? 0 : PHOTO_RETENTION_DAYS * 86_400_000;
}

/** This prompt's version: its name and a hash of what it sends (`promptVersion`, #425). */
export const SOURCES_PROMPT_VERSION = promptVersion('sources', SOURCE_RULES);

// The schemas a reading of a sheet goes out with, here beside the study reading's own fields: one
// place for what the extraction sends, and the version it makes (#425). Exported for the schema
// inventory (`evals/schema`, issue #281) too.
export const EXTRACTION_SCHEMA = toJsonSchema(StudyExtraction);
export const HOMEWORK_SCHEMA = toJsonSchema(HomeworkExtraction);
/** The extraction prompt's version: its name and a hash of what it sends (`promptVersion`, #425). */
export const EXTRACT_PROMPT_VERSION = promptVersion(
  'extract',
  EXTRACT_SYSTEM,
  HOMEWORK_SYSTEM,
  LEAN_RULES,
  EXTRACTION_SCHEMA,
  HOMEWORK_SCHEMA,
);
