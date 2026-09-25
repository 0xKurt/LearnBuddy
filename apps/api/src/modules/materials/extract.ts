// Reading photographed material into questions. docs/architecture.md §Material.
// One structured model call per material; the answer is validated item by
// item (broken items are dropped, not "repaired").

import { z } from 'zod';

import { FIGURE_RULES, ItemDraft, MATH_RULES } from '../practice/items.js';

export const EXTRACT_PROMPT_VERSION = 'extract.v3.0';

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

export const ExtractionResult = z.object({
  is_learning_material: z.boolean(),
  readable: z.boolean(),
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

1. Decide whether this is learning material (is_learning_material) and whether it is readable (readable). If not, return empty items.
2. Transcribe the material faithfully into extracted_text (Markdown). Don't add anything that isn't there.
3. Write practice questions that check exactly this material, pitched at the learner's level (LEARNER). Each has the correct answer.
   - A vocabulary list: one "vocab" item per pair (prompt = foreign word as printed incl. article, answer = translation, prompt_lang / lang = their languages; other correct translations in accepted_answers). Up to 25 pairs; the app asks both directions itself.
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

1. is_learning_material: is this school work? readable: can you read it? If not, return empty items.
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
