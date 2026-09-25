import { z } from 'zod';

import { IsoDateTime, SubjectKind, Uuid } from './common.js';
import { Figure } from './figure.js';

// ─────────────── material (photographed worksheets) ───────────────

export const MaterialStatus = z.enum([
  'awaiting_upload',
  'queued',
  'processing',
  'ready',
  'failed',
]);
export type MaterialStatus = z.infer<typeof MaterialStatus>;

export const MaterialFailure = z.enum([
  'photos_missing',
  'unreadable',
  'not_learning_material',
  'model_error',
  'budget_exhausted',
]);
export type MaterialFailure = z.infer<typeof MaterialFailure>;

export const CreateMaterialRequest = z.object({
  client_request_id: Uuid,
  photo_mimes: z
    .array(z.enum(['image/jpeg', 'image/png']))
    .min(1)
    .max(20),
  goal_id: Uuid.nullable().optional(),
  /** The capture step (Buddy asked for this photo); it is done once the photos are read. */
  step_id: Uuid.nullable().optional(),
  /** homework: the learner needs help with these tasks — hints only, never the solution. */
  purpose: z.enum(['study', 'homework']).default('study'),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequest>;

export const MaterialView = z.object({
  id: Uuid,
  title: z.string().nullable(),
  status: MaterialStatus,
  failure_reason: MaterialFailure.nullable(),
  item_count: z.number().int(),
  subject_name: z.string().nullable(),
  goal_id: Uuid.nullable(),
  purpose: z.enum(['study', 'homework']),
  /** homework: the help session, once the tasks are read. */
  session_id: Uuid.nullable(),
  created_at: IsoDateTime,
});
export type MaterialView = z.infer<typeof MaterialView>;

export const CreateMaterialResponse = z.object({
  material: MaterialView,
  uploads: z.array(
    z.object({ position: z.number().int(), path: z.string(), url: z.string(), token: z.string() }),
  ),
});
export type CreateMaterialResponse = z.infer<typeof CreateMaterialResponse>;

export const LibraryView = z.object({
  subjects: z.array(
    z.object({
      id: Uuid,
      name: z.string(),
      kind: SubjectKind,
      materials: z.array(MaterialView),
    }),
  ),
  unsorted: z.array(MaterialView),
});
export type LibraryView = z.infer<typeof LibraryView>;

// ─────────────── practice ───────────────

export const ItemKind = z.enum([
  'short',
  'long',
  'numeric',
  'multiple_choice',
  'formula',
  /** A vocabulary pair: prompt in prompt_lang, answer (the translation) in lang. */
  'vocab',
  /** Say the prompt aloud in lang; the model listens to the recording. */
  'speak',
]);
export type ItemKind = z.infer<typeof ItemKind>;

/** Where a question comes from: a photo, Buddy (a topic the learner named), a typed list, homework. */
export const ItemOrigin = z.enum(['material', 'buddy', 'typed', 'homework']);
export type ItemOrigin = z.infer<typeof ItemOrigin>;

/**
 * A question as shown while it is open: never includes the answer.
 * Texts may contain math between dollar signs in a small LaTeX subset
 * (\frac{a}{b}, x^{2}, x_{1}, \sqrt{x}, \cdot, \times, \div, \pi, \le, \ge, \ne, \approx, \degree).
 */
export const ItemView = z.object({
  id: Uuid,
  kind: ItemKind,
  prompt: z.string(),
  choices: z.array(z.string()).nullable(),
  unit: z.string().nullable(),
  topic: z.string().nullable(),
  origin: ItemOrigin,
  /** vocab: the answer's language; speak: the language to say it in (ISO 639-1). */
  lang: z.string().nullable(),
  /** vocab: the language of the prompt. */
  prompt_lang: z.string().nullable(),
  figure: Figure.nullable(),
});
export type ItemView = z.infer<typeof ItemView>;

export const SessionItemView = z.object({
  item: ItemView,
  status: z.enum(['open', 'correct', 'revealed', 'skipped']),
  attempts: z.number().int(),
  hints_used: z.number().int(),
  /** Only once the item is closed. */
  answer: z.string().nullable(),
});
export type SessionItemView = z.infer<typeof SessionItemView>;

/** What the model heard in a recording, word by word (speak questions). */
export const PronunciationFeedback = z.object({
  /** The words as they sounded, written down. */
  heard: z.string(),
  overall: z.enum(['good', 'almost', 'retry']),
  words: z.array(
    z.object({
      text: z.string(),
      ok: z.boolean(),
      /** How to say it better, in the learner's language; null when fine. */
      tip: z.string().nullable(),
    }),
  ),
});
export type PronunciationFeedback = z.infer<typeof PronunciationFeedback>;

export const PracticeTurnView = z.object({
  id: Uuid,
  item_id: Uuid,
  role: z.enum(['learner', 'tutor']),
  text: z.string(),
  verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'not_an_attempt']).nullable(),
  pronunciation: PronunciationFeedback.nullable(),
  created_at: IsoDateTime,
});
export type PracticeTurnView = z.infer<typeof PracticeTurnView>;

