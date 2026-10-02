// What the parents' setup actually saved (issue #205).
//
// Two screens said the opposite about the same learner: the hand-over claimed
// "Push-Benachrichtigungen: aus" while the settings said "Ja – nie nach 20:00 Uhr". The
// hand-over was the liar — its sentence was hardwired and read nothing. The fix is on the
// device (one shared reading of the state), but it only holds if the SERVER really stores what
// the box said, and only if a child can still never loosen it afterwards (CLAUDE.md rule 6).
// That is what this file proves, on a real Postgres.
// requires live verification in Claude Code session (needs a running Postgres)

import type { BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

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
      contactEnabled: true,
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
      contactEnabled: false,
    });
    const off = await unticked.api.get<BuddySettingsView>('/buddy/settings');
    expect(off.body.contact_enabled).toBe(false);
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
      contactEnabled: true,
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
