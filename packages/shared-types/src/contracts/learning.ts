import { z } from 'zod';

import { AnswerSurface } from './bars.js';
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
  /** The provider's safety filter refused to read it; reading again would not help. */
  'blocked',
]);
export type MaterialFailure = z.infer<typeof MaterialFailure>;

/**
 * A page Buddy could not read completely (cut off, blurred, …). Lena is told
 * and may photograph exactly that page again (docs/architecture.md §Material).
 */
export const PageProblem = z.object({
  /** Position of the photo, starting at 1. */
  page: z.number().int().min(1),
  read: z.enum(['part', 'none']),
  problem: z
    .enum(['cut_off', 'blurry', 'dark', 'glare', 'covered', 'not_material', 'other'])
    .nullable(),
});
export type PageProblem = z.infer<typeof PageProblem>;

export const CreateMaterialRequest = z.object({
  client_request_id: Uuid,
  /**
   * One entry per file, in page order: photos, or a PDF (worksheets shared as PDF). The API
   * counts a PDF's pages on submit: 20 pages at most in all (reason too_many_pages).
   */
  photo_mimes: z
    .array(z.enum(['image/jpeg', 'image/png', 'application/pdf']))
    .min(1)
    .max(20),
  goal_id: Uuid.nullable().optional(),
  /** The capture step (Buddy asked for this photo); it is done once the photos are read. */
  step_id: Uuid.nullable().optional(),
  /** homework: the learner needs help with these tasks — hints only, never the solution. */
  purpose: z.enum(['study', 'homework']).default('study'),
  /**
   * The pages missing from this earlier material, photographed again: its notice
   * ends, and the new photos keep its goal and purpose.
   */
  completes: Uuid.nullable().optional(),
  /**
   * She asked for these pages to be sent (issue #56). Pages go up as soon as they are ready,
   * so a reservation exists while she is still attaching — until this is true it is not a
   * sheet on its way: the home says nothing about it and Buddy counts no material.
   * Default false; submit sets it too, so an older app never leaves it unset.
   */
  sending: z.boolean().default(false),
});
export type CreateMaterialRequest = z.infer<typeof CreateMaterialRequest>;

