// Reading photographed material into questions. docs/architecture.md §Material.
// One structured model call per material; the answer is validated item by
// item (broken items are dropped, not "repaired").

import { z } from 'zod';

export const EXTRACT_PROMPT_VERSION = 'extract.v2.0';

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

export const ExtractedItem = z.object({
  kind: z.enum(['short', 'long', 'numeric', 'multiple_choice', 'formula']),
  prompt: z.string().trim().min(3).max(600),
  answer: z.string().trim().min(1).max(600),
  accepted_answers: z.array(z.string().trim().min(1).max(200)).max(6),
  unit: z.string().trim().max(20).nullable(),
  choices: z.array(z.string().trim().min(1).max(200)).min(2).max(6).nullable(),
  correct_choice: z.number().int().min(0).max(5).nullable(),
  topic: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .nullable()
    .describe('2–4 word topic used to group questions'),
  difficulty: z.number().int().min(1).max(5),
  source_excerpt: z.string().trim().max(300).nullable(),
});
export type ExtractedItem = z.infer<typeof ExtractedItem>;

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
  items: z.array(ExtractedItem).max(25),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const EXTRACT_SYSTEM = `You read photos of a learner's study material (worksheets, textbook pages, notebook pages) for the LearnBuddy app.

1. Decide whether this is learning material (is_learning_material) and whether it is readable (readable). If not, return empty items.
2. Transcribe the material faithfully into extracted_text (Markdown). Don't add anything that isn't there.
3. Write 8–15 practice questions that check understanding of exactly this material, pitched at the learner's level (LEARNER). Each has the correct answer.
   - Prefer short answers and numbers; use multiple_choice only when choices make sense (2–6 choices, correct_choice = index).
   - numeric: answer is the number (decimal point), unit separately in "unit".
   - Write math as readable plain text (3/4, x², √2, 2·x) — no LaTeX.
   - accepted_answers: other correct formulations of the answer (synonyms, spelling variants).
   - topic: a short topic name (2–4 words) shared by questions about the same thing.
   - Questions and answers in the language of the material (for language exercises, instructions in the learner's language).
   - Never invent facts that are not in the material.
4. Suggest a short title and the school subject.

Answer with the JSON object described by the schema.`;

/** Keep only items whose shape is consistent; returns them normalised. */
export function usableItems(items: ExtractedItem[]): ExtractedItem[] {
  const out: ExtractedItem[] = [];
  for (const it of items) {
    if (it.kind === 'multiple_choice') {
      if (!it.choices || it.correct_choice === null || it.correct_choice >= it.choices.length)
        continue;
    } else if (it.choices || it.correct_choice !== null) {
      out.push({ ...it, choices: null, correct_choice: null });
      continue;
    }
    out.push(it);
  }
  return out;
}