export const PracticeSummary = z.object({
  answered: z.number().int(),
  first_try: z.number().int(),
  secure_topics: z.array(z.string()),
  shaky_topics: z.array(z.string()),
});
export type PracticeSummary = z.infer<typeof PracticeSummary>;

export const SessionMode = z.enum(['practice', 'test', 'help', 'explain']);
export type SessionMode = z.infer<typeof SessionMode>;

export const SessionView = z.object({
  id: Uuid,
  /** help: homework, hints only and the solution is never shown; explain: an explanation, then questions. */
  mode: SessionMode,
  /** explain: the explanation shown before the questions. */
  intro: z.string().nullable(),
  /** false in help mode: no "show solution", closed questions show no answer. */
  reveal_allowed: z.boolean(),
  status: z.enum(['active', 'finished', 'abandoned']),
  title: z.string(),
  items: z.array(SessionItemView),
  turns: z.array(PracticeTurnView),
  current_item_id: Uuid.nullable(),
  summary: PracticeSummary.nullable(),
});
export type SessionView = z.infer<typeof SessionView>;

export const StartPracticeRequest = z.object({
  subject_id: Uuid.nullable().optional(),
  material_id: Uuid.nullable().optional(),
  goal_id: Uuid.nullable().optional(),
  mode: z.enum(['practice', 'test']).default('practice'),
});
export type StartPracticeRequest = z.infer<typeof StartPracticeRequest>;

export const AnswerRequest = z
  .object({
    client_turn_id: Uuid,
    item_id: Uuid,
    text: z.string().trim().min(1).max(2000).nullable().optional(),
    choice: z.number().int().min(0).max(5).nullable().optional(),
  })
  .refine((v) => (v.text ?? null) !== null || (v.choice ?? null) !== null, {
    message: 'text or choice is required',
  });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

export const AnswerVerdict = z.enum([
  'correct',
  'partially_correct',
  'incorrect',
  'not_an_attempt',
]);
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;

/** Start from something the learner named instead of a photo. */
export const StartTopicRequest = z.object({
  client_request_id: Uuid,
  /**
   * explain: explain a topic, then check it · practice: questions on a topic ·
   * vocab: a typed vocabulary list · speak: sentences/words to say aloud ·
   * help: a homework task the learner typed.
   */
  kind: z.enum(['explain', 'practice', 'vocab', 'speak', 'help']),
  text: z.string().trim().min(2).max(3000),
  subject: z.string().trim().max(60).nullable().optional(),
});
export type StartTopicRequest = z.infer<typeof StartTopicRequest>;

/** A recording for a speak question (≤ 15 s; m4a/aac, webm or wav, base64). */
export const SpeakRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(1_400_000),
});
export type SpeakRequest = z.infer<typeof SpeakRequest>;

export const AnswerResponse = z.object({
  session: SessionView,
  /** How the learner's answer was judged; null = could not be judged (no model), nothing was graded. */
  verdict: AnswerVerdict.nullable(),
  /** The tutor turn created for this answer. */
  reply: PracticeTurnView,
});
export type AnswerResponse = z.infer<typeof AnswerResponse>;
