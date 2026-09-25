// Onboarding, PIN gate and privacy against a real Postgres. docs/privacy.md.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import {
  apiClient,
  createTestEnv,
  onboard,
  TEST_TICK_SECRET,
  type TestEnv,
} from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('identity and privacy', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
  });

  it('rejects requests without a valid token with the error envelope', async () => {
    const res = await apiClient(env, null).get('/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'unauthenticated' } });
    const bad = await apiClient(env, 'not-a-token').get('/buddy');
    expect(bad.status).toBe(401);
  });

  it('requires consent to the current privacy text before an account exists', async () => {
    const { token } = await env.auth.createUser();
    const api = apiClient(env, token);
    const me = await api.get<{ account: unknown; learner: unknown }>('/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ account: null, learner: null });

    const outdated = await api.post('/account', {
      locale: 'de',
      consent_version: '2020-01-01',
      accept_privacy: true,
    });
    expect(outdated.status).toBe(409);
    expect(outdated.body).toMatchObject({ error: { details: { reason: 'consent_outdated' } } });

    const noAccept = await api.post('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
    });
    expect(noAccept.status).toBe(422);

    const buddyWithoutAccount = await api.get('/buddy');
    expect(buddyWithoutAccount.status).toBe(403);
    expect(buddyWithoutAccount.body).toMatchObject({
      error: { details: { reason: 'account_missing' } },
    });
  });

  it('creates an adult learner with settings in the device time zone', async () => {
    const l = await onboard(env, { timezone: 'America/New_York', locale: 'en' });
    const me = await l.api.get<{ learner: { is_minor: boolean; relation: string; level: string } }>(
      '/me',
    );
    expect(me.body.learner).toMatchObject({ is_minor: false, relation: 'self', level: 'unknown' });
    const s = await env.db.one<{ timezone: string; contact_enabled: boolean }>(
      `select timezone, contact_enabled from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    // Contact outside the app is opt-in.
    expect(s).toEqual({ timezone: 'America/New_York', contact_enabled: false });

    const second = await l.api.post('/learner', {
      relation: 'self',
      display_name: 'Again',
      birth_date: '1990-01-01',
      locale: 'en',
      minor_consent: false,
    });
    expect(second.status).toBe(409);
  });

  it('does not let an under-16 hold the account, and needs consent for a child profile', async () => {
    const { token } = await env.auth.createUser();
    const api = apiClient(env, token);
    await api.post('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    });
    const tooYoung = await api.post('/learner', {
      relation: 'self',
      display_name: 'Tim',
      birth_date: '2013-01-01',
      locale: 'de',
      minor_consent: true,
    });
    expect(tooYoung.status).toBe(403);
    expect(tooYoung.body).toMatchObject({
      error: { details: { reason: 'account_holder_too_young' } },
    });
    const noConsent = await api.post('/learner', {
      relation: 'child',
      display_name: 'Tim',
      birth_date: '2013-01-01',
      locale: 'de',
      minor_consent: false,
    });
    expect(noConsent.status).toBe(422);
    expect(noConsent.body).toMatchObject({
      error: { details: { reason: 'minor_consent_required' } },
    });
    const ok = await api.post<{ is_minor: boolean }>('/learner', {
      relation: 'child',
      display_name: 'Tim',
      birth_date: '2013-01-01',
      locale: 'de',
      minor_consent: true,
    });
    expect(ok.status).toBe(201);
    expect(ok.body.is_minor).toBe(true);
  });

  it('locks the PIN after 5 wrong attempts for 15 minutes', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    // Later, changing it needs the current PIN or a fresh password sign-in.
    env.clock.minutes(6);
    expect((await l.api.put('/account/pin', { pin: '1234' })).status).toBe(403);
    for (let i = 0; i < 5; i++) {
      const wrong = await l.api.post('/account/admin-session', { pin: '0000' });
      expect(wrong.status).toBe(403);
    }
    const locked = await l.api.post('/account/admin-session', { pin: '4711' });
    expect(locked.status).toBe(423);
    env.clock.minutes(16);
    const ok = await l.api.post<{ admin_token: string }>('/account/admin-session', { pin: '4711' });
    expect(ok.status).toBe(200);
    expect(ok.body.admin_token).toBeTruthy();
  });

  it('does not let the child set or change the adult PIN (a token refresh is not a sign-in)', async () => {
    const l = await onboard(env, { relation: 'child' });
    // Days later, on the child's phone: the session is only refreshed, never re-entered.
    env.clock.hours(48);
    const first = await l.api.put('/account/pin', { pin: '1111' });
    expect(first.status).toBe(403);
    expect(first.body).toMatchObject({ error: { details: { reason: 'reauth_required' } } });
    // The adult signs in with the password: now it works, and changing it later needs that PIN.
    env.auth.signedInAt(l.token, Math.floor(env.clock.now().getTime() / 1000));
    expect((await l.api.put('/account/pin', { pin: '2222' })).status).toBe(200);
    env.clock.minutes(10);
    expect((await l.api.put('/account/pin', { pin: '3333' })).status).toBe(403);
    expect((await l.api.put('/account/pin', { pin: '3333', current_pin: '2222' })).status).toBe(
      200,
    );
  });

  it('gates export and deletion of a minor profile behind the adult PIN', async () => {
    const l = await onboard(env, { relation: 'child', pin: '2468' });
    const denied = await l.api.get('/account/export');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: 'admin_required' } });
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '2468',
    });
    const admin = l.api.with({ 'x-admin-token': session.body.admin_token });
    const exported = await admin.get<{ exported_format: string; learner: { id: string } }>(
      '/account/export',
    );
    expect(exported.status).toBe(200);
    expect(exported.body.exported_format).toBe('learnbuddy.export.v1');
    expect(exported.body.learner.id).toBe(l.learnerId);
    // The admin token expires after 10 minutes.
    env.clock.minutes(11);
    expect((await admin.get('/account/export')).status).toBe(403);
  });

  it('deletes everything after the 7-day hold unless cancelled', async () => {
    const l = await onboard(env);
    // Some data that must disappear with the account, including a photo.
    const created = await l.api.post<{
      material: { id: string };
      uploads: Array<{ path: string }>;
    }>('/materials', {
      client_request_id: '00000000-0000-4000-8000-00000000d001',
      photo_mimes: ['image/jpeg'],
    });
    expect(created.status).toBe(201);
    const photoPath = created.body.uploads[0]!.path;
    env.storage.put(photoPath);

    const requested = await l.api.post<{ deletion_due_at: string }>('/account/deletion');
    expect(requested.status).toBe(202);
    const cancelled = await l.api.delete<{ deletion_due_at: null }>('/account/deletion');
    expect(cancelled.body.deletion_due_at).toBeNull();
    const again = await l.api.post<{ deletion_due_at: string }>('/account/deletion');
    expect(new Date(again.body.deletion_due_at).getTime()).toBe(
      env.clock.now().getTime() + 7 * 86_400_000,
    );

    const tick = () =>
      env.app.request('/v1/internal/tick', {
        method: 'POST',
        headers: { 'x-tick-secret': TEST_TICK_SECRET },
      });
    env.clock.hours(24 * 6);
    expect((await tick()).status).toBe(200);
    expect(
      await env.db.maybeOne(`select 1 from accounts where id = $1`, [l.accountId]),
    ).not.toBeNull();

    env.clock.hours(25);
    expect((await tick()).status).toBe(200);
    expect(await env.db.maybeOne(`select 1 from accounts where id = $1`, [l.accountId])).toBeNull();
    expect(await env.db.maybeOne(`select 1 from learners where id = $1`, [l.learnerId])).toBeNull();
    expect(
      await env.db.maybeOne(`select 1 from materials where learner_id = $1`, [l.learnerId]),
    ).toBeNull();
    expect(env.auth.deleted).toContain(l.userId);
    expect(env.storage.objects.has(photoPath)).toBe(false);
    // The old token no longer works.
    expect((await l.api.get('/buddy')).status).toBe(401);
  });

  it('refuses the scheduler endpoint without the secret', async () => {
    const res = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': 'wrong' },
    });
    expect(res.status).toBe(403);
    const none = await env.app.request('/v1/internal/tick', { method: 'POST' });
    expect(none.status).toBe(403);
  });
});
