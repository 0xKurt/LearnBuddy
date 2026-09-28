import type { MeResponse } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { gateRoute } from '../gate.js';

type Account = NonNullable<MeResponse['account']>;
const account = (patch: Partial<Account> = {}): Account => ({
  id: '00000000-0000-4000-8000-000000000001',
  locale: 'de',
  pin_set: true,
  deletion_due_at: null,
  deletion_running: false,
  consent_current: true,
  ...patch,
});
type Learner = NonNullable<MeResponse['learner']>;
const learner = { own_consent_due: false } as Learner;

describe('the start gate', () => {
  it('shows the calm "being deleted" screen while a deletion runs (409 deletion_running)', () => {
    expect(gateRoute({ account: account({ deletion_running: true }), learner })).toBe('/deleting');
    // Also when a new privacy text is waiting: agreeing to it is no longer possible.
    expect(
      gateRoute({ account: account({ deletion_running: true, consent_current: false }), learner }),
    ).toBe('/deleting');
  });

  it('otherwise: consent, then the profile, then Buddy', () => {
    expect(gateRoute({ account: null, learner: null })).toBe('/consent');
    expect(gateRoute({ account: account({ consent_current: false }), learner })).toBe('/consent');
    expect(gateRoute({ account: account(), learner: null })).toBe('/profile');
    expect(gateRoute({ account: account(), learner })).toBe('/buddy');
  });

  it('asks her once when she has turned 16 — the parents carried it until then (issue #31)', () => {
    const grown = { own_consent_due: true } as Learner;
    expect(gateRoute({ account: account(), learner: grown })).toBe('/consent');
    // A running deletion still comes first: nothing else can be decided any more.
    expect(gateRoute({ account: account({ deletion_running: true }), learner: grown })).toBe(
      '/deleting',
    );
  });
});
