// "Die wackligen nochmal" / "Mehr davon, etwas schwerer" stays in the world of the practice
// it follows (issue #58: the follow-up asked things she never had): the test and its sheets
// when there is one, else the questions she just worked on as the pattern.
// requires live verification in Claude Code session (needs a running Postgres)

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ScriptedGateway } from '../testing/fakes.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const draft = (over: Record<string, unknown>) => ({
  kind: 'short',
  prompt: 'Frage',
  answer: 'Antwort',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Thema',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
  ...over,
});

describe.skipIf(!dbReady)('more of the same after a practice', () => {
  let env: TestEnv;
  let l: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    await env.db.query(`update learners set level = 'school', grade = 7 where id = $1`, [
      l.learnerId,
    ]);
  });
  afterAll(async () => {
    await env?.close();
  });

  it('keeps to the sheets of the test the finished practice belonged to', async () => {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date, topics)
       values ($1, 'exam', 'Mathearbeit Brüche', '2026-10-01', '{Brüche}') returning id`,
      [l.learnerId],
    );
    const sheet = await env.db.one<{ id: string }>(
      `insert into materials (learner_id, client_request_id, status, photo_count, created_at,
                              goal_id, title, extracted_text)
       values ($1, gen_random_uuid(), 'ready', 1, $2, $3, 'Blatt Brüche',
               '1. Kürze 6/8. 2. Erweitere 3/4 mit 5.') returning id`,
      [l.learnerId, env.clock.now(), goal.id],
    );
    for (const [prompt, topic] of [
      ['Kürze 6/8.', 'Brüche kürzen'],
      ['Erweitere 3/4 mit 5.', 'Brüche erweitern'],
    ] as const) {
      await env.db.query(
        `insert into items (learner_id, material_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, $2, 'short', $3, '3/4', $4, 2, 'material')`,
        [l.learnerId, sheet.id, prompt, topic],
      );
    }
    const first = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, goal_id, title, client_request_id,
                                      started_at, last_activity_at)
       values ($1, 'practice', 'finished', $2, 'Brüche', gen_random_uuid(), $3, $3) returning id`,
      [l.learnerId, goal.id, env.clock.now()],
    );

    let seen = '';
    env.llm.script('explain', (req) => {
      seen = ScriptedGateway.textOf(req);
      // The schema offers only the sheet's topics: nothing else can come back.
      expect(JSON.stringify(req.schema)).toContain('"enum":["Brüche erweitern","Brüche kürzen"]');
      return {
        usable: true,
        title: 'Brüche, nochmal',
        subject: null,
        intro: null,
        items: [
          draft({ prompt: 'Kürze 9/12.', answer: '3/4', topic: 'Brüche kürzen' }),
          // Not on the sheet: dropped by the schema rule.
          draft({ prompt: 'Berechne 2/3 · 3/5.', answer: '2/5', topic: 'Brüche kürzen' }),
        ],
      };
    });
    const again = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Nochmal üben: Brüche kürzen (Brüche)',
      from_session_id: first.id,
    });
    expect(again.status).toBe(201);
    expect(seen).toContain('TOPICS: Brüche erweitern | Brüche kürzen');
    expect(seen).toContain('Kürze 6/8');
    const session = await env.db.one<{ goal_id: string | null }>(
      `select goal_id from practice_sessions where id = $1`,
      [again.body.id],
    );
    expect(session.goal_id).toBe(goal.id);
  });

  it('without a test: the questions she just did are the pattern', async () => {
    const session = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id, started_at, last_activity_at)
       values ($1, 'practice', 'finished', 'Englisch', gen_random_uuid(), $2, $2) returning id`,
      [l.learnerId, env.clock.now()],
    );
    const items: string[] = [];
    for (const [prompt, topic] of [
      ['Setze ein: She ___ (to go) to school.', 'Simple Present'],
      ['Setze ein: They ___ (to play) football.', 'Simple Present'],
    ] as const) {
      const item = await env.db.one<{ id: string }>(
        `insert into items (learner_id, kind, prompt, answer, topic, difficulty, origin)
         values ($1, 'short', $2, 'goes', $3, 2, 'buddy') returning id`,
        [l.learnerId, prompt, topic],
      );
      items.push(item.id);
    }
    for (const [position, itemId] of items.entries()) {
      await env.db.query(
        `insert into session_items (session_id, item_id, position, status)
         values ($1, $2, $3, 'correct')`,
        [session.id, itemId, position],
      );
    }

    let seen = '';
    env.llm.script('explain', (req) => {
      seen = ScriptedGateway.textOf(req);
      return {
        usable: true,
        title: 'Simple Present, mehr davon',
        subject: null,
        intro: null,
        items: [draft({ prompt: 'Setze ein: He ___ (to read) a book.', answer: 'reads' })],
      };
    });
    const again = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Mehr davon, etwas schwerer: Simple Present (Englisch)',
      from_session_id: session.id,
    });
    expect(again.status).toBe(201);
    expect(seen).toContain('SHE JUST WORKED ON THESE');
    expect(seen).toContain('She ___ (to go) to school.');
    expect(seen).toContain('TOPICS: Simple Present');
  });

  it('another learner’s session is none of hers', async () => {
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-05-01' });
    const hers = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id, started_at, last_activity_at)
       values ($1, 'practice', 'finished', 'Mia', gen_random_uuid(), $2, $2) returning id`,
      [other.learnerId, env.clock.now()],
    );
    env.llm.script('explain', (req) => {
      // No pattern from a session that is not hers.
      expect(ScriptedGateway.textOf(req)).not.toContain('SHE JUST WORKED ON THESE');
      return {
        usable: true,
        title: 'Nochmal',
        subject: null,
        intro: null,
        items: [draft({})],
      };
    });
    const again = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'practice',
      text: 'Nochmal üben: irgendwas',
      from_session_id: hers.id,
    });
    expect(again.status).toBe(201);
  });
});
