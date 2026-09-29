// What was talked about on the days before (issue #22): a conversation that has come to
// rest is written down in two to four sentences, and the newest of those travel in Buddy's
// context. What must hold: only a conversation that ended, once per stretch, never a guess
// when the model fails — and the next conversation is never stuck behind a failed one.
// requires live verification in Claude Code session (needs a running Postgres; scripted model)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildContext } from '../modules/buddy/context.js';
import { loadBuddyState } from '../modules/buddy/state.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const HOUR = 3_600_000;

async function tick(env: TestEnv): Promise<void> {
  const res = await env.app.request('/v1/internal/tick', {
    method: 'POST',
    headers: { 'x-tick-secret': TEST_TICK_SECRET },
  });
  expect(res.status).toBe(200);
  await env.flushBackground();
}

/** Messages as they stand after a turn — written straight in, so no model is needed. */
async function said(
  env: TestEnv,
  l: Learner,
  at: Date,
  lines: Array<['learner' | 'buddy', string]>,
): Promise<void> {
  for (const [i, [role, text]] of lines.entries()) {
    await env.db.query(
      `insert into buddy_messages (learner_id, role, text, status, created_at)
       values ($1, $2, $3, 'done', $4)`,
      [l.learnerId, role, text, new Date(at.getTime() + i * 60_000)],
    );
  }
}