export const MaterialView = z.object({
  id: Uuid,
  title: z.string().nullable(),
  status: MaterialStatus,
  failure_reason: MaterialFailure.nullable(),
  /** The photos are gone (retention or deletion): reading it again is not possible. */
  photos_deleted: z.boolean(),
  item_count: z.number().int(),
  subject_name: z.string().nullable(),
  goal_id: Uuid.nullable(),
  purpose: z.enum(['study', 'homework']),
  /** homework: the help session, once the tasks are read. */
  session_id: Uuid.nullable(),
  /**
   * The state of that session: active — tasks still open ("Weiter mit der Hausaufgabe");
   * finished — every task solved; abandoned — closed after a long pause or with the sheet.
   */
  session_status: z.enum(['active', 'finished', 'abandoned']).nullable().default(null),
  /** Pages not read completely, while Lena has not answered the notice. */
  page_problems: z.array(PageProblem),
  /**
   * The sheet holds more questions than were read into items (issue #150). The pages were
   * legible — there were simply more of them than the readings could take. Said out loud
   * rather than left to be discovered: a sheet that looks whole and is not is what made
   * "ask me all the vocabulary" hand back half a word list.
   */
  items_incomplete: z.boolean().default(false),
  /** Pages: a photo is one, a PDF counts its pages (known once submitted). */
  photo_count: z.number().int(),
  /** Pages added to a sheet: once read, their questions are part of that sheet. */
  merged_into: Uuid.nullable(),
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
 * A real crop from the photographed sheet that goes with the question (issue #50):
 * a labelled diagram, a reference chart — never a generated picture. The URL is a
 * short-lived signed Storage URL made when the view is built; width/height give the
 * app a fixed ratio so the card never jumps while it loads.
 */
export const ItemImage = z.object({
  url: z.string(),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  /** What the crop shows, for a screen reader ("Zifferblatt mit Zeigern"). */
  label: z.string(),
});
export type ItemImage = z.infer<typeof ItemImage>;

/**
 * A question as shown while it is open: never includes the answer.
 * Texts may contain math between dollar signs in a small LaTeX subset
 * (\frac{a}{b}, x^{2}, x_{1}, \sqrt{x}, \cdot, \times, \div, \pi, \le, \ge, \ne, \approx, \degree;
 * \overline, \angle, \parallel, \perp, \in, \mathbb, \vec; a blank "___" or \square inside math).
 * A dollar for money is written \$; a "$" before a digit never closes math.
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
  /**
   * The sheet's own figure for this question, where the question is shown full size
   * (sessions); null in the material list and when the sheet has none (issue #50).
   */
  image: ItemImage.nullable().default(null),
  /**
   * Words to TAP instead of typing, for vocabulary she is recognising (issue #147).
   * They are a way in, not a different question: tapping one sends it as the answer and
   * it is graded like anything she types, so the key stays the key and typing keeps
   * working. Null wherever tapping would defeat the exercise — writing the foreign word
   * — and wherever there is not enough of her own vocabulary to build honest choices.
   */
  tap_choices: z.array(z.string()).nullable().default(null),
  /**
   * The learning surface she WORKS with instead of only reading about it (issue #162):
   * a fraction bar she taps. Only for a question whose text, picture and key code computed
   * from one reviewed task (`BarTask`, `apps/api/src/modules/practice/bars.ts`) — the model
   * picks the task and its numbers, nothing else. Null everywhere else, and the surface
   * never carries the solution. Typing stays the way it always was: a tap writes the
   * fraction into the same answer field.
   */
  surface: AnswerSurface.nullable().default(null),
});
export type ItemView = z.infer<typeof ItemView>;

// ─────────────── the questions of one material ───────────────

/**
 * How the latest closed attempt at a question went (any session):
 * first_try · with_help (right after hints or retries) · not_known (revealed,
 * skipped or missed) · never_asked.
 */
export const ItemResult = z.enum(['first_try', 'with_help', 'not_known', 'never_asked']);
export type ItemResult = z.infer<typeof ItemResult>;

/** A question of a material as listed for the learner: never includes the solution. */
export const MaterialItemView = ItemView.extend({ result: ItemResult });
export type MaterialItemView = z.infer<typeof MaterialItemView>;

/** GET /materials/:id/items — the material and its questions (archived ones left out). */
export const MaterialItemsView = z.object({
  material: MaterialView,
  items: z.array(MaterialItemView),
});
export type MaterialItemsView = z.infer<typeof MaterialItemsView>;

/** PATCH /materials/:id — the learner renames a material. */
export const RenameMaterialRequest = z.object({
  title: z.string().trim().min(1).max(120),
});
export type RenameMaterialRequest = z.infer<typeof RenameMaterialRequest>;

export const SessionItemView = z.object({
  item: ItemView,
  /** missed: answered wrong in a test (one try, closed). */
  status: z.enum(['open', 'correct', 'revealed', 'skipped', 'missed']),
  attempts: z.number().int(),
  hints_used: z.number().int(),
  /** Prepared hints still to give; never the hints themselves. */
  hints_left: z.number().int().min(0).default(0),
  /** "Tipp" works for this question now: a prepared hint at once, else the tutor writes one. */
  hint_available: z.boolean().default(false),
  /**
   * "Lösung zeigen" works now: only after a real try or a hint (never from the first second),
   * never in homework help and never while a test runs (a test has "Überspringen").
   */
  reveal_available: z.boolean().default(false),
  /** Homework help: set aside with "Später" (still open; it comes back after the others). */
  deferred: z.boolean().default(false),
  /**
   * Only once the item is closed — and after a finished test also for a question she never
   * got to (status still open: "nicht bearbeitet").
   */
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

/** How the learner wants it explained again (the chips "Einfacher bitte", "Mit Beispiel", "Warum ist das so?"). */
export const ReexplainWay = z.enum(['simpler', 'example', 'why']);
export type ReexplainWay = z.infer<typeof ReexplainWay>;

export const PracticeTurnView = z.object({
  id: Uuid,
  /** The question it is about; null only in stored turns of the removed explain mode (issue #70). */
  item_id: Uuid.nullable(),
  role: z.enum(['learner', 'tutor']),
  text: z.string(),
  verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'not_an_attempt']).nullable(),
  pronunciation: PronunciationFeedback.nullable(),
  /** Part of an "Anders erklären" exchange (her request and the new explanation), else null. */
  reexplain: ReexplainWay.nullable(),
  created_at: IsoDateTime,
});
export type PracticeTurnView = z.infer<typeof PracticeTurnView>;

export const PracticeSummary = z.object({
  /** Closed questions (solved, revealed, skipped, missed); never shown as a score. */
  answered: z.number().int(),
  first_try: z.number().int(),
  /** Topics where every closed question was right at once. Never also in shaky_topics. */
  secure_topics: z.array(z.string()),
  /** Topics with at least one question that needed help, was shown or missed. */
  shaky_topics: z.array(z.string()),
});
export type PracticeSummary = z.infer<typeof PracticeSummary>;

export const SessionMode = z.enum(['practice', 'test', 'help']);
export type SessionMode = z.infer<typeof SessionMode>;

export const SessionView = z.object({
  id: Uuid,
  /** help: homework, hints only and the solution is never shown. */
  mode: SessionMode,
  /**
   * false in help mode (no "show solution", closed questions show no answer) and
   * while a test runs (answers only once it is finished).
   */
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
    /**
     * How she gave it (issue #163). A word she TAPPED from four of her own is recognition;
     * the same word typed is production, and a class test asks for the second. Since #147
     * a tap travels as ordinary text so that grading stays one path — so the answer itself
     * no longer shows the difference, and the app has to say. Absent means typed.
     */
    via: z.enum(['typed', 'tapped', 'spoken']).optional(),
  })
  .refine((v) => (v.text ?? null) !== null || (v.choice ?? null) !== null, {
    message: 'text or choice is required',
  });
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** "Tipp": the next prepared hint for an open question — at once, no model. */
export const HintRequest = z.object({ client_turn_id: Uuid, item_id: Uuid });
export type HintRequest = z.infer<typeof HintRequest>;

/**
 * "Anders erklären": a new explanation, written by the model, after a closed question's
 * solution. Answered like an answer (AnswerResponse, verdict not_an_attempt): her request and
 * the explanation become turns. Never in a running test; in homework help only for a task she
 * solved herself.
 */
export const ReexplainRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  way: ReexplainWay,
});
export type ReexplainRequest = z.infer<typeof ReexplainRequest>;

