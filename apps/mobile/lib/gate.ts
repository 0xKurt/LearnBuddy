// Where a signed-in person belongs, decided from GET /me (app/index.tsx).

import type { MeResponse } from '@learnbuddy/shared-types/contracts';

export type GateRoute = '/deleting' | '/consent' | '/profile' | '/buddy';

export function gateRoute(me: Pick<MeResponse, 'account' | 'learner'>): GateRoute {
  const { account, learner } = me;
  // A running deletion comes first: nothing else can be done with the account any more.
  if (account?.deletion_running) return '/deleting';
  if (!account || !account.consent_current) return '/consent';
  if (!learner) return '/profile';
  return '/buddy';
}
