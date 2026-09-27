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
const learner = {} as NonNullable<MeResponse['learner']>;

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
});
