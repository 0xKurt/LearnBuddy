// A practice must never read as finished at the moment she starts it (issue #643, owner 14.10.:
// "übungen sind bereits beendet wenn man sie startet"). An offer's card sends its action id as
// the run's request id, so the same card always opens the same run. The scheduler closes a run
// left alone for three days ('abandoned'); her tap on its card then answered "Los geht's" with
// that closed run — on the phone "Diese Übung ist schon beendet." Her tap is new activity: the
// run goes on where she left it. A finished run stays finished, and another learner's run is
// never reopened by her request id.
// requires live verification in Claude Code session (needs a running Postgres)

import { randomUUID } from 'node:crypto';

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTick } from '../modules/scheduler/tick.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const WAIT = { json: { disposition: 'wait', reason: 'n/a', actions: [], outreach: null } };

const item = (prompt: string, answer: string) => ({
  kind: 'short',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Kürzen',
  difficulty: 2,
  prompt_lang: null,
  lang: null,
  figure: null,
  source_excerpt: null,
});

describe.skipIf(!dbReady)('an offer never opens a run that rested past its limit', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-14T14:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Testkind', birthDate: '2014-02-10' });
    env.llm.byDefault('buddy_check', WAIT);
  });
  afterEach(() => env.closeChecked());

  const topic = (requestId: string) =>
    l.api.post<SessionView>('/practice/topic', {
      client_request_id: requestId,
      kind: 'practice',
      text: 'Brüche kürzen',
    });

  it('her tap on the card of an abandoned run goes on with it, where she left it', async () => {
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche kürzen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [item('Kürze 4/8.', '1/2'), item('Kürze 2/6.', '1/3')],
      },
    });
    const offerId = randomUUID();
    const first = (await topic(offerId)).body;
    const answered = await l.api.post<AnswerResponse>(`/practice/sessions/${first.id}/answer`, {
      client_turn_id: randomUUID(),
      item_id: first.items[0]!.item.id,
      text: '1/2',
    });
    expect(answered.status).toBe(200);

    // Four days without her: the sweep closes it.
    env.clock.hours(4 * 24);
    await runTick(env.deps);
    const rested = (await l.api.get<SessionView>(`/practice/sessions/${first.id}`)).body;
    expect(rested.status).toBe('abandoned');

    // The card still says "Los geht's"; her tap must not open a run that reads as over.
    const tapped = await topic(offerId);
    expect(tapped.body.id).toBe(first.id);
    expect(tapped.body.status).toBe('active');
    expect(tapped.body.items.map((i) => i.status)).toEqual(['correct', 'open']);
    // It counts as hers again: the home offers to go on with it (not "nothing to resume").
    const home = await l.api.get<{ now: { type: string; session_id?: string } | null }>('/buddy');
    expect(home.body.now).toMatchObject({ type: 'resume_practice', session_id: first.id });
  });

  it('leaves a finished run finished, and never reopens another learner’s run', async () => {
    const offerId = randomUUID();
    const finished = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id,
                                      started_at, last_activity_at, finished_at)
       values ($1, 'practice', 'finished', 'Brüche', $2, $3, $3, $3) returning id`,
      [l.learnerId, offerId, env.clock.now()],
    );
    expect((await topic(offerId)).body).toMatchObject({ id: finished.id, status: 'finished' });

    // Mia's abandoned run, under the same request id: Testkind's tap starts her own.
    const mia = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2014-02-10' });
    const other = randomUUID();
    const hers = await env.db.one<{ id: string }>(
      `insert into practice_sessions (learner_id, mode, status, title, client_request_id,
                                      started_at, last_activity_at)
       values ($1, 'practice', 'abandoned', 'Brüche', $2, $3, $3) returning id`,
      [mia.learnerId, other, env.clock.now()],
    );
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Brüche kürzen',
        subject: { name: 'Mathe', kind: 'math' },
        items: [item('Kürze 4/8.', '1/2')],
      },
    });
    const own = (await topic(other)).body;
    expect(own.id).not.toBe(hers.id);
    const still = await env.db.one<{ status: string }>(
      `select status from practice_sessions where id = $1`,
      [hers.id],
    );
    expect(still.status).toBe('abandoned');
  });

  it('a Kopfrechnen round closed for resting goes on from its card too', async () => {
    const offerId = randomUUID();
    const spec = { range: 'times', rows: [6, 7] };
    const round = (
      await l.api.post<SessionView>('/practice/drills', { client_request_id: offerId, spec })
    ).body;
    env.clock.hours(4 * 24);
    await runTick(env.deps);
    expect((await l.api.get<SessionView>(`/practice/sessions/${round.id}`)).body.status).toBe(
      'abandoned',
    );
    const again = await l.api.post<SessionView>('/practice/drills', {
      client_request_id: offerId,
      spec,
    });
    expect(again.body).toMatchObject({ id: round.id, status: 'active' });
  });
});
