// Hörverstehen: the question whose stimulus is SPOKEN (issue #210, contracts/listen.ts).
//
// The speech output was already there — ADR 0008, Buddy's natural voice, the slower
// "Langsam" pass, a 24-hour audio cache per learner — and was used for nothing but reading
// text aloud. What was missing is the exercise FORM: a text she hears and answers questions
// about. So nothing here synthesises, caches or plays anything of its own; it reuses
// `modules/voice/speech.ts` exactly as the app's "Anhören" pill does.
//
// What this module decides:
//
//   · Rule 0 (issue #210): the text the questions were written from is the text that is
//     SPOKEN, verbatim, and every answer must occur IN it. `answerIsInText` checks that
//     before a question exists; a question that fails it is not created. Without that check
//     the model may write a text, then ask about something it decided afterwards, and the
//     answer would be judged against something she never heard. This is not language
//     understanding and no word list (CLAUDE.md rule 3): it compares two strings the model
//     wrote, and the only thing it can say is "these words are not in that text".
//   · Which answer forms: `multiple_choice` and `short`, nothing else. Both are decided by
//     the rules that already exist. A comprehension answer in free text is not mechanically
//     decidable, and #197 and #227 are two tickets' worth of what happens when code or a
//     model claims otherwise.
//   · Language and spelling are NOT judged here (issue #197, NRW: Sprachrichtigkeit is not
//     marked in a listening task). That is enforced in `evaluate.ts` — a slip of the pen on a
//     word she HEARD and understood is right, and a right answer is never rebuked for its
//     spelling. The flag comes from this question having a spoken text, so it cannot leak
//     anywhere else.
//   · No hint ladder. The help for a listening question is hearing it again, and slower —
//     which is what the form offers anyway (`sessionView.ts`, `hint_available`). A hint written
//     about a text she is supposed to be listening to is a worse version of the replay, and
//     it costs a model call.

