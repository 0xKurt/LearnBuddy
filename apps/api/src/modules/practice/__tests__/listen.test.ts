// What a listening question may be, and what it may never be (issue #210).
//
// Two decisions are held here, because both of them can only be wrong silently:
//
//   · Rule 0 — the answer stands in the spoken text, word for word. If this check ever got
//     lenient, the model could write a text and then ask about something it decided
//     afterwards, and her answer would be judged against words she never heard.
//   · Only the content is judged. A listening task is in a language subject, and the default
//     there is `strict` spelling — so without the flag a right understanding would be rebuked
//     for a slip of the pen, which is exactly what the curriculum forbids (§7.3, issue #197).
//
// The grading cases live in this file rather than in `evaluate.test.ts` on purpose: they are
// this form's rule, and keeping them next to the form keeps the two readable together. The
// HTTP path — the recording, the transcript, the exercise that is refused without a voice —
// is `src/__tests__/listening.int.test.ts`.

import { describe, expect, it } from 'vitest';

import { ruleCheck, type ItemForCheck } from '../evaluate.js';
import {
  answerIsInText,
  listenItems,
  listenTaskOf,
  listenRefs,
  type ListenDraft,
} from '../listen.js';

/** A speech gateway that reads the school languages, like the real one (`chirp3Locale`). */
const speech = {
  available: true,
  localeFor: (locale: string) => ({ de: 'de-DE', en: 'en-GB', fr: 'fr-FR' })[locale] ?? null,
};

const TEXT =
  'On Saturday morning Tom took the bus to the city centre. He wanted to buy a present for his sister, because she has her birthday on Sunday. In the end he bought a book about horses and a small blue candle.';

const question = (over: Partial<ListenDraft['questions'][number]> = {}) => ({
  kind: 'short' as const,
  prompt: 'What did Tom buy for his sister?',
  answer: 'a book about horses',
  accepted_answers: [],
  choices: null,
  correct_choice: null,
  topic: 'Shopping',
  difficulty: 2,
  // Fields every draft carries since #211 and #214; a listening question has none of them — it
  // is a spoken stimulus with a short answer.
  rubric: null,
  curriculum_point: null,
  ...over,
});

const draft = (over: Partial<ListenDraft> = {}): ListenDraft => ({
  text: TEXT,
  lang: 'en',
  questions: [question()],
  ...over,
});

describe('the answer has to stand in the spoken text (Rule 0)', () => {
  it('takes the text’s own words, whatever the punctuation and the case', () => {
    expect(answerIsInText('a book about horses', TEXT)).toBe(true);
    expect(answerIsInText('A Book About Horses', TEXT)).toBe(true);
    expect(answerIsInText('the city centre.', TEXT)).toBe(true);
    expect(answerIsInText('Saturday morning', TEXT)).toBe(true);
  });

  it('refuses a paraphrase, a translation and an invented fact', () => {
    // Right in meaning, not in the text: she could never have heard these words.
    expect(answerIsInText('a horse book', TEXT)).toBe(false);
    expect(answerIsInText('ein Buch über Pferde', TEXT)).toBe(false);
    expect(answerIsInText('a red candle', TEXT)).toBe(false);
  });

  it('is a whole-word comparison, not a substring search', () => {
    // "or" stands inside "morning" and "horses"; it was never said on its own.
    expect(answerIsInText('or', TEXT)).toBe(false);
    expect(answerIsInText('bus', TEXT)).toBe(true);
  });

  it('refuses an empty answer', () => {
    expect(answerIsInText('   ', TEXT)).toBe(false);
  });
});

