// What the parents' setup actually saved (issue #205).
//
// Two screens said the opposite about the same learner: the hand-over claimed
// "Push-Benachrichtigungen: aus" while the settings said "Ja – nie nach 20:00 Uhr". The
// hand-over was the liar — its sentence was hardwired and read nothing. The fix is on the
// device (one shared reading of the state), but it only holds if the SERVER really stores what
// the box said, and only if a child can still never loosen it afterwards (CLAUDE.md rule 6).
// That is what this file proves, on a real Postgres.
//
// Since issue #518 the setup ASKS (owner 09.10.: "Die Benachrichtigung sollte bereits beim setup
// abgefragt werden"): under 16 the adult answers in the same request as their PIN, and a "no"
// there is final (owner 10.10.) — the chat never asks again, only the settings change it.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddyHome, BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hashPin } from '../modules/identity/model.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { apiClient, createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('the state the hand-over reports is the state that was saved', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-10-02T09:00:00Z' });
  });
  afterEach(async () => {
    await env.close();
  });

  it('stores contact as the parents ticked it — both ways', async () => {
    const ticked = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
      contact: 'yes',
    });
    const on = await ticked.api.get<BuddySettingsView>('/buddy/settings');
    expect(on.status).toBe(200);
    // The settings screen reads this; the hand-over used to ignore it and say "off".
    expect(on.body.contact_enabled).toBe(true);
    const onRow = await env.db.one<{ contact_enabled: boolean }>(
      `select contact_enabled from buddy_settings where learner_id = $1`,
      [ticked.learnerId],
    );
    expect(onRow.contact_enabled).toBe(true);

    const unticked = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2014-02-10',
      pin: '1357',
      contact: 'no',
    });
    const off = await unticked.api.get<BuddySettingsView>('/buddy/settings');
    expect(off.body.contact_enabled).toBe(false);
  });

  /** Something Buddy follows: the one condition under which the chat asks about contact. */
  const followSomething = (learnerId: string) =>
    env.db.query(
      `insert into buddy_goals (learner_id, kind, title, due_date)
       values ($1, 'exam', 'Mathearbeit', '2027-06-01')`,
      [learnerId],
    );
  const decisionOf = async (l: { api: { get: <T>(p: string) => Promise<{ body: T }> } }) =>
    (await l.api.get<BuddyHome>('/buddy')).body.decision;

  /** A signed-up account with consent, ready for POST /learner (the parents' setup screen). */
  const freshAccount = async () => {
    const { token } = await env.auth.createUser();
    const api = apiClient(env, token);
    await api.post('/account', {
      locale: 'de',
      consent_version: env.deps.config.CONSENT_VERSION,
      accept_privacy: true,
    });
    return api;
  };
  const child = (extra: Record<string, unknown>) => ({
    relation: 'child',
    display_name: 'Lena',
    birth_date: '2014-02-10',
    locale: 'de',
    curriculum_region: 'ni',
    minor_consent: true,
    ...extra,
  });

  it('a "no" in the setup is final: the chat never asks, not even weeks later (issue #518)', async () => {
    const no = await onboard(env, {
      relation: 'child',
      name: 'Mia',
      birthDate: '2014-02-10',
      pin: '1357',
      contact: 'no',
    });
    await followSomething(no.learnerId);
    expect(await decisionOf(no)).toBeNull();
    env.clock.minutes(60 * 24 * 40);
    expect(await decisionOf(no)).toBeNull();
    // Recorded as the adults' decision, with the app's clock (rule 7).
    const row = await env.db.one<{
      contact_enabled: boolean;
      contact_changed_by: string | null;
      contact_changed_at: Date | null;
    }>(
      `select contact_enabled, contact_changed_by, contact_changed_at from buddy_settings
        where learner_id = $1`,
      [no.learnerId],
    );
    expect(row).toEqual({
      contact_enabled: false,
      contact_changed_by: 'account_holder',
      contact_changed_at: new Date('2026-10-02T09:00:00Z'),
    });
    // The settings are where it changes — and under 16 a yes there needs the adults (rule 6).
    const s = await no.api.get<BuddySettingsView>('/buddy/settings');
    const loosen = await no.api.patch('/buddy/settings', {
      contact_enabled: true,
      version: s.body.version,
    });
    expect(loosen.status).toBe(403);

    // A "yes" asks nothing either: contact is on. A profile never asked (an older app) is the
    // one the chat still asks — and another learner's answer is never hers.
    const yes = await onboard(env, {
      relation: 'child',
      birthDate: '2014-02-10',
      pin: '4826',
      contact: 'yes',
    });
    await followSomething(yes.learnerId);
    expect(await decisionOf(yes)).toBeNull();
    const unasked = await onboard(env, { relation: 'child', birthDate: '2014-02-10', pin: '2468' });
    await followSomething(unasked.learnerId);
    expect(await decisionOf(unasked)).toMatchObject({ type: 'contact_opt_in' });
  });

  it('under 16 a "yes" needs the parents\' PIN in the same request; from 16 she answers herself', async () => {
    // No PIN in the request: refused as a whole — no profile, nothing half done.
    const api = await freshAccount();
    const noPin = await api.post<{ error: { code: string } }>(
      '/learner',
      child({ contact: 'yes' }),
    );
    expect(noPin.status).toBe(403);
    expect(noPin.body.error.code).toBe('admin_required');
    expect((await api.get<{ learner: unknown }>('/me')).body.learner).toBeNull();
    // A "no" needs nobody: Buddy can only reduce.
    const quiet = await freshAccount();
    expect((await quiet.post('/learner', child({ contact: 'no' }))).status).toBe(201);
    // With the PIN it is the adults' yes.
    const withPin = await api.post<{ id: string }>(
      '/learner',
      child({ contact: 'yes', pin: '4826' }),
    );
    expect(withPin.status).toBe(201);
    const on = await env.db.one<{ contact_enabled: boolean; contact_changed_by: string }>(
      `select contact_enabled, contact_changed_by from buddy_settings where learner_id = $1`,
      [withPin.body.id],
    );
    expect(on).toEqual({ contact_enabled: true, contact_changed_by: 'account_holder' });
    // Sent twice (the answer got lost): the profile exists, and the first answer stands.
    const again = await api.post('/learner', child({ contact: 'no', pin: '4826' }));
    expect(again.status).toBe(409);
    const still = await env.db.one<{ contact_enabled: boolean }>(
      `select contact_enabled from buddy_settings where learner_id = $1`,
      [withPin.body.id],
    );
    expect(still.contact_enabled).toBe(true);

    // An account that already has a PIN: the request's PIN must be that one.
    const kept = await freshAccount();
    const me = await kept.get<{ account: { id: string } }>('/me');
    await env.db.query(`update accounts set pin_hash = $2 where id = $1`, [
      me.body.account.id,
      await hashPin('1111'),
    ]);
    const wrong = await kept.post<{ error: { details?: { reason?: string } } }>(
      '/learner',
      child({ contact: 'yes', pin: '2222' }),
    );
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.details?.reason).toBe('wrong_pin');
    expect((await kept.post('/learner', child({ contact: 'yes', pin: '1111' }))).status).toBe(201);

    // From 16 she decides herself, no PIN.
    const adult = await onboard(env, { relation: 'self', contact: 'yes' });
    const row = await env.db.one<{ contact_enabled: boolean; contact_changed_by: string }>(
      `select contact_enabled, contact_changed_by from buddy_settings where learner_id = $1`,
      [adult.learnerId],
    );
    expect(row).toEqual({ contact_enabled: true, contact_changed_by: 'learner' });
  });

  it('starts off when the box is not mentioned at all', async () => {
    // Opt-in means opt-in: a request that says nothing must not enable it (rule 6).
    const quiet = await onboard(env, {
      relation: 'child',
      name: 'Nora',
      birthDate: '2014-02-10',
      pin: '2468',
    });
    const s = await quiet.api.get<BuddySettingsView>('/buddy/settings');
    expect(s.body.contact_enabled).toBe(false);
  });

  it('lets the child switch it off but never back on', async () => {
    const l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
      contact: 'yes',
    });
    const before = await l.api.get<BuddySettingsView>('/buddy/settings');
    expect(before.body.can_loosen).toBe(false); // twelve years old
    // Buddy can only reduce: switching off is always hers (the version is the usual fence).
    const off = await l.api.patch<BuddySettingsView>('/buddy/settings', {
      contact_enabled: false,
      version: before.body.version,
    });
    expect(off.status).toBe(200);
    expect(off.body.contact_enabled).toBe(false);

    // Switching it back on is a loosening, and that needs the adults.
    const back = await l.api.patch('/buddy/settings', {
      contact_enabled: true,
      version: off.body.version,
    });
    expect(back.status).toBe(403);
    const row = await env.db.one<{ contact_enabled: boolean }>(
      `select contact_enabled from buddy_settings where learner_id = $1`,
      [l.learnerId],
    );
    expect(row.contact_enabled).toBe(false);
  });
});
