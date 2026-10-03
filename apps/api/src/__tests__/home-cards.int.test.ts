// The one card on top of the home: a finished round never hides the practice that is
// ready for a test (user feedback 2026-09-27 #2). docs/architecture.md §Home.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { BuddyHome, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const topicItems = {
  json: {
    usable: true,
    title: 'Brüche',
    subject: null,
    items: [
      {
        kind: 'numeric',
        prompt: 'Kürze 2/4 und gib das Ergebnis als Dezimalzahl an.',
        answer: '0.5',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Brüche kürzen',
        difficulty: 2,
        prompt_lang: null,
        lang: null,
        figure: null,
        source_excerpt: null,
      },
    ],
  },
};

describe.skipIf(!dbReady)('home: the card on top', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(() => env.closeChecked());

  /** Practice Buddy prepared for Thursday's test, for the given learner. */
  async function preparedForTest(learnerId: string, plannedDate: string | null = null) {
    const goal = await env.db.one<{ id: string }>(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', 'Mathearbeit Brüche', '2026-10-01') returning id`,
      [learnerId],
    );
    const step = await env.db.one<{ id: string }>(
      `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at, created_at)
       values ($1, $2, 'practice', 'Mathearbeit Brüche', 'prepared', $3, $4, $5, $5) returning id`,
      [
        learnerId,
        goal.id,
        plannedDate,
        {
          item_ids: [randomUUID(), randomUUID()],
          est_minutes: 5,
          focus_topics: ['Brüche addieren'],
        },
        env.clock.now(),
      ],
    );
    return { goalId: goal.id, stepId: step.id };
  }

  /** A short round on another topic, answered and finished. */
  async function shortRound(): Promise<SessionView> {
    env.llm.script('explain', topicItems);
    const s = (
      await l.api.post<SessionView>('/practice/topic', {
        client_request_id: randomUUID(),
        kind: 'practice',
        text: 'Brüche kürzen',
      })
    ).body;
    const res = await l.api.post(`/practice/sessions/${s.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: s.items[0]!.item.id,
      text: '0,5',
    });
    expect(res.status).toBe(200);
    // Finishing wakes Buddy to look at what comes next; here it adds nothing.
    env.llm.script('buddy_check', {
      json: {
        disposition: 'wait',
        reason: 'Practice is ready already.',
        actions: [],
        outreach: null,
      },
    });
    expect((await l.api.post(`/practice/sessions/${s.id}/finish`)).status).toBe(200);
    await env.flushBackground();
    return s;
  }

  it('shows the prepared test practice with the result of an unrelated round', async () => {
    const { goalId, stepId } = await preparedForTest(l.learnerId);
    expect((await l.api.get<BuddyHome>('/buddy')).body.now).toMatchObject({
      type: 'practice_ready',
      step_id: stepId,
    });

    const s = await shortRound();
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    // Before: only the result, and "Übung bereit" was invisible for 30 minutes.
    expect(home.now).toMatchObject({
      type: 'practice_result',
      session_id: s.id,
      next: {
        step_id: stepId,
        title: 'Mathearbeit Brüche',
        question_count: 2,
        est_minutes: 5,
        focus_topics: ['Brüche addieren'],
        goal: { id: goalId, due_date: '2026-10-01', days_left: 3 },
      },
    });

    // Half an hour later the result is gone and the practice is the card again.
    env.clock.minutes(31);
    expect((await l.api.get<BuddyHome>('/buddy')).body.now).toMatchObject({
      type: 'practice_ready',
      step_id: stepId,
    });
  });

  it('offers nothing next that is not ready today or not hers', async () => {
    // Moved to tomorrow with "Heute nicht": not offered today.
    await preparedForTest(l.learnerId, '2026-09-29');
    // Another learner's prepared practice never shows up here.
    const other = await onboard(env, { relation: 'self', name: 'Jonas', birthDate: '2000-01-01' });
    await preparedForTest(other.learnerId);

    await shortRound();
    const home = (await l.api.get<BuddyHome>('/buddy')).body;
    expect(home.now).toMatchObject({ type: 'practice_result', next: null });
  });
});