describe('the questions of one listening task', () => {
  it('keeps a question whose answer is in the text, and carries the text with it', () => {
    const items = listenItems(draft(), speech);
    expect(items).toHaveLength(1);
    expect(items[0]!.listen_task).toEqual({ text: TEXT, lang: 'en' });
    // Nothing that would mark her language, and no hint ladder: the help is hearing it again.
    expect(items[0]!.spelling).toBe('gentle');
    expect(items[0]!.hints).toEqual([]);
    expect(items[0]!.worked_solution).toBeNull();
    // The question is in the text's language, so the app reads and announces it in that one.
    expect(items[0]!.prompt_lang).toBe('en');
  });

  it('drops the one question whose answer is not in the text, and keeps the others', () => {
    const items = listenItems(
      draft({
        questions: [
          question(),
          question({ prompt: 'How did Tom feel?', answer: 'he was happy' }),
          question({ prompt: 'How did Tom travel?', answer: 'the bus' }),
        ],
      }),
      speech,
    );
    expect(items.map((i) => i.answer)).toEqual(['a book about horses', 'the bus']);
  });

  it('checks the option she can tap, not the key beside it', () => {
    const tapped = (choices: string[], correct: number) =>
      listenItems(
        draft({
          questions: [
            question({
              kind: 'multiple_choice',
              answer: 'whatever the model wrote here',
              choices,
              correct_choice: correct,
            }),
          ],
        }),
        speech,
      );
    expect(tapped(['a book about horses', 'a doll'], 0)).toHaveLength(1);
    // The right option is a paraphrase: nothing she heard says it in those words.
    expect(tapped(['a horse book', 'a doll'], 0)).toHaveLength(0);
    // A distractor that happens to use the text's words is perfectly fine — only the
    // right one has to come out of the text.
    expect(tapped(['a doll', 'a book about horses'], 1)).toHaveLength(1);
  });

  it('makes nothing at all without a voice that can read the text', () => {
    expect(listenItems(draft(), { available: false, localeFor: () => 'en-GB' })).toEqual([]);
    // Spanish: the provider of this test does not read it, so the text would never be heard.
    expect(listenItems(draft({ lang: 'es' }), speech)).toEqual([]);
    expect(listenItems(null, speech)).toEqual([]);
  });
});

describe('what a stored row says', () => {
  it('reads a text back, and never guesses at a broken column', () => {
    expect(listenTaskOf({ text: TEXT, lang: 'en' })).toEqual({ text: TEXT, lang: 'en' });
    expect(listenTaskOf(null)).toBeNull();
    expect(listenTaskOf({ text: TEXT })).toBeNull();
    expect(listenTaskOf('the text')).toBeNull();
  });

  it('gives the questions of one text one alias, and a second text its own', () => {
    const refs = listenRefs([
      { id: 'a', listen_task: { text: TEXT, lang: 'en' } },
      { id: 'b', listen_task: { text: TEXT, lang: 'en' } },
      { id: 'c', listen_task: null },
      { id: 'd', listen_task: { text: 'Un autre texte, tout à fait différent.', lang: 'fr' } },
    ]);
    expect(refs.get('a')).toBe('h1');
    expect(refs.get('b')).toBe('h1');
    expect(refs.has('c')).toBe(false);
    expect(refs.get('d')).toBe('h2');
  });
});

describe('a listening answer is judged on what she understood', () => {
  const heard = (over: Partial<ItemForCheck> = {}): ItemForCheck => ({
    kind: 'short',
    answer: 'a book about horses',
    accepted_answers: [],
    unit: null,
    choices: null,
    correct_choice: null,
    tolerance: null,
    spelling: null,
    // Every listening task is in a language subject, where spelling is strict by default —
    // which is the whole reason this flag has to exist.
    subject_kind: 'english',
    listening: true,
    ...over,
  });
  const check = (item: ItemForCheck, text: string) => ruleCheck(item, { text, choice: null });

  it('counts a slip of the pen as right', () => {
    expect(check(heard(), 'a book about horsse')).toBe('correct');
    expect(check(heard(), 'a book about Horses')).toBe('correct');
    expect(check(heard({ answer: 'la chambre' }), 'la chambre')).toBe('correct');
    expect(check(heard({ answer: 'le vélo' }), 'le velo')).toBe('correct');
  });

  it('counts the answer without its article as right', () => {
    expect(check(heard({ answer: 'the bus' }), 'bus')).toBe('correct');
  });

  it('still says nothing about an answer that is something else', () => {
    // Not decidable by a rule — the tutor judges it, and the prompt tells it to judge the
    // content only. What must never happen is a rule calling this right.
    expect(check(heard(), 'a doll')).toBe('unknown');
  });

  it('leaves every other question exactly as strict as it was', () => {
    expect(check(heard({ listening: false }), 'a book about horsse')).toBe('typo');
    expect(check(heard({ listening: false }), 'a book about Horses')).toBe('spelling');
  });
});
