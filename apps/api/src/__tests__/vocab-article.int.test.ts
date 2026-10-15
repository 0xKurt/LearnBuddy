// A German noun and its article (issue #759): "küche" for "die Küche" is right, as #146 decided,
// "der Küche" is partly right with the article named — both by code, never the plain "Noch nicht
// ganz" of a wrong answer, and never a model call. docs/architecture.md §Practice (grading).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { t } from '../i18n/index.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** An English word to translate into German, as the model would write it. */
const toGerman = (prompt: string, answer: string) => ({
  kind: 'vocab',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Unit 4',
  difficulty: 2,
  prompt_lang: 'en',
  lang: 'de',
  figure: null,
  source_excerpt: null,
});

describe.skipIf(!dbReady)('a German noun and its article (#759)', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-15T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  it('counts the noun without its article right and another article partly right, by code', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Unit 4',
        subject: { name: 'Englisch', kind: 'english' },
        items: [toGerman('the kitchen', 'die Küche'), toGerman('the bike', 'das Fahrrad')],
      },
    });
    const res = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'vocab',
      text: 'the kitchen – die Küche, the bike – das Fahrrad',
    });
    expect(res.status).toBe(201);
    const idOf = (prompt: string) => res.body.items.find((i) => i.item.prompt === prompt)!.item.id;
    const statusOf = (r: { body: AnswerResponse }, id: string) =>
      r.body.session.items.find((i) => i.item.id === id)?.status;
    const say = (itemId: string, text: string) =>
      l.api.post<AnswerResponse>(`/practice/sessions/${res.body.id}/answer`, {
        client_turn_id: randomUUID(),
        item_id: itemId,
        text,
      });

    // The right noun, lower case, without its article: right (#146), and the reply shows the
    // whole word so the gender is seen once more.
    const kitchen = idOf('the kitchen');
    const noArticle = await say(kitchen, 'küche');
    expect(noArticle.body.verdict).toBe('correct');
    expect(noArticle.body.reply.text).toBe(
      t('de', 'practice.correct_article', { answer: 'die Küche' }),
    );
    expect(statusOf(noArticle, kitchen)).not.toBe('open');
    // The key keeps its article: the shortened form is not learned as an answer.
    const key = await env.db.one<{ answer: string; accepted_answers: string[] }>(
      `select answer, accepted_answers from items where id = $1`,
      [kitchen],
    );
    expect(key.answer).toBe('die Küche');
    expect(key.accepted_answers).not.toContain('Küche');

    // Another article in its place is the wrong gender: partly right, and the reply says so. The
    // question stays open; from the second try on the whole word is shown, as for a slip (#207).
    const bike = idOf('the bike');
    const otherArticle = await say(bike, 'die Fahrrad');
    expect(otherArticle.body.verdict).toBe('partially_correct');
    expect(otherArticle.body.reply.text).toBe(t('de', 'practice.other_article'));
    expect(statusOf(otherArticle, bike)).toBe('open');
    const again = await say(bike, 'der Fahrrad');
    expect(again.body.verdict).toBe('partially_correct');
    expect(again.body.reply.text).toBe(t('de', 'practice.typo', { answer: 'das Fahrrad' }));
    expect((await say(bike, 'das Fahrrad')).body.verdict).toBe('correct');
    // Code decided all of it: the tutor was never asked.
    expect(env.llm.callsFor('tutor')).toHaveLength(0);
  });
});
