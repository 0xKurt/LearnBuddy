// Reading photographed material into questions. docs/architecture.md §Material.
// One structured model call per material; the answer is validated item by
// item (broken items are dropped, not "repaired").

import { z } from 'zod';

import { FIGURE_RULES, ItemDraft, MATH_RULES } from '../practice/items.js';

export const EXTRACT_PROMPT_VERSION = 'extract.v3.5';

const SUBJECT_KINDS = [
  'math',
  'physics',
  'chemistry',
  'biology',
  'geography',
  'history',
  'german',
  'english',
  'french',
  'spanish',
  'latin',
  'other_language',
  'religion_ethics',
  'art_music',
  'computer_science',
  'economics',
  'social_studies',
  'other',
] as const;

/**
 * How well one photo could be read. Lena is told about every page that was not
 * (fully) read, so she can photograph exactly that page again; a page nobody
 * mentions is never silently lost (docs/architecture.md §Material).
 */
export const PAGE_PROBLEMS = [
  'cut_off',
  'blurry',
  'dark',
  'glare',
  'covered',
  'not_material',
  'other',
] as const;
export const PageReport = z.object({
  page: z.number().int().min(1).max(20).describe('Position of the photo, starting at 1'),
  read: z
    .enum(['all', 'part', 'none'])
    .describe('all: everything read; part: some of it missing (e.g. cut off at the edge); none'),
  problem: z.enum(PAGE_PROBLEMS).nullable().describe('Why not all of it (null when all)'),
});
export type PageReport = z.infer<typeof PageReport>;

export const ExtractionResult = z.object({
  is_learning_material: z.boolean(),
  readable: z.boolean(),
  // A broken page report must not cost the questions that were read.
  pages: z.array(PageReport).max(20).describe('One entry per photo, in order').catch([]),
  title: z.string().trim().min(1).max(80).nullable().describe('Short title of this material'),
  subject: z
    .object({ name: z.string().trim().min(1).max(40), kind: z.enum(SUBJECT_KINDS) })
    .nullable(),
  extracted_text: z
    .string()
    .max(12000)
    .describe('Faithful transcription (Markdown), used to ground explanations'),
  items: z.array(ItemDraft).max(25),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const EXTRACT_SYSTEM = `You read photos of a learner's study material (worksheets, textbook pages, notebook pages, vocabulary lists) for the LearnBuddy app.

1. Decide whether this is learning material (is_learning_material) and whether it is readable (readable: false only if nothing at all can be read). If not, return empty items. Learning material is school or study content (worksheets, textbook or notebook pages, vocabulary, tasks); everyday papers (a recipe, a letter, a receipt, an advert, packaging) are not, unless they are printed as a school task.
   A page that is cut off or partly unreadable does not make the rest unreadable: use what you can read, and report every photo in pages (one entry each, in order): read "all", "part" (text cut off at an edge, covered by a finger, blurred or in a reflection in places) or "none", with the problem. Text that stops mid-sentence at the edge of the photo is cut off (read "part", cut_off): transcribe it only up to where it stops and end it with "[…]", never complete it. A single photo of something else among school pages is read "none" with not_material; the other pages still count. Never guess what you cannot see: write questions only from what is readable.
2. Transcribe the material faithfully into extracted_text (Markdown). Don't add anything that isn't there.
3. Write practice questions that check exactly this material, pitched at the learner's level (LEARNER). Each has the correct answer.
   - A vocabulary list: one "vocab" item per pair (prompt = foreign word as printed incl. article, answer = translation, prompt_lang / lang = their languages; every other translation a teacher would accept in accepted_answers (synonyms, other spellings; with the article for nouns; up to 8) — answers are checked against this list without a model). Up to 25 pairs; the app asks both directions itself.
   - Otherwise 8–15 questions. Prefer short answers and numbers; multiple_choice only when choices make sense (2–6 choices, correct_choice = index).
   - numeric: answer is the number (decimal point), unit separately in "unit".
   - ${MATH_RULES}
   - ${FIGURE_RULES}
   - accepted_answers: other correct formulations (synonyms, spelling variants).
   - topic: a short topic name (2–4 words) shared by questions about the same thing.
   - Questions and answers in the language of the material (for language exercises, instructions in the learner's language).
   - Never invent facts that are not in the material.
4. Suggest a short title and the school subject.

Answer with the JSON object described by the schema.`;

/** Homework: the tasks as they are, with a solution the learner never sees (it guides the hints). */
export const HOMEWORK_SYSTEM = `You read photos of a learner's homework for the LearnBuddy app. The learner wants help to solve it THEMSELVES.

1. is_learning_material: is this school work? readable: can you read it (false only if nothing at all can be read)? If not, return empty items. Learning material is school or study content (worksheets, textbook or notebook pages, vocabulary, tasks); everyday papers (a recipe, a letter, a receipt, an advert, packaging) are not, unless they are printed as a school task.
   A page that is cut off or partly unreadable does not make the rest unreadable: use what you can read, and report every photo in pages (one entry each, in order): read "all", "part" (text cut off at an edge, covered by a finger, blurred or in a reflection in places) or "none", with the problem. Text that stops mid-sentence at the edge of the photo is cut off (read "part", cut_off): transcribe it only up to where it stops and end it with "[…]", never complete it. A single photo of something else among school pages is read "none" with not_material; the other pages still count. Never guess what you cannot see: list only tasks you can read completely.
2. Transcribe it faithfully into extracted_text (Markdown).
3. One item per task (or per numbered sub-task), in the order printed, up to 12:
   - prompt: the task exactly as printed (you may add the needed context from the sheet in one sentence).
   - answer: the correct final answer, as short as possible. It is used only to check the learner's answer and to plan hints; the learner never sees it.
   - kind: numeric for a single number (unit in "unit"), multiple_choice if the task offers choices, long for explanations or texts, short otherwise.
   - ${MATH_RULES}
   - ${FIGURE_RULES}
   - topic: 2–4 words.
4. Suggest a short title and the school subject.

Answer with the JSON object described by the schema.`;