export const AnswerVerdict = z.enum([
  'correct',
  'partially_correct',
  'incorrect',
  'not_an_attempt',
]);
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;

/**
 * What the learner asked for beyond the topic (issue #113). The model sets them, the server
 * decides what they mean — for her own questions in the selection, for new ones in the
 * generator.
 *
 * Difficulty is relative, never a level she has to name: "easier" and "harder" mean easier
 * or harder than the middle of what she already has for this (`items.difficulty`).
 */
export const DifficultyWish = z.enum(['easier', 'harder']);
export type DifficultyWish = z.infer<typeof DifficultyWish>;

/**
 * Which way round a vocabulary pair is asked: `recognise` shows the foreign word and asks
 * what it means; `produce` shows it in her own language and asks for the foreign word — the
 * direction a class test asks for. Both directions are always stored; this says which one
 * she practises now.
 */
export const VocabDirection = z.enum(['recognise', 'produce']);
export type VocabDirection = z.infer<typeof VocabDirection>;

/** Start from something the learner named instead of a photo. */
export const StartTopicRequest = z.object({
  client_request_id: Uuid,
  /**
   * practice: questions on a topic · vocab: a typed vocabulary list ·
   * speak: sentences/words to say aloud · help: a homework task the learner typed ·
   * test: a practice test on a topic (one try per question, no hints, results at the
   * end). Explaining is the chat's answer, never a mode (owner decision 28.09., issue #70).
   */
  kind: z.enum(['practice', 'vocab', 'speak', 'help', 'test']),
  text: z.string().trim().min(2).max(3000),
  subject: z.string().trim().max(60).nullable().optional(),
  /**
   * practice / test for a planned test (Buddy's offer names it): the questions stay within the
   * topics of the sheets photographed for it, and the session belongs to it.
   */
  goal_id: Uuid.nullable().optional(),
  /**
   * More of the same after a practice ("Die wackligen nochmal", "Mehr davon, etwas
   * schwerer"): the session it follows. The new questions stay in that session's world —
   * its test and sheets when it had one, else the questions she just did as the pattern —
   * instead of whatever the topic name suggests (issue #58).
   */
  from_session_id: Uuid.nullable().optional(),
  /** Easier or harder than her grade would give her by itself (issue #113). */
  difficulty: DifficultyWish.nullable().optional(),
  /**
   * vocab: which direction of each pair this session asks (issue #113). Both are stored
   * either way, so the other one can be practised later; null asks both, as before.
   */
  direction: VocabDirection.nullable().optional(),
});
export type StartTopicRequest = z.infer<typeof StartTopicRequest>;

