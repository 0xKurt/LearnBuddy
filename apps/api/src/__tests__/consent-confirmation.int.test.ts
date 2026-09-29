// The e-mail loop as a recorded consent step (issue #30, EDPB Guidelines 05/2020 Example 23):
// Supabase Auth enforces the click on the confirmation link anyway — no session exists before
// it — and the mail says in as many words that the click confirms the consent
// (docs/consent-email-templates.md). What must hold: the click is recorded once, as the instant
// Supabase recorded for it; a later request never rewrites it; it survives a privacy-text bump
// (nothing gates /me); it is in the account holder's export; and an account whose mail was never
// clicked records nothing and is still not locked out of anything.
// requires live verification in Claude Code session (needs a running Postgres)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('consent confirmed by e-mail', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T09:00:00Z' });
  });
  afterEach(async () => {
    await env.close();
  });

  const confirmedAt = (accountId: string) =>
    env.db.one<{ consent_confirmed_at: Date | null }>(
      `select consent_confirmed_at from accounts where id = $1`,
      [accountId],
    );

  it('records the click once, with Supabase’s instant, and never rewrites it', async () => {
    const signedUpAt = env.clock.now();
    const l = await onboard(env, { relation: 'child', name: 'Lina', pin: '2468' });

    // Nothing carried the confirmation into the database yet.
    expect((await confirmedAt(l.accountId)).consent_confirmed_at).toBeNull();

    // The first app start does: /me is what the home screen asks for.
    expect((await l.api.get('/me')).status).toBe(200);
    const first = (await confirmedAt(l.accountId)).consent_confirmed_at;
    expect(first).toEqual(signedUpAt);

    // A later start — even if Supabase reported a newer instant — leaves the record alone.
    env.clock.hours(26);
    env.auth.confirmedEmailAt(l.token, env.clock.now());
    expect((await l.api.get('/me')).status).toBe(200);
    expect((await confirmedAt(l.accountId)).consent_confirmed_at).toEqual(first);
  });

  it('is recorded even when the privacy text changed meanwhile', async () => {
    const l = await onboard(env);
    // After a version bump everything learner-facing answers 409 — /me still answers, so the
    // record is not lost to a gate.
    await env.db.query(`update accounts set consent_version = '2020-01-01' where id = $1`, [
      l.accountId,
    ]);
    expect((await l.api.get('/buddy')).status).toBe(409);
    expect((await l.api.get('/me')).status).toBe(200);
    expect((await confirmedAt(l.accountId)).consent_confirmed_at).not.toBeNull();
  });

  it('is part of the export the account holder gets', async () => {
    const l = await onboard(env);
    await l.api.get('/me');
    const exported = await l.api.get<{ account: { consent_confirmed_at: string | null } }>(
      '/account/export',
    );
    expect(exported.status).toBe(200);
    expect(exported.body.account.consent_confirmed_at).toBe(env.clock.now().toISOString());
  });

  it('records nothing without the click — and locks nobody out', async () => {
    const l = await onboard(env, {
      relation: 'child',
      name: 'Lina',
      pin: '1357',
      emailConfirmed: false,
    });
    expect((await l.api.get('/me')).status).toBe(200);
    expect((await confirmedAt(l.accountId)).consent_confirmed_at).toBeNull();
    // Her learning is untouched: no gate hangs off the record.
    expect((await l.api.get('/buddy')).status).toBe(200);

    // When the link is clicked later, the next app start records exactly that instant.
    env.clock.hours(3);
    const clicked = env.clock.now();
    env.auth.confirmedEmailAt(l.token, clicked);
    expect((await l.api.get('/me')).status).toBe(200);
    expect((await confirmedAt(l.accountId)).consent_confirmed_at).toEqual(clicked);
  });
});