describe.skipIf(!dbReady)('summaries of earlier conversations', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-29T09:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('writes down a conversation that ended — and leaves a running one alone', async () => {
    const yesterday = new Date(env.clock.now().getTime() - 26 * HOUR);
    await said(env, l, yesterday, [
      ['learner', 'ich schreib freitag eine mathearbeit über brüche'],
      ['buddy', 'Eingetragen. Magst du mir das Blatt fotografieren?'],
      ['learner', 'ja mach ich später'],
      ['buddy', 'Super, ich frag dich nachher nochmal.'],
    ]);
    // The conversation of right now must not be summarised: it is still going.
    await said(env, l, new Date(env.clock.now().getTime() - 5 * 60_000), [
      ['learner', 'bin wieder da'],
      ['buddy', 'Schön! Womit fangen wir an?'],
    ]);
    env.llm.byDefault('summary', {
      json: {
        summary:
          'Sie schreibt am Freitag eine Mathearbeit über Brüche. Sie wollte das Arbeitsblatt später fotografieren.',
        topics: ['Mathearbeit', 'Brüche'],
      },
    });
    await tick(env);

    const rows = await env.db.query<{
      summary: string;
      topics: string[];
      until_message_id: string;
    }>(
      `select summary, topics, until_message_id from buddy_session_summaries where learner_id = $1`,
      [l.learnerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.summary).toContain('Brüche');
    // Exactly the conversation that ended: the last of yesterday's four messages.
    const last = await env.db.one<{ text: string }>(
      `select text from buddy_messages where id = $1`,
      [rows[0]!.until_message_id],
    );
    expect(last.text).toBe('Super, ich frag dich nachher nochmal.');

    // Buddy's context carries it, with its day.
    const state = await loadBuddyState(env.db, l.learnerId, env.clock.now());
    expect(state.summaries).toHaveLength(1);
    const context = buildContext(
      {
        display_name: 'Lena',
        birth_date: '2014-02-10',
        level: 'school',
        grade: 6,
        locale: 'de',
        isMinor: true,
      },
      state,
      env.clock.now(),
    );
    expect(context.state).toContain('Earlier conversations');
    expect(context.state).toContain('Brüche');

    // Nothing is written twice: a second tick has nothing left to do.
    await tick(env);
    const again = await env.db.query(
      `select 1 from buddy_session_summaries where learner_id = $1`,
      [l.learnerId],
    );
    expect(again).toHaveLength(1);
  });

  it('a conversation the model cannot write down does not block the next one', async () => {
    const other = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2013-05-04' });
    const long = new Date(env.clock.now().getTime() - 30 * HOUR);
    await said(env, other, long, [
      ['learner', 'hi'],
      ['buddy', 'Hallo!'],
      ['learner', 'was machen wir heute'],
      ['buddy', 'Magst du Vokabeln üben?'],
    ]);
    // The model answers something that is not a summary, every time.
    env.llm.byDefault('summary', { json: { nonsense: true } });
    for (let i = 0; i < 4; i++) await tick(env);

    const rows = await env.db.query<{ summary: string }>(
      `select summary from buddy_session_summaries where learner_id = $1`,
      [other.learnerId],
    );
    // Either nothing yet, or the empty row the terminal effect writes — never invented words.
    for (const r of rows) expect(r.summary).toBe('—');
    const parked = await env.db.query<{ result: { terminal?: string } }>(
      `select result from jobs where learner_id = $1 and kind = 'summarise_session' and status = 'failed'`,
      [other.learnerId],
    );
    if (parked.length > 0) {
      expect(rows).toHaveLength(1);
      // The empty summary never reaches the context: Buddy says nothing about that day.
      const state = await loadBuddyState(env.db, other.learnerId, env.clock.now());
      expect(state.summaries).toEqual([]);
    }
  });

  it('a conversation of two messages is recorded without asking the model', async () => {
    const short = await onboard(env, { relation: 'child', name: 'Tim', birthDate: '2012-01-20' });
    await said(env, short, new Date(env.clock.now().getTime() - 28 * HOUR), [
      ['learner', 'hey'],
      ['buddy', 'Hallo Tim!'],
    ]);
    env.llm.byDefault('summary', { json: { summary: 'sollte nicht passieren', topics: [] } });
    const before = env.llm.callsFor('summary').length;
    await tick(env);
    expect(env.llm.callsFor('summary').length).toBe(before);
    const rows = await env.db.query<{ summary: string }>(
      `select summary from buddy_session_summaries where learner_id = $1`,
      [short.learnerId],
    );
    expect(rows.map((r) => r.summary)).toEqual(['—']);
  });

  it('writes nothing for an account whose consent is outdated (#85)', async () => {
    const stale = await onboard(env, { relation: 'child', name: 'Pia', birthDate: '2013-03-03' });
    await said(env, stale, new Date(env.clock.now().getTime() - 30 * HOUR), [
      ['learner', 'ich hab morgen einen vokabeltest'],
      ['buddy', 'Dann üben wir!'],
      ['learner', 'ja gerne'],
      ['buddy', 'Los geht’s.'],
    ]);
    // The privacy text changed and this account has not agreed again: nothing of hers
    // goes to the model — the summary waits like the photo reading and the Buddy check.
    await env.db.query(
      `update accounts set consent_version = 'older-text'
        where id = (select account_id from learners where id = $1)`,
      [stale.learnerId],
    );
    env.llm.byDefault('summary', { json: { summary: 'darf nicht passieren', topics: [] } });
    const before = env.llm.callsFor('summary').length;
    await tick(env);
    expect(env.llm.callsFor('summary').length).toBe(before);
    const rows = await env.db.query(`select 1 from buddy_session_summaries where learner_id = $1`, [
      stale.learnerId,
    ]);
    expect(rows).toEqual([]);
  });

  it('writes nothing once the account’s deletion is being carried out (#85)', async () => {
    const leaving = await onboard(env, { relation: 'child', name: 'Jo', birthDate: '2013-07-07' });
    await said(env, leaving, new Date(env.clock.now().getTime() - 30 * HOUR), [
      ['learner', 'hi'],
      ['buddy', 'Hallo!'],
      ['learner', 'was üben wir'],
      ['buddy', 'Vokabeln?'],
    ]);
    await env.db.query(
      `update accounts set deletion_started_at = $2
        where id = (select account_id from learners where id = $1)`,
      [leaving.learnerId, env.clock.now()],
    );
    const before = env.llm.callsFor('summary').length;
    await tick(env);
    expect(env.llm.callsFor('summary').length).toBe(before);
    const rows = await env.db.query(`select 1 from buddy_session_summaries where learner_id = $1`, [
      leaving.learnerId,
    ]);
    expect(rows).toEqual([]);
  });

  it('is gone with the account (the cascade, not a job)', async () => {
    const rows = await env.db.query(`select 1 from buddy_session_summaries where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(rows.length).toBeGreaterThan(0);
    await env.db.query(`delete from learners where id = $1`, [l.learnerId]);
    const left = await env.db.query(`select 1 from buddy_session_summaries where learner_id = $1`, [
      l.learnerId,
    ]);
    expect(left).toEqual([]);
  });
});