/** A recording for a speak question (≤ 30 s; m4a/aac, webm or wav, base64). */
export const SpeakRequest = z.object({
  client_turn_id: Uuid,
  item_id: Uuid,
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(1_400_000),
});
export type SpeakRequest = z.infer<typeof SpeakRequest>;

/**
 * One word of the sentence, said on its own (issue #83): she taps a word she got wrong and
 * practises just that. Nothing is stored and nothing counts — it is practice, not an attempt;
 * the question keeps its state until she says the whole sentence again.
 */
export const SpeakWordRequest = z.object({
  item_id: Uuid,
  /** The word as it stands in the sentence. */
  word: z.string().trim().min(1).max(40),
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(1_400_000),
});
export type SpeakWordRequest = z.infer<typeof SpeakWordRequest>;

export const SpeakWordResponse = z.object({
  /** false when nothing understandable was heard — then `ok` says nothing. */
  audible: z.boolean(),
  ok: z.boolean(),
  /** What was heard, written down; '' when nothing was. */
  heard: z.string(),
  /** One short tip in her app language, when it was not right yet. */
  tip: z.string().nullable(),
});
export type SpeakWordResponse = z.infer<typeof SpeakWordResponse>;

/**
 * POST /practice/sessions/:id/speak with `Accept: text/event-stream`
 * (docs/architecture.md §Speed): `progress` events while the model is still
 * listening, then one `done` event carrying the AnswerResponse (or `error` with
 * { code }). Progress is what the model has written so far — the judgement counts
 * only once it is validated and stored, which is what `done` carries.
 */
export const SpeakStreamEvent = z.object({
  /** What she said, as far as it is written down; '' before it starts. */
  heard: z.string(),
  /** Words judged so far, in the order of the target text. Only finished ones. */
  words: z.array(z.object({ text: z.string(), ok: z.boolean() })),
});
export type SpeakStreamEvent = z.infer<typeof SpeakStreamEvent>;

/**
 * Speech to text: a spoken chat message or answer. A dictation has no time limit
 * (issue #19): the app cuts a long recording into pieces at pauses and sends them
 * one after another, each as its own request. No recording is stored.
 */
