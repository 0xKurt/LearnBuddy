// The Bundesland of the learner's school (issue #199), against a real Postgres.
// requires live verification in Claude Code session (needs a running Postgres)
//
// Why this field has a test file of its own: at twelve verified places in
// docs/lehrplan-und-uebungsformen.md the same answer is right in one state and wrong in
// another — the sentence-element analysis of one German sentence has four different expected
// solutions, the operator "vergleichen" needs a closing judgement in Bayern and explicitly
// none in Niedersachsen, the Hypothesentest is compulsory in Berlin/Brandenburg and BW and
// absent from the NRW and Bayern core curriculum. A wrong value here teaches a child
// something that counts as a mistake in her own class test, so it is asked, never guessed.
//
// What must hold:
//   · a new profile without it is refused (owner 2026-10-02: a required field at registration)
//   · a valid value is stored, and comes back in /me and in the export
//   · a value the closed list does not know is refused by the API — and by the database
//   · a profile that has none (every row from before this change) keeps working, and can set it
//   · nobody can set it on another account's learner

import type { MeResponse } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { apiClient, createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('the Bundesland of the learner (issue #199)', () => {
  let env: TestEnv;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
  });
  afterAll(async () => {
    await env?.close();
  });

  /** A fresh account holder who has agreed, with no learner profile yet. */
  async function accountOnly() {
    const { token } = await env.auth.createUser();
    const api = apiClient(env, token, { 'x-timezone': 'Europe/Berlin' });
    const res = await api.post('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    });
    expect(res.status).toBe(201);
    return api;
  }

  const profile = {
    relation: 'child' as const,
    display_name: 'Lena',
    birth_date: '2013-04-12',
    locale: 'de' as const,
    minor_consent: true,
  };

  it('refuses a new profile that does not say where she goes to school', async () => {
    const api = await accountOnly();
    const res = await api.post('/learner', profile);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'invalid_input' } });
    // And nothing was written: the whole profile is one request (H-20).
    const rows = await env.db.query(`select id from learners where display_name = 'Lena'`);
    expect(rows).toHaveLength(0);
  });

  it('stores the chosen state, and serves it in /me and in the export', async () => {
    const api = await accountOnly();
    // An adult's own profile: the export of a minor's profile needs the parents' PIN, which
    // identity.int.test.ts covers — what is asked here is whether the field is in it.
    const created = await api.post<{ curriculum_region: string | null }>('/learner', {
      ...profile,
      relation: 'self',
      birth_date: '1988-02-20',
      minor_consent: false,
      curriculum_region: 'ni',
    });
    expect(created.status).toBe(201);
    expect(created.body.curriculum_region).toBe('ni');

    const me = await api.get<MeResponse>('/me');
    expect(me.body.learner?.curriculum_region).toBe('ni');

    const row = await env.db.one<{ curriculum_region: string | null }>(
      `select curriculum_region from learners where id = $1`,
      [me.body.learner?.id],
    );
    expect(row.curriculum_region).toBe('ni');

    // Her data, so it is in her export (DSGVO Art. 15/20, docs/privacy.md).
    const exported = await api.get<{ learner: { curriculum_region: string | null } }>(
      '/account/export',
    );
    expect(exported.status).toBe(200);
    expect(exported.body.learner.curriculum_region).toBe('ni');
  });

  it('refuses a value that is not one of the sixteen (nor the escape for a school abroad)', async () => {
    for (const value of ['Niedersachsen', 'NI', 'xx', 'bayern', '', null, 42]) {
      const api = await accountOnly();
      const res = await api.post('/learner', { ...profile, curriculum_region: value });
      expect(res.status, `curriculum_region=${JSON.stringify(value)}`).toBe(422);
      expect(res.body).toMatchObject({ error: { code: 'invalid_input' } });
    }
    // The escape for a learner who is not at a German school is accepted (it is part of the
    // closed list): without it a required field would be a dead end for her.
    const abroad = await accountOnly();
    const ok = await abroad.post<{ curriculum_region: string | null }>('/learner', {
      ...profile,
      curriculum_region: 'other',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.curriculum_region).toBe('other');
  });

  it('the database refuses a value the contract does not know, even past the API', async () => {
    const l = await onboard(env, { region: 'by' });
    await expect(
      env.db.query(`update learners set curriculum_region = 'bayern' where id = $1`, [l.learnerId]),
    ).rejects.toThrow();
    const row = await env.db.one<{ curriculum_region: string | null }>(
      `select curriculum_region from learners where id = $1`,
      [l.learnerId],
    );
    expect(row.curriculum_region).toBe('by');
  });

  it('a profile from before this change has none, keeps working, and can set it once', async () => {
    const l = await onboard(env, { relation: 'child', name: 'Mia', birthDate: '2012-06-01' });
    // Exactly the state of every row that existed before the migration: nullable, unset.
    await env.db.query(`update learners set curriculum_region = null where id = $1`, [l.learnerId]);

    // Nothing blocks or fails on null — it simply means "not known".
    const before = await l.api.get<MeResponse>('/me');
    expect(before.status).toBe(200);
    expect(before.body.learner?.curriculum_region).toBeNull();
    expect((await l.api.get('/buddy')).status).toBe(200);

    const set = await l.api.patch<{ curriculum_region: string | null; version: number }>(
      '/learner',
      { curriculum_region: 'ni', version: before.body.learner?.version ?? 1 },
    );
    expect(set.status).toBe(200);
    expect(set.body.curriculum_region).toBe('ni');

    // It sticks: a later change of something else does not drop it.
    const renamed = await l.api.patch<{ curriculum_region: string | null }>('/learner', {
      display_name: 'Mia B.',
      version: set.body.version,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.curriculum_region).toBe('ni');
    const after = await l.api.get<MeResponse>('/me');
    expect(after.body.learner?.curriculum_region).toBe('ni');
  });

  it("is the learner's own field: another account cannot reach it, and a stale version is refused", async () => {
    const mine = await onboard(env, { name: 'Ida', region: 'ni' });
    const other = await onboard(env, { name: 'Jo', region: 'by' });

    // There is no learner id in the request at all: the route takes the learner from the
    // verified token (http/context.ts), so the other account's token only ever changes its
    // own row — and never the one next to it.
    const mineView = (await mine.api.get<MeResponse>('/me')).body.learner;
    const res = await other.api.patch<{ curriculum_region: string | null }>('/learner', {
      curriculum_region: 'he',
      version: mineView?.version ?? 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.curriculum_region).toBe('he');
    const untouched = await env.db.one<{ curriculum_region: string | null }>(
      `select curriculum_region from learners where id = $1`,
      [mine.learnerId],
    );
    expect(untouched.curriculum_region).toBe('ni');

    // Without a session nothing happens at all.
    const anonymous = await apiClient(env, null).patch('/learner', {
      curriculum_region: 'he',
      version: 1,
    });
    expect(anonymous.status).toBe(401);

    // The context fence still holds for this field (CLAUDE.md rule 4): a change decided on
    // an older version of the profile is refused instead of overwriting a newer one.
    const stale = await mine.api.patch('/learner', { curriculum_region: 'th', version: 1 });
    expect(stale.status).toBe(200);
    const twice = await mine.api.patch('/learner', { curriculum_region: 'sn', version: 1 });
    expect(twice.status).toBe(409);
  });

  it('bumps the context fence, because Buddy judges differently per state', async () => {
    const l = await onboard(env, { region: 'ni' });
    const before = await env.db.one<{ context_version: string }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    const me = (await l.api.get<MeResponse>('/me')).body.learner;
    const res = await l.api.patch('/learner', {
      curriculum_region: 'by',
      version: me?.version ?? 1,
    });
    expect(res.status).toBe(200);
    const after = await env.db.one<{ context_version: string }>(
      `select context_version from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(Number(after.context_version)).toBeGreaterThan(Number(before.context_version));
  });
});
