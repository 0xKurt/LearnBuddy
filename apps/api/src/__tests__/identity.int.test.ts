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

// Each PIN check is a real scrypt hash; the lockout cases make many of them.
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

  it('locks the PIN after 5 wrong attempts for 15 minutes, then longer', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    // Later, changing it needs the current PIN or a fresh password sign-in.
    env.clock.minutes(6);
    expect((await l.api.put('/account/pin', { pin: '1234' })).status).toBe(403);
    for (let i = 0; i < 4; i++) {
      const wrong = await l.api.post('/account/admin-session', { pin: '0000' });
      expect(wrong.status).toBe(403);
      expect(wrong.body).toMatchObject({ error: { details: { reason: 'wrong_pin' } } });
    }
    // The fifth wrong PIN locks, and says so.
    const fifth = await l.api.post('/account/admin-session', { pin: '0000' });
    expect(fifth.status).toBe(423);
    const locked = await l.api.post('/account/admin-session', { pin: '4711' });
    expect(locked.status).toBe(423);
    expect(locked.body).toMatchObject({ error: { code: 'pin_locked' } });
    env.clock.minutes(16);
    // Five more wrong ones after the first lock: now 30 minutes (D-14, escalating).
    for (let i = 0; i < 5; i++) await l.api.post('/account/admin-session', { pin: '0000' });
    env.clock.minutes(16);
    expect((await l.api.post('/account/admin-session', { pin: '4711' })).status).toBe(423);
    env.clock.minutes(15);
    const ok = await l.api.post<{ admin_token: string }>('/account/admin-session', { pin: '4711' });
    expect(ok.status).toBe(200);
    expect(ok.body.admin_token).toBeTruthy();
    // The right PIN clears the escalation: the next lock is 15 minutes again.
    for (let i = 0; i < 5; i++) await l.api.post('/account/admin-session', { pin: '0000' });
    env.clock.minutes(16);
    expect((await l.api.post('/account/admin-session', { pin: '4711' })).status).toBe(200);
  }, 30_000);

  it('counts wrong current PINs on PUT /account/pin and honours the lock (H-17)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.clock.minutes(6);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await l.api.put('/account/pin', { pin: '1111', current_pin: '0000' })).status);
    }
    expect(statuses).toEqual([403, 403, 403, 403, 423, 423]);
    // Even the right current PIN cannot change it (or lift the lock) while locked…
    const right = await l.api.put('/account/pin', { pin: '1111', current_pin: '4711' });
    expect(right.status).toBe(423);
    // …nor can a fresh password sign-in (the forgotten-PIN path).
    env.auth.signedInAt(l.token, Math.floor(env.clock.now().getTime() / 1000));
    expect((await l.api.put('/account/pin', { pin: '1111' })).status).toBe(423);
    // Nothing changed: after the lock the old PIN still opens the gate.
    env.clock.minutes(16);
    expect((await l.api.post('/account/admin-session', { pin: '4711' })).status).toBe(200);
  });

  it('shares one lock between the admin session and PIN changes', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    env.clock.minutes(6);
    for (let i = 0; i < 5; i++) await l.api.post('/account/admin-session', { pin: '0000' });
    const put = await l.api.put('/account/pin', { pin: '1111', current_pin: '4711' });
    expect(put.status).toBe(423);
    // The response says when to try again.
    const raw = await env.app.request('/v1/account/pin', {
      method: 'PUT',
      headers: { authorization: `Bearer ${l.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1111', current_pin: '4711' }),
    });
    expect(raw.status).toBe(423);
    expect(Number(raw.headers.get('retry-after'))).toBeGreaterThan(0);
  }, 30_000);

  it('counts a burst of parallel wrong PINs exactly (H-18)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    const burst = await Promise.all(
      Array.from({ length: 10 }, () => l.api.post('/account/admin-session', { pin: '0000' })),
    );
    // At most five were checked at all; the rest met the lock.
    expect(burst.filter((r) => r.status === 403).length).toBeLessThanOrEqual(4);
    expect(burst.filter((r) => r.status === 423).length).toBeGreaterThanOrEqual(6);
    const row = await env.db.one<{ locked_until: Date | null }>(
      `select locked_until from attempt_counters where scope = 'pin' and account_id = $1`,
      [l.accountId],
    );
    expect(row.locked_until!.getTime()).toBeGreaterThan(env.clock.now().getTime());
    expect((await l.api.post('/account/admin-session', { pin: '4711' })).status).toBe(423);
  }, 30_000);

  it('allows the forgotten-PIN reset after a fresh sign-in at most 5 times an hour', async () => {
    const l = await onboard(env, { relation: 'child', pin: '4711' });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      env.auth.signedInAt(l.token, Math.floor(env.clock.now().getTime() / 1000));
      statuses.push((await l.api.put('/account/pin', { pin: `22${i}${i}` })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    env.clock.minutes(61);
    env.auth.signedInAt(l.token, Math.floor(env.clock.now().getTime() / 1000));
    expect((await l.api.put('/account/pin', { pin: '3333' })).status).toBe(200);
  }, 30_000);

  it('sets the password only through the API, and for a minor only with the PIN (M-1)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '2468' });
    const denied = await l.api.put('/account/password', { password: 'neues-passwort' });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ error: { code: 'admin_required' } });
    expect(env.auth.passwords.has(l.userId)).toBe(false);
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '2468',
    });
    const ok = await l.api
      .with({ 'x-admin-token': session.body.admin_token })
      .put('/account/password', { password: 'neues-passwort' });
    expect(ok.status).toBe(200);
    expect(env.auth.passwords.get(l.userId)).toBe('neues-passwort');
    // An adult learner is their own account holder.
    const adult = await onboard(env);
    expect((await adult.api.put('/account/password', { password: 'noch-eins-1' })).status).toBe(
      200,
    );
    expect((await adult.api.put('/account/password', { password: 'kurz' })).status).toBe(422);
  });

  it('keeps the admin token short-lived (5 minutes)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '2468' });
    const session = await l.api.post<{ admin_token: string; expires_at: string }>(
      '/account/admin-session',
      { pin: '2468' },
    );
    expect(new Date(session.body.expires_at).getTime() - env.clock.now().getTime()).toBe(
      5 * 60_000,
    );
    const admin = l.api.with({ 'x-admin-token': session.body.admin_token });
    env.clock.minutes(4);
    expect((await admin.get('/account/export')).status).toBe(200);
    env.clock.minutes(2);
    expect((await admin.get('/account/export')).status).toBe(403);
  });

  it("creates a child profile at 15, 16 and 17 behind the parents' gate, never a 500 (H-21, D-8)", async () => {
    // Test clock: 2026-09-28.
    for (const [birth, age] of [
      ['2011-03-01', 15],
      ['2010-03-01', 16],
      ['2009-03-01', 17],
      ['2008-03-01', 18],
    ] as const) {
      const l = await onboard(env, { relation: 'child', birthDate: birth, pin: '1357' });
      const me = await l.api.get<{ learner: { is_minor: boolean; birth_date: string } }>('/me');
      expect(me.body.learner.birth_date).toBe(birth);
      // The PIN gate stays until 18.
      expect(me.body.learner.is_minor).toBe(age < 18);
      const consent = await env.db.one<{ minor_consent_version: string | null }>(
        `select minor_consent_version from learners where id = $1`,
        [l.learnerId],
      );
      expect(consent.minor_consent_version).toBe(env.deps.config.CONSENT_VERSION);
      expect((await l.api.get('/account/export')).status).toBe(age < 18 ? 403 : 200);
    }
  }, 30_000);

  it('turns a rule the schema refuses into a 422, not a 500', async () => {
    const l = await onboard(env);
    // A grade outside school breaks learners_grade_only_in_school only if the API let it through;
    // simulate an unforeseen check violation directly through the error mapping.
    await env.db.query(
      `alter table learners add constraint test_no_zed check (display_name <> 'Zed')`,
    );
    const res = await l.api.patch<{ error: { code: string } }>('/learner', {
      display_name: 'Zed',
      version: 1,
    });
    await env.db.query(`alter table learners drop constraint test_no_zed`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_input');
  });

  it('creates the child profile with its PIN in one request, also long after sign-in (H-20)', async () => {
    const { token } = await env.auth.createUser();
    env.auth.signedInAt(token, Math.floor(env.clock.now().getTime() / 1000));
    const api = apiClient(env, token);
    await api.post('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    });
    // E-mail confirmation, reading the consent text, two form steps: well past 5 minutes.
    env.clock.minutes(6);
    const created = await api.post('/learner', {
      relation: 'child',
      display_name: 'Mia',
      birth_date: '2014-05-05',
      locale: 'de',
      minor_consent: true,
      pin: '8642',
    });
    expect(created.status).toBe(201);
    const me = await api.get<{ account: { pin_set: boolean } }>('/me');
    expect(me.body.account.pin_set).toBe(true);
    expect((await api.post('/account/admin-session', { pin: '8642' })).status).toBe(200);
    // A second profile (e.g. a lost response, tapped again) is a reasoned 409, and never
    // replaces the PIN.
    const again = await api.post('/learner', {
      relation: 'child',
      display_name: 'Mia',
      birth_date: '2014-05-05',
      locale: 'de',
      minor_consent: true,
      pin: '0000',
    });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { details: { reason: 'learner_exists' } } });
    expect((await api.post('/account/admin-session', { pin: '8642' })).status).toBe(200);
  });

  it('exports and deletes an account that never got a profile (M-4)', async () => {
    const { token, userId } = await env.auth.createUser();
    const api = apiClient(env, token);
    const acc = await api.post<{ account_id: string }>('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    });
    const exported = await api.get<{ learner: null; account: { id: string } }>('/account/export');
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({ learner: null, account: { id: acc.body.account_id } });
    const requested = await api.post<{ deletion_due_at: string }>('/account/deletion');
    expect(requested.status).toBe(202);
    env.clock.hours(24 * 7 + 1);
    const tick = await env.app.request('/v1/internal/tick', {
      method: 'POST',
      headers: { 'x-tick-secret': TEST_TICK_SECRET },
    });
    expect(tick.status).toBe(200);
    expect(
      await env.db.maybeOne(`select 1 from accounts where id = $1`, [acc.body.account_id]),
    ).toBeNull();
    expect(env.auth.deleted).toContain(userId);
  });

  it('lets only the parents agree to a new privacy text for a minor, and renews their consent (M-2)', async () => {
    const l = await onboard(env, { relation: 'child', pin: '2468' });
    // The privacy text changed after the account agreed.
    await env.db.query(`update accounts set consent_version = '2020-01-01' where id = $1;`, [
      l.accountId,
    ]);
    await env.db.query(`update learners set minor_consent_version = '2020-01-01' where id = $1`, [
      l.learnerId,
    ]);
    // The server enforces the version, not only the app's start screen.
    const blocked = await l.api.get('/buddy');
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ error: { details: { reason: 'consent_outdated' } } });
    const me = await l.api.get<{ account: { consent_current: boolean } }>('/me');
    expect(me.body.account.consent_current).toBe(false);
    // Export and deletion still work (with the PIN): rights never depend on consent.
    const agree = {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    };
    const byChild = await l.api.post('/account', agree);
    expect(byChild.status).toBe(403);
    expect(byChild.body).toMatchObject({ error: { code: 'admin_required' } });
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '2468',
    });
    expect(session.status).toBe(200);
    const byParent = await l.api
      .with({ 'x-admin-token': session.body.admin_token })
      .post('/account', agree);
    expect(byParent.status).toBe(201);
    const learner = await env.db.one<{ minor_consent_version: string; minor_consent_at: Date }>(
      `select minor_consent_version, minor_consent_at from learners where id = $1`,
      [l.learnerId],
    );
    expect(learner.minor_consent_version).toBe(env.deps.config.CONSENT_VERSION);
    expect(learner.minor_consent_at.getTime()).toBe(env.clock.now().getTime());
    expect((await l.api.get('/buddy')).status).toBe(200);
  });

  it('corrects the birth date with the PIN and recomputes who is a minor (M-3)', async () => {
    const l = await onboard(env, { relation: 'child', birthDate: '2014-03-10', pin: '2468' });
    const byChild = await l.api.patch('/learner', { birth_date: '2004-03-10', version: 1 });
    expect(byChild.status).toBe(403);
    expect(byChild.body).toMatchObject({ error: { code: 'admin_required' } });
    // The name stays the learner's own.
    const renamed = await l.api.patch<{ display_name: string; version: number }>('/learner', {
      display_name: 'Lini',
      version: 1,
    });
    expect(renamed.status).toBe(200);
    const session = await l.api.post<{ admin_token: string }>('/account/admin-session', {
      pin: '2468',
    });
    const admin = l.api.with({ 'x-admin-token': session.body.admin_token });
    // Implausible dates are refused with a reason.
    const implausible = await admin.patch('/learner', { birth_date: '2025-01-01', version: 2 });
    expect(implausible.status).toBe(422);
    const corrected = await admin.patch<{ is_minor: boolean; birth_date: string }>('/learner', {
      birth_date: '2012-03-10',
      version: 2,
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body).toMatchObject({ is_minor: true, birth_date: '2012-03-10' });
    const adultNow = await admin.patch<{ is_minor: boolean }>('/learner', {
      birth_date: '2006-03-10',
      version: 3,
    });
    expect(adultNow.body.is_minor).toBe(false);
    // An adult cannot make their own profile younger than 16.
    const adult = await onboard(env);
    const tooYoung = await adult.api.patch('/learner', { birth_date: '2015-01-01', version: 1 });
    expect(tooYoung.status).toBe(403);
    expect(tooYoung.body).toMatchObject({
      error: { details: { reason: 'account_holder_too_young' } },
    });
  });

  it('budgets messages and answers per account with 429 and Retry-After (D-14)', async () => {
    const l = await onboard(env);
    const now = env.clock.now();
    await env.db.query(
      `insert into attempt_counters (scope, account_id, window_start, count, updated_at)
       values ('messages', $1, $2, 120, $2), ('answers', $1, $2, 600, $2)`,
      [l.accountId, now],
    );
    const call = (path: string, body: unknown) =>
      env.app.request(`/v1${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${l.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const msg = await call('/buddy/messages', {
      client_message_id: '00000000-0000-4000-8000-00000000e001',
      text: 'Hallo',
    });
    expect(msg.status).toBe(429);
    expect(Number(msg.headers.get('retry-after'))).toBe(3600);
    expect(
      await env.db.maybeOne(`select 1 from buddy_messages where learner_id = $1`, [l.learnerId]),
    ).toBeNull();
    const answer = await call('/practice/sessions/00000000-0000-4000-8000-00000000e002/answer', {
      answer: '4',
    });
    expect(answer.status).toBe(429);
    // A new hour, a new budget.
    env.clock.minutes(61);
    const later = await call('/practice/sessions/00000000-0000-4000-8000-00000000e002/answer', {
      answer: '4',
    });
    expect(later.status).not.toBe(429);
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
