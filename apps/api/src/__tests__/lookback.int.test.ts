// Looking back (gaps.md #7; modules/buddy/lookback.ts): after a practice, Buddy may name
// in the chat what now sits that was shaky days ago. Code decides when and about what
// (real practice history), the model phrases it; it is rare, never pushed, never invented.
// Real Postgres; only the model is scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const question = (prompt: string) => ({
  kind: 'multiple_choice',
  prompt,
  answer: '2/4',
  accepted_answers: [],
  unit: null,
  choices: ['2/4', '3/5'],
  correct_choice: 0,
  topic: 'Brüche erweitern',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

const WAIT = { lookups: [], disposition: 'wait', reason: 'n/a', actions: [], outreach: null };
const SAID = 'Vor einer Woche war Brüche erweitern noch wacklig – jetzt sitzt es.';
const DAY = 86_400_000;

describe.skipIf(!dbReady)('Looking back', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-10T14:00:00Z' });
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

  const text = (req: LlmRequest) => ScriptedGateway.textOf(req);

  async function answer(s: SessionView, index: number, choice: number): Promise<void> {
    const res = await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[index]!.item.id,
      choice,
    });
    expect(res.status).toBe(200);
  }

  /** Day 0: a practice where one question needed a second try (the topic is shaky). */
  async function shakyPractice(...checks: Parameters<ScriptedGateway['script']>[1][]) {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche erweitern',
        subject: null,
        items: [question('Erweitere 1/2 mit 2.'), question('Erweitere 1/2 zu Vierteln.')],
      },
    });
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Brüche erweitern',
      })
    ).body;
    // A wrong choice closes the first question (not right at once): the topic is shaky.
    await answer(s, 0, 1);
    await answer(s, 1, 0);
    env.llm.script('buddy_check', ...checks);
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();
    return s;
  }

  /** A later practice of the same questions, all right at once. */
  async function securePractice(
    materialId: string,
    check: Parameters<ScriptedGateway['script']>[1],
  ) {
    const s = (await l.api.post<SessionView>('/practice/sessions', { material_id: materialId }))
      .body;
    expect(s.items.length).toBe(2);
    for (let i = 0; i < s.items.length; i++) await answer(s, i, 0);
    env.llm.script('buddy_check', check);
    await l.api.post(`/practice/sessions/${s.id}/finish`, {});
    await env.flushBackground();
    return s;
  }

  const materialOf = async (s: SessionView) =>
    (
      await env.db.one<{ material_id: string }>(`select material_id from items where id = $1`, [
        s.items[0]!.item.id,
      ])
    ).material_id;

  const buddyTexts = async () =>
    (
      await env.db.query<{ text: string }>(
        `select text from buddy_messages where learner_id = $1 and role = 'buddy' order by seq`,
        [l.learnerId],
      )
    ).map((m) => m.text);

  it('names what now sits a week later — once, in the app only, and not again soon', async () => {
    const first = await shakyPractice((req) => {
      // Shaky just now: nothing to look back on yet.
      expect(text(req)).not.toContain('LOOK BACK');
      return WAIT;
    });
    const materialId = await materialOf(first);

    env.clock.advance(8 * DAY);
    await securePractice(materialId, (req) => {
      const seen = text(req);
      expect(seen).toContain('LOOK BACK');
      expect(seen).toContain('"Brüche erweitern"');
      expect(seen).toContain('8 days ago');
      return { ...WAIT, disposition: 'act', look_back: { fact: 'p1', text: SAID } };
    });

    expect(await buddyTexts()).toEqual([SAID]);
    const rows = await env.db.query<{ topic: string; said_at: Date; shaky_at: Date }>(
      `select topic, said_at, shaky_at from buddy_lookbacks where learner_id = $1`,
      [l.learnerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.topic).toBe('Brüche erweitern');
    // App clock (rule 7).
    expect(rows[0]!.said_at.toISOString()).toBe('2026-09-18T14:00:00.000Z');
    expect(rows[0]!.shaky_at.toISOString()).toBe('2026-09-10T14:00:00.000Z');
    // Never to the phone: no outreach, no push.
    expect(
      await env.db.query(`select 1 from buddy_outreach where learner_id = $1`, [l.learnerId]),
    ).toHaveLength(0);
    expect(env.push.sent).toHaveLength(0);
    // It is in the thread the app shows.
    const home = await l.api.get<BuddyHome>('/buddy');
    expect(home.body.thread.map((m) => m.text)).toContain(SAID);
    expect(home.body.working).toBeNull();
    // Part of her data export.
    const exported = await l.api.get<{ buddy_lookbacks: unknown[] }>('/account/export');
    expect(exported.body.buddy_lookbacks).toHaveLength(1);

    // Two days later, again all right: no second look back within a week.
    env.clock.advance(2 * DAY);
    await securePractice(materialId, (req) => {
      expect(text(req)).not.toContain('LOOK BACK');
      return WAIT;
    });
    expect(await buddyTexts()).toEqual([SAID]);
  });

  it('refuses a look back that was not offered (never invented) and asks again', async () => {
    await shakyPractice(
      (req) => {
        expect(text(req)).not.toContain('LOOK BACK');
        return { ...WAIT, disposition: 'act', look_back: { fact: 'p1', text: 'Das sitzt jetzt!' } };
      },
      // The repair round: told why, it answers without.
      (req) => {
        expect(text(req)).toContain('nothing to look back on');
        return WAIT;
      },
    );
    expect(env.llm.callsFor('buddy_check')).toHaveLength(2);
    const decisions = await env.db.query<{ disposition: string; errors: string[] | null }>(
      `select disposition, errors from buddy_decisions where learner_id = $1 order by created_at`,
      [l.learnerId],
    );
    const rejected = decisions.filter((d) => d.disposition === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(JSON.stringify(rejected[0]!.errors)).toContain('nothing to look back on');
    expect(await buddyTexts()).toEqual([]);
    expect(
      await env.db.query(`select 1 from buddy_lookbacks where learner_id = $1`, [l.learnerId]),
    ).toHaveLength(0);
  });

  it('stays silent when the topic is still shaky, or was shaky only days ago', async () => {
    const first = await shakyPractice(() => WAIT);
    const materialId = await materialOf(first);
    // Three days later all right: too soon to call it progress (shaky ≥ 5 days ago).
    env.clock.advance(3 * DAY);
    await securePractice(materialId, (req) => {
      expect(text(req)).not.toContain('LOOK BACK');
      return WAIT;
    });
    expect(await buddyTexts()).toEqual([]);
  });
  it('shows "practiced today" from her own answers, in her time zone', async () => {
    const home = async () => (await l.api.get<BuddyHome>('/buddy')).body.practiced_today;
    expect(await home()).toBe(false);
    await shakyPractice(() => WAIT);
    expect(await home()).toBe(true);
    // 16:00 in Berlin; nine hours later it is the next day there.
    env.clock.hours(9);
    expect(await home()).toBe(false);
  });
});
