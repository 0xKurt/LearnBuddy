// The endpoints the other integration tests do not reach (found by the wiring
// audit, apps/mobile/lib/__tests__/wiring.test.ts): the earlier conversation,
// changing the profile, "a message was opened", and a phone that signs out.
// Each with its failure paths: stale versions, other learners' ids, repeats.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, LearnerView } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('endpoints outside the main journeys', () => {
  let env: TestEnv;
  let lena: Learner;
  let tom: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    tom = await onboard(env, {
      relation: 'child',
      name: 'Tom',
      birthDate: '2013-05-01',
      pin: '1357',
    });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('pages back through the conversation, oldest last, only her own', async () => {
    // 35 earlier messages (more than one page of 30).
    await env.db.query(
      `insert into buddy_messages (learner_id, role, text, created_at)
       select $1, case when n % 2 = 0 then 'learner' else 'buddy' end, 'Nachricht ' || n,
              $2::timestamptz + n * interval '1 minute'
         from generate_series(1, 35) as n`,
      [lena.learnerId, '2026-09-27T10:00:00Z'],
    );
    const first = await lena.api.get<{
      messages: { id: string; text: string }[];
      has_more: boolean;
    }>('/buddy/thread');
    expect(first.status).toBe(200);
    expect(first.body.messages).toHaveLength(30);
    expect(first.body.messages.at(-1)?.text).toBe('Nachricht 35');
    expect(first.body.has_more).toBe(true);
    const older = await lena.api.get<{ messages: { text: string }[]; has_more: boolean }>(
      `/buddy/thread?before=${first.body.messages[0]!.id}`,
    );
    expect(older.body.messages.map((m) => m.text)).toEqual([
      'Nachricht 1',
      'Nachricht 2',
      'Nachricht 3',
      'Nachricht 4',
      'Nachricht 5',
    ]);
    expect(older.body.has_more).toBe(false);
    // Tom sees none of it, not even with her message id.
    const foreign = await tom.api.get<{ messages: unknown[] }>(
      `/buddy/thread?before=${first.body.messages[0]!.id}`,
    );
    expect(foreign.body.messages ?? []).toEqual([]);
    expect((await lena.api.get('/buddy/thread?before=not-an-id')).status).toBe(422);
  });

  it('changes the profile with its version; a stale version is refused', async () => {
    const me = await lena.api.get<{ learner: LearnerView }>('/me');
    const v = me.body.learner.version;
    const renamed = await lena.api.patch<LearnerView>('/learner', {
      display_name: 'Lenchen',
      locale: 'en',
      level: 'school',
      grade: 7,
      version: v,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ display_name: 'Lenchen', locale: 'en', grade: 7 });
    // The same change again with the old version: someone changed it meanwhile.
    const stale = await lena.api.patch('/learner', { display_name: 'Lena', version: v });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'stale' } });
    // Buddy sees the new name.
    expect((await lena.api.get<BuddyHome>('/buddy')).body.learner.name).toBe('Lenchen');
    expect((await lena.api.patch('/learner', { display_name: '', version: v + 1 })).status).toBe(
      422,
    );
  });

  it('records when a message was first opened and her latest answer, only for her', async () => {
    const [row] = await env.db.query<{ id: string }>(
      `insert into buddy_outreach (learner_id, kind, origin, topic_key, dedupe_key, title, body,
                                   status, expires_at)
       values ($1, 'idea', 'buddy', 'exam:g1:prep', 'test-opened', 'Übung bereit', 'Kurz üben?',
               'provider_accepted', $2)
       returning id`,
      [lena.learnerId, '2026-09-30T00:00:00Z'],
    );
    const id = row!.id;
    expect((await tom.api.post(`/buddy/outreach/${id}/opened`, { response: null })).status).toBe(
      404,
    );
    const opened = await lena.api.post<BuddyHome>(`/buddy/outreach/${id}/opened`, {
      response: 'start',
    });
    expect(opened.status).toBe(200);
    env.clock.advance(60_000);
    // A second tap keeps when it was first opened; her latest answer counts.
    await lena.api.post(`/buddy/outreach/${id}/opened`, { response: 'later' });
    const stored = await env.db.one<{ opened_at: Date; response: string }>(
      `select opened_at, response from buddy_outreach where id = $1`,
      [id],
    );
    expect(stored.opened_at.toISOString()).toBe('2026-09-28T14:00:00.000Z');
    expect(stored.response).toBe('later');
  });

  it('forgets this phone when she signs out; nobody else can remove her phone', async () => {
    const token = 'ExponentPushToken[lena-phone-0001]';
    expect((await lena.api.post('/buddy/push-tokens', { token, platform: 'ios' })).status).toBe(
      200,
    );
    const count = async () =>
      (
        await env.db.one<{ n: number }>(
          `select count(*)::int as n from push_tokens where token = $1`,
          [token],
        )
      ).n;
    expect((await tom.api.delete('/buddy/push-tokens', { token })).status).toBe(200);
    expect(await count()).toBe(1);
    expect((await lena.api.delete('/buddy/push-tokens', { token })).status).toBe(200);
    expect(await count()).toBe(0);
    // Again (a retry after a lost answer): fine, nothing left.
    expect((await lena.api.delete('/buddy/push-tokens', { token })).status).toBe(200);
  });
});
