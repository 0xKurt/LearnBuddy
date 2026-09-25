// Buddy's event log (ADR 0005 §Events and schedules, stage 4): an event is
// written once, in the transaction of the change that caused it; its
// subscriber wakes Buddy; the check marks it handled; it is part of the
// learner's data export. Only the model is scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const QUESTION = {
  kind: 'multiple_choice',
  prompt: 'Welcher Bruch ist größer?',
  answer: '2/3',
  accepted_answers: [],
  unit: null,
  choices: ['2/3', '3/5'],
  correct_choice: 0,
  topic: 'Brüche vergleichen',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
};

describe.skipIf(!dbReady)('Buddy events', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, { relation: 'self' });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.map((u) => u.purpose),
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: [], pending: 0 });
  });

  async function session(items: unknown[]): Promise<SessionView> {
    env.llm.script('explain', {
      json: { usable: true, title: 'Brüche', subject: null, intro: null, items },
    });
    return (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Brüche vergleichen',
      })
    ).body;
  }

  it('records a finished session once, wakes Buddy with it and marks it handled', async () => {
    const s = await session([QUESTION]);
    await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[0]!.item.id,
      choice: 0,
    });
    env.llm.script('buddy_check', (req) => {
      // The check was woken by the event.
      expect(JSON.stringify(req.contents)).toContain('the learner just finished practice');
      return { lookups: [], disposition: 'wait', reason: 'n/a', actions: [], outreach: null };
    });
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    // Finishing again changes nothing: still one event, one wake-up.
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();

    const events = await env.db.query<{
      id: string;
      type: string;
      ref_id: string;
      data: { answered: number };
      created_at: Date;
      handled_at: Date | null;
    }>(`select * from buddy_events where learner_id = $1`, [l.learnerId]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'session_finished', ref_id: s.id });
    expect(events[0]!.data.answered).toBe(1);
    // App clock, not the database clock.
    expect(events[0]!.created_at.toISOString()).toBe('2026-09-28T14:00:00.000Z');
    expect(events[0]!.handled_at).not.toBeNull();

    const jobs = await env.db.query<{ payload: { event_id: string } }>(
      `select payload from jobs where learner_id = $1 and kind = 'buddy_check'
         and payload->>'reason' = 'session_finished'`,
      [l.learnerId],
    );
    expect(jobs.map((j) => j.payload.event_id)).toEqual([events[0]!.id]);

    // The event log is part of the learner's data export.
    const exported = await l.api.get<{ buddy_events: unknown[] }>('/account/export');
    expect(exported.body.buddy_events).toHaveLength(1);
  });

  it('records nothing for a session left without an answer', async () => {
    const s = await session([QUESTION]);
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();
    expect(
      await env.db.query(`select 1 from buddy_events where learner_id = $1`, [l.learnerId]),
    ).toHaveLength(0);
  });
});