export const TranscribeRequest = z.object({
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  /** One piece. The bound is transport, not a time limit: the app cuts well below it. */
  audio_base64: z.string().min(100).max(2_000_000),
  /** message: talking to Buddy · answer: answering a question (numbers and math written as such). */
  purpose: z.enum(['message', 'answer']),
  /** The language she is expected to speak (e.g. 'fr' for a French answer); null = the app language. */
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .nullable()
    .optional(),
  /** answer: the question being answered, so short answers ("drei Viertel") are heard in context. */
  context: z.string().max(600).nullable().optional(),
  /**
   * The tail of what the same dictation's earlier pieces already said, so a piece
   * that starts mid-sentence is heard as its continuation. Context only: the model
   * never repeats it. Absent on the first (or only) piece.
   */
  prev_tail: z.string().max(400).nullable().optional(),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequest>;

export const TranscribeResponse = z.object({
  /** What was said, written down; empty when nothing understandable was heard. */
  text: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

/**
 * POST /voice/transcribe with `Accept: text/event-stream` (issue #9): `progress`
 * events while the model is still writing down what it heard, then one `done` event
 * with the TranscribeResponse (or `error` with { code }). Progress is only for showing
 * the words as they arrive; what is sent off is what `done` carries.
 */
export const TranscribeStreamEvent = z.object({
  /** What was said, as far as it is written down; '' before the first words. */
  text: z.string(),
});
export type TranscribeStreamEvent = z.infer<typeof TranscribeStreamEvent>;

// ─────────────── Buddy's voice (text to speech, ADR 0008) ───────────────

/**
 * The small curated set of Buddy's voices (ADR 0008): she picks one in the setup or the
 * settings (tap to hear it), or asks Buddy ("andere Stimme"). The server maps each to a
 * provider voice; the app shows only friendly names, never the provider's.
 */
export const VOICE_NAMES = ['warm', 'friendly', 'bright', 'clear', 'soft', 'deep'] as const;
/**
 * How the voice sits, for the picker's two groups (issue #67): six names are a guessing
 * game in one row. Higher = Chirp 3 HD Sulafat, Zephyr, Aoede; lower = Achird, Iapetus,
 * Charon (`apps/api/src/speech/google.ts`). Said as pitch, not as a person: a synthetic
 * voice has no gender to claim.
 */
export const VOICE_PITCH: Record<(typeof VOICE_NAMES)[number], 'higher' | 'lower'> = {
  warm: 'higher',
  bright: 'higher',
  soft: 'higher',
  friendly: 'lower',
  clear: 'lower',
  deep: 'lower',
};
export const VoiceName = z.enum(VOICE_NAMES);
export type VoiceName = z.infer<typeof VoiceName>;

/** Speaking speed in steps: -2 much slower … 0 normal … +2 much faster. */
export const VOICE_SPEED_MIN = -2;
export const VOICE_SPEED_MAX = 2;
export const VoiceSpeed = z.number().int().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX);

/**
 * One sentence (or a short word) to be read aloud in Buddy's natural voice. The app sends
 * only the text as it is spoken (math already in words, lib/speech/spoken.ts) — nothing else
 * about her. Voice and speed come from her settings on the server (a preview may name a voice).
 */
export const SpeechRequest = z.object({
  text: z.string().trim().min(1).max(600),
  /** BCP 47 locale the text is read in ("de-DE", "fr-FR"). */
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  /** "Langsam": the slower speed for listening closely (vocabulary). */
  slow: z.boolean().optional(),
  /**
   * Read in this voice instead of hers — only the voice picker's "tap to hear" preview. Her
   * settings stay as they are; choosing a voice is PATCH /buddy/settings.
   */
  voice: VoiceName.optional(),
});
export type SpeechRequest = z.infer<typeof SpeechRequest>;

export const SpeechResponse = z.object({
  mime: z.enum(['audio/mpeg', 'audio/wav']),
  audio_base64: z.string().min(1),
  voice: VoiceName,
  speed: VoiceSpeed,
});
export type SpeechResponse = z.infer<typeof SpeechResponse>;

export const AnswerResponse = z.object({
  session: SessionView,
  /** How the learner's answer was judged; null = could not be judged (no model), nothing was graded. */
  verdict: AnswerVerdict.nullable(),
  /** The tutor turn created for this answer. */
  reply: PracticeTurnView,
});
export type AnswerResponse = z.infer<typeof AnswerResponse>;
