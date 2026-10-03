// Two findings of the refactor audit (#311), checked against the running code before anything
// was changed (issue #315):
//   1. three places bumped `context_version` by hand instead of through `bumpContext`
//      (identity PATCH /learner, the decision apply, the in-app post of a delivery). Each
//      must still move the context on exactly as before, in the same transaction — a decision
//      made on the version before must be stale, and a change that is rolled back must not
//      have moved it (CLAUDE.md rule 4, docs/architecture.md §Buddy decisions).
//   2. the learner's zone was read 8× with a fallback and once without: `answerItem` threw
//      "expected exactly one row" for a learner without a settings row instead of using the
//      default zone (docs/architecture.md §Time).
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { SendMessageResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE, learnerTimezone, learnerZoneSql } from '../lib/zone.js';
import { scheduleStepReminder } from '../modules/buddy/plan.js';
import { answerItem, type PracticeLearner } from '../modules/practice/service.js';
import { testDatabaseAvailable } from '../testing/database.js';
import {
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type Learner,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const versionOf = async (env: TestEnv, learnerId: string): Promise<number> =>
  (
    await env.db.one<{ v: number }>(
      `select context_version as v from buddy_settings where learner_id = $1`,
      [learnerId],
    )
  ).v;

describe.skipIf(!dbReady)('audit #315: context bumps and the learner zone', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    // Monday 2026-09-28, 10:00 in Berlin.
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env);
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

  describe('finding 1: the context moves on with the change, never without it', () => {
    it('a profile change moves it once; a refused (stale) one leaves it where it was', async () => {
      // A first request settles the zone header, so only the change itself is measured.
      await l.api.get('/me');
      const before = await versionOf(env, l.learnerId);
      const renamed = await l.api.patch<{ version: number }>('/learner', {
        display_name: 'Alexa',
        version: 1,
      });
      expect(renamed.status).toBe(200);
      expect(await versionOf(env, l.learnerId)).toBe(before + 1);

      // The same old version again: refused, and the bump is rolled back with it.
      const stale = await l.api.patch('/learner', { display_name: 'Alex', version: 1 });
      expect(stale.status).toBe(409);
      expect(await versionOf(env, l.learnerId)).toBe(before + 1);
    });

    it('a decision that only replies moves it in the apply', async () => {
      await l.api.get('/me');
      const before = await versionOf(env, l.learnerId);
      env.llm.script('buddy_turn', {
        json: { concern: false, reply: 'Hallo!', options: null, actions: [] },
      });
      const res = await l.api.post<SendMessageResponse>('/buddy/messages', {
        client_message_id: randomUUID(),
        text: 'Hallo',
      });
      expect(res.body.status).toBe('done');
      // Two steps, as on main before the change: her message is stored (turn.ts), then the
      // decision is applied (apply.ts). Without the apply's bump this would be +1.
      expect(await versionOf(env, l.learnerId)).toBe(before + 2);
    });

    it('a reminder posted into the thread moves it, so a decision from before is stale', async () => {
      await env.db.tx(async (tx) => {
        const step = await tx.one<{ id: string; version: number }>(
          `insert into buddy_steps (learner_id, kind, title, state, planned_date, planned_time, agreed)
           values ($1, 'practice', 'Geschichte wiederholen', 'planned', '2026-09-28', '17:00', true)
           returning id, version`,
          [l.learnerId],
        );
        await scheduleStepReminder(tx, l.learnerId, step, new Date('2026-09-28T15:00:00Z'));
      });
      const before = await versionOf(env, l.learnerId);
      env.clock.set('2026-09-28T15:00:00Z');
      const tick = await env.app.request('/v1/internal/tick', {
        method: 'POST',
        headers: { 'x-tick-secret': TEST_TICK_SECRET },
      });
      expect(tick.status).toBe(200);
      const posted = await env.db.query<{ text: string }>(
        `select text from buddy_messages where learner_id = $1 and outreach_id is not null`,
        [l.learnerId],
      );
      expect(posted.map((m) => m.text)).toEqual(['Wie verabredet: Geschichte wiederholen.']);
      // As on main before the change: the reminder's step moves on, and the post into the
      // thread moves it once more (delivery.ts). Without the post's bump this would be +1.
      expect(await versionOf(env, l.learnerId)).toBe(before + 2);
    });
  });

  describe('finding 2: no settings row means the default zone, not an error', () => {
    it('reads the stored zone, and the default when there is no row', async () => {
      const kim = await onboard(env, { timezone: 'America/New_York' });
      expect(await learnerTimezone(env.db, kim.learnerId)).toBe('America/New_York');
      await env.db.query(`delete from buddy_settings where learner_id = $1`, [kim.learnerId]);
      expect(await learnerTimezone(env.db, kim.learnerId)).toBe(DEFAULT_TIMEZONE);
      // The batch form reads the same for many learners at once.
      const both = await env.db.query<{ id: string; timezone: string }>(
        `select l.id, ${learnerZoneSql('l.id', 3)} as timezone
           from learners l where l.id = any($1::uuid[]) order by l.id = $2`,
        [[l.learnerId, kim.learnerId], kim.learnerId, DEFAULT_TIMEZONE],
      );
      expect(both.map((r) => r.timezone)).toEqual(['Europe/Berlin', DEFAULT_TIMEZONE]);
    });

    it('grades with the tutor for a learner whose settings row is missing', async () => {
      env.llm.script('explain', {
        json: {
          usable: true,
          title: 'Erörterung',
          subject: null,
          items: [
            {
              kind: 'long',
              prompt: 'Erörtere, ob der Unterricht später beginnen sollte.',
              answer: 'Pro: mehr Schlaf. Contra: Busfahrplan. Ein Urteil am Ende.',
              accepted_answers: [],
              unit: null,
              choices: null,
              correct_choice: null,
              topic: 'Erörterung',
              difficulty: 2,
              prompt_lang: null,
              lang: null,
              figure: null,
              source_excerpt: null,
            },
          ],
        },
      });
      const started = await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Erörterung',
      });
      expect(started.status).toBe(201);
      await env.flushBackground();
      const session = (await l.api.get<SessionView>(`/practice/sessions/${started.body.id}`)).body;
      const itemId = session.items[0]!.item.id;

      // A profile without a settings row (the HTTP middleware creates one on every request, so
      // this is the service as a job or another module would call it).
      const learner = await env.db.one<PracticeLearner>(
        `select id, display_name, locale, level, grade, birth_date::text as birth_date,
                curriculum_region
           from learners where id = $1`,
        [l.learnerId],
      );
      await env.db.query(`delete from buddy_settings where learner_id = $1`, [l.learnerId]);

      env.llm.script('tutor', {
        json: {
          intent: 'answer',
          verdict: 'incorrect',
          reply: 'Da steckt ein Gedanke drin.',
          gave_hint: false,
          revealed_answer: false,
        },
      });
      const res = await answerItem(env.deps, learner, session.id, {
        client_turn_id: randomUUID(),
        item_id: itemId,
        text: 'Ich finde später ist besser.',
      });
      expect(res.reply.text).toBe('Da steckt ein Gedanke drin.');
    });
  });
});
