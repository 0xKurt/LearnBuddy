// Synthetic input shared by each audit round; setup never spends model budget.
// requires live verification in Claude Code session
import { randomUUID } from 'node:crypto';
import { ItemDraft, type StoredItem } from '../../modules/practice/items.js';
import { insertItems } from '../../modules/practice/insertItems.js';
import { essayItem } from '../../modules/practice/essay.js';
import { createSession } from '../../modules/practice/service.js';
import type { Learner, TestEnv } from '../harness.js';

export const ESSAY_TEXT =
  'An unserer Schule wird über ein Handyverbot diskutiert. Dafür spricht, dass man sich ohne Nachrichten besser auf den Unterricht konzentriert. Zum Beispiel wird eine Gruppenarbeit oft unterbrochen, wenn ein Handy klingelt. Andererseits können Handys beim Nachschlagen helfen. Außerdem sollten Kinder ihre Eltern nach dem Unterricht erreichen können. Deshalb finde ich eine klare Regel besser als ein vollständiges Verbot: Im Unterricht bleiben Handys in der Tasche, bei einer Aufgabe darf die Lehrerin sie erlauben.';
export async function practiceFixture(
  env: TestEnv,
  learner: Learner,
  kind: 'tutor' | 'essay' | 'speak',
) {
  const item: StoredItem =
    kind === 'essay'
      ? essayItem(
          {
            prompt: 'Erörtere, ob Handys an Schulen verboten werden sollten.',
            type: 'argue_dialectic',
            topic: 'Handyverbot',
            difficulty: 3,
            passage: null,
          },
          'de',
        )
      : ItemDraft.parse({
          kind: kind === 'speak' ? 'speak' : 'long',
          prompt:
            kind === 'speak'
              ? 'Hello, nice to meet you. My name is Anna and I am very happy to be here today.'
              : 'Warum bleibt der Wert eines Bruchs beim Kürzen gleich?',
          answer:
            kind === 'speak'
              ? 'Hello, nice to meet you. My name is Anna and I am very happy to be here today.'
              : 'Weil Zähler und Nenner durch dieselbe Zahl geteilt werden.',
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          source_excerpt: null,
          topic: 'Brüche',
          difficulty: 2,
          lang: kind === 'speak' ? 'en' : null,
        });
  return storeFixture(env, learner, [item]);
}

const HINT_CASES = [
  {
    kind: 'numeric',
    prompt: 'Berechne $\\frac{1}{2} + \\frac{1}{4}$.',
    answer: '0.75',
    accepted_answers: ['3/4'],
    topic: 'Brüche',
  },
  {
    kind: 'short',
    prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
    answer: 'Nenner',
    topic: 'Brüche',
  },
  {
    kind: 'numeric',
    prompt: 'Löse die Gleichung $3x + 6 = 18$.',
    answer: '4',
    topic: 'Gleichungen',
  },
  {
    kind: 'short',
    prompt: 'Bestimme den Fall von „dem Kind“ im Satz „Ich helfe dem Kind.“',
    answer: 'Dativ',
    topic: 'Fälle',
  },
  {
    kind: 'short',
    prompt: 'Setze das Verb in die einfache Vergangenheit: Yesterday she (go) to school.',
    answer: 'went',
    topic: 'Simple past',
  },
] as const;

export async function hintEvalFixture(env: TestEnv, learner: Learner) {
  const items = HINT_CASES.map((c) =>
    ItemDraft.parse({
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      difficulty: 2,
      source_excerpt: null,
      ...c,
    }),
  );
  return storeFixture(env, learner, items);
}

async function storeFixture(env: TestEnv, learner: Learner, items: StoredItem[]) {
  const ids = await insertItems(
    env.db,
    { learnerId: learner.learnerId, materialId: null, subjectId: null, origin: 'buddy' },
    items,
  );
  const session = await createSession(
    env.db,
    learner.learnerId,
    ids,
    { stepId: null, goalId: null, mode: 'practice', clientRequestId: randomUUID() },
    env.clock.now(),
  );
  return { session, item: ids[0]!, ids };
}