import { isPrimary, primaryKey } from '@learnbuddy/shared-math';
import {
  ListenTask,
  ModelFigure,
  MAX_LISTEN_CHARS,
  MAX_LISTEN_QUESTIONS,
  MIN_LISTEN_CHARS,
  type ListenAudioRequest,
  type ListenAudioResponse,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { synthesizeSpeech } from '../voice/speech.js';
import { unusedItemFields } from './itemFields.js';
import { ItemDraft, optionPictures, usableItems } from './items.js';

/**
 * How many listening texts one prepared set may hold: one. A listening exercise IS a text
 * with its questions; a second text in the same run would be a catalogue of exercises
 * (CLAUDE.md rule 16) and a second synthesis call for something she has not asked for yet.
 */
export const LISTEN_TEXTS_PER_SET = 1;

/**
 * The answer forms a listening question may take. Both are decided by the rules in
 * `evaluate.ts` without a model: a tapped option by its index, a short answer against a key
 * that — by Rule 0 — stands word for word in the text she heard.
 */
export const LISTEN_KINDS = ['multiple_choice', 'short'] as const;

/**
 * The pictures a listening option may be (#375): exactly those `choiceProblem` holds to their
 * option's own TEXT (`primaryHolds` — a clock under "7:45" must show 7:45). The option text is what
 * Rule 0 holds to the words she heard (`answerIsInText`), so only such a picture is held to them
 * too; a graph or a cube net is checked against the key or its sibling options, never against the
 * text, and a chart, a tree or a solid against nothing an option says. And only when the picture
 * says what it shows (`ask`, `primaryKey`): `listenItems` drops a question with one that does not.
 */
const [heardFirst, ...heardRest] = ModelFigure.options.filter((o) =>
  isPrimary({ type: o.shape.type.value }),
);
const HeardOptionFigure = z.discriminatedUnion('type', [heardFirst!, ...heardRest]);

/**
 * One question about the spoken text, as the model writes it. Everything that has nothing to
 * do with a listening question is left out of the schema rather than validated away: a figure
 * beside the question (there is nothing to draw; as an option only a `HeardOptionFigure`), a
 * unit, a spelling mark (spelling is expressly not marked here), the languages (the text's own
 * language covers it), a source excerpt, hints and a worked solution (see the file header) — and every field neither of `LISTEN_KINDS` keeps
 * (`unusedItemFields`, issue #281 D2): a tolerance and a rubric, which belong to a number and a
 * long answer.
 */
export const ListenQuestion = ItemDraft.omit({
  ...unusedItemFields(LISTEN_KINDS),
  figure: true,
  read: true,
  unit: true,
  spelling: true,
  lang: true,
  prompt_lang: true,
  source_excerpt: true,
  hints: true,
  worked_solution: true,
}).extend({
  // A picture outside `HeardOptionFigure` does not parse, and the question goes (Regel 0).
  choice_figures: optionPictures(
    HeardOptionFigure,
    'multiple_choice only: one picture per choice, same order as choices, when the options ARE pictures of what the text says (a time as a clock, an amount as coins and notes, a number as dots or base-ten blocks), with ask set to what each option names; else null',
  ),
  kind: z
    .enum(LISTEN_KINDS)
    .describe('multiple_choice: she taps one of the options · short: she writes the answer'),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .describe('The question about the text, in the language the text is spoken in'),
  answer: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('The answer, in the words the text uses for it'),
});
export type ListenQuestion = z.infer<typeof ListenQuestion>;

/** One listening task as the model writes it: the text to be spoken, and the questions. */
export const ListenDraft = z.object({
  text: z
    .string()
    .trim()
    .min(MIN_LISTEN_CHARS)
    .max(MAX_LISTEN_CHARS)
    .describe(
      'The text to be READ ALOUD, exactly as it will be spoken: continuous prose or a short dialogue, no headings, no stage directions, no speaker labels, no brackets, no markup — every character of it is heard.',
    ),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .describe('ISO 639-1 language the text is spoken in'),
  questions: z.array(ListenQuestion).min(1).max(MAX_LISTEN_QUESTIONS),
});
export type ListenDraft = z.infer<typeof ListenDraft>;

/**
 * What the generator is told about a listening task. Principles and what it must NOT do —
 * never an example sentence, which gets copied verbatim (standing owner rule).
 */
export const LISTEN_RULES = `LISTENING ("listen"): the learner HEARS a text read aloud by the app's voice and answers questions about it; she never sees the text until she has answered. Write ONE text of ${MIN_LISTEN_CHARS}–${MAX_LISTEN_CHARS} characters at her level, in the language she is learning (for a listening task in her own language, that language), as it would be SPOKEN: whole sentences, nothing a voice cannot read — no headings, no speaker labels, no brackets, no bullet points, no stage directions. Then 3–${MAX_LISTEN_QUESTIONS} questions about it, in the same language as the text, each about something the text SAYS IN SO MANY WORDS (who, where, when, how many, what happens) — never about what it implies, never a judgement, never true/false. The answer to each question must occur in the text WORD FOR WORD, in the text's own spelling and in the text's own language: a question whose answer you have to phrase yourself is left out. For multiple_choice, the correct option is those very words and the other options are plausible, each clearly wrong; keep options short. Ask about different places in the text, in the order the text mentions them. Do not number the questions and do not refer to "the text" by name in the answer.`;

/** A listening question as it is stored: an ordinary item plus the text it was heard from. */
export type ListenItem = ItemDraft & { listen_task: ListenTask };

/**
 * Letters, digits and single spaces: the comparison Rule 0 is made on. Punctuation,
 * apostrophes, hyphens, line breaks and casing fold away — they are all things a voice does
 * not pronounce as a difference and a learner cannot hear. Accents and umlauts stay: they are
 * part of the word, and both strings come from the same model answer in the same language.
 */
function heardForm(text: string): string {
  return ` ${text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

/**
 * Rule 0 (issue #210): does the answer stand in the spoken text, word for word?
 *
 * Padded with spaces on both sides, so this is a whole-word comparison: a key that happens to
 * be a fragment inside a longer word is not "in the text". Everything it cannot see is
 * deliberately not guessed at — a number the text spells out in letters, an answer the model
 * translated into her own language, a paraphrase. All of those are a question whose answer she
 * could not have heard in those words, and the honest consequence is that the question is
 * never asked (not a repaired key, not a looser check).
 */
export function answerIsInText(answer: string, text: string): boolean {
  const key = heardForm(answer);
  if (key.trim().length === 0) return false;
  return heardForm(text).includes(key);
}

/**
 * The questions of one listening task, as items — or nothing.
 *
 * Every question is checked on its own and dropped on its own: the answer has to stand in the
 * text (Rule 0), and for a tapped question it is the chosen option that has to. What is left
 * then goes through `usableItems`, the checks every other question gets (issue #374) — the
 * options and their pictures (`choiceProblem`, the figure bounds), the key against a marked
 * calculation (`computes`, #227). A task whose every question falls away leaves no items at
 * all, and a run with no items is refused by the caller — never a listening exercise with
 * nothing to hear, never a question about a text that does not say the answer.
 *
 * `locale` is what the speech gateway can really read this language in; a language it cannot
 * read yields nothing, because the text would never be heard (`localeFor`, issue #210's
 * acceptance criterion for a missing voice).
 */
export function listenItems(
  draft: ListenDraft | null,
  speech: { available: boolean; localeFor: (locale: string) => string | null },
): ListenItem[] {
  if (!draft) return [];
  if (!speech.available || speech.localeFor(draft.lang) === null) return [];
  const task = ListenTask.safeParse({ text: draft.text, lang: draft.lang });
  if (!task.success) return [];
  const heard: ItemDraft[] = [];
  for (const q of draft.questions.slice(0, MAX_LISTEN_QUESTIONS)) {
    const choices = q.kind === 'multiple_choice' ? q.choices : null;
    const correct = q.kind === 'multiple_choice' ? q.correct_choice : null;
    // The key and the option it points at are compared by `usableItems` (issue #227); here
    // the one that must come out of the text is the one she can actually tap.
    const said = choices && correct !== null ? (choices[correct] ?? null) : q.answer;
    if (said === null || !answerIsInText(said, task.data.text)) continue;
    // An option's picture is held to that option's text only when it says what it shows (#375).
    if (choices && q.choice_figures?.some((f) => isPrimary(f) && primaryKey(f) === null)) continue;
    heard.push({
      ...q,
      choices,
      correct_choice: correct,
      // The text's language is the question's language, so the app's voice reads the question
      // in it too and a screen reader announces it right (`items.prompt_lang`).
      prompt_lang: task.data.lang,
      lang: null,
      unit: null,
      figure: null,
      read: null,
      tolerance: null,
      // No listening question is a long answer, so none has a rubric (`itemFields.ts`).
      rubric: null,
      // Never 'strict': what she wrote is judged on what she understood, not on how she spells
      // it (issue #197). `evaluate.ts` enforces it as well, from the stored text.
      spelling: 'gentle',
      source_excerpt: null,
      hints: [],
      worked_solution: null,
    });
  }
  return usableItems(heard).map((it) => ({ ...it, listen_task: task.data }));
}

/** The listening text a stored row carries, or null (an unreadable column is no text). */
export function listenTaskOf(stored: unknown): ListenTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = ListenTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * The alias each question's recording gets in one view ('h1', 'h2', …), by the order the
 * questions stand in: questions about the SAME text share it. Issued by the server from the
 * position, like every other alias (CLAUDE.md rule 2), and it says nothing about the text —
 * the app only needs to know that two questions are about one recording.
 */
export function listenRefs(
  rows: ReadonlyArray<{ id: string; listen_task: unknown }>,
): Map<string, string> {
  const refs = new Map<string, string>();
  const byText = new Map<string, string>();
  for (const row of rows) {
    const task = listenTaskOf(row.listen_task);
    if (!task) continue;
    const key = `${task.lang}\u0000${task.text}`;
    const ref = byText.get(key) ?? `h${byText.size + 1}`;
    byText.set(key, ref);
    refs.set(row.id, ref);
  }
  return refs;
}

/**
 * POST /practice/sessions/:id/listen — the recording of one question's listening text.
 *
 * The text does not leave the server: the app names the question and gets audio. Hearing it
 * again is the form, not an extra, so there is no count and no limit of its own here — the
 * same text at the same speed is the same cache entry (`modules/voice/speech.ts`), so every
 * replay after the first costs nothing and the account's speech budget still bounds the rest.
 *
 * A question that is not in this session, or is not a listening question, is answered with an
 * error rather than with silence: the app would otherwise show a play button that does nothing.
 */
export async function listenAudio(
  deps: Deps,
  who: { accountId: string; learnerId: string },
  sessionId: string,
  input: ListenAudioRequest,
): Promise<ListenAudioResponse> {
  const row = await deps.db.maybeOne<{ listen_task: unknown }>(
    `select i.listen_task from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and si.item_id = $2 and i.learner_id = $3`,
    [sessionId, input.item_id, who.learnerId],
  );
  if (!row) throw new AppError('not_found', 'Question not in this session');
  const task = listenTaskOf(row.listen_task);
  if (!task) {
    throw new AppError('conflict', 'This question has nothing to listen to', {
      reason: 'not_listening',
    });
  }
  // The locale is resolved here, from the language the text was written in, so what goes to
  // the provider is one it said it can read ("en" → "en-GB"). Without one there is no voice
  // for this text — and then the question should never have been created (`listenItems`).
  const locale = deps.speech.localeFor(task.lang);
  if (!locale) {
    throw new AppError('unavailable', 'No natural voice for this language', { reason: 'language' });
  }
  const audio = await synthesizeSpeech(deps, who, {
    text: task.text,
    locale,
    ...(input.slow === true ? { slow: true } : {}),
  });
  return { mime: audio.mime, audio_base64: audio.audio_base64 };
}

/**
 * Whether a listening exercise can be prepared at all: there has to be a voice to read it.
 * Checked BEFORE the model is asked (issue #210's acceptance criterion), for two reasons —
 * a set of questions about a text nobody can hear is worse than no set, and asking the model
 * first would spend a call on it.
 *
 * Only the two stable facts are checked, never a trial synthesis: whether a provider is
 * configured at all, and whether it reads the language. A provider that is configured and
 * momentarily failing is not this answer — that is the replay saying "nicht jetzt", and the
 * exercise is still a valid exercise (CLAUDE.md rule 5).
 */
export function noVoiceToReadIt(deps: Deps): AppError | null {
  if (deps.speech.available) return null;
  return new AppError('unavailable', 'There is no voice to read a listening text', {
    reason: 'speech_off',
  });
}
