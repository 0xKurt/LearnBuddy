// One guard for every route of the root Stack (its `screenLayout`, app/_layout.tsx): a screen of
// the app proper is mounted only for a signed-in person whose setup is finished. Until that is
// known nothing of the screen exists — no shell, no request, no listening conversation mode — and
// when consent or the profile is missing she is sent where the start screen would send her
// (lib/gate.ts, #599).

import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

import { useMe } from '../../lib/api/queries.js';
import { currentSession } from '../../lib/auth/session.js';
import { guardRoute, PRE_APP_ROUTES } from '../../lib/gate.js';
import { LoadingState } from '../lb/LoadingState.js';

type Props = { route: string; children: ReactElement };

export function SetupGuard({ route, children }: Props) {
  // The pages before the app ask nothing here: they load what they need themselves.
  if (PRE_APP_ROUTES.has(route)) return children;
  // No session: the root layout is already sending her to the start.
  if (currentSession() === null) return <LoadingState />;
  return <InApp route={route}>{children}</InApp>;
}

function InApp({ route, children }: Props) {
  const me = useMe();
  const decision = guardRoute(route, {
    signedIn: true,
    me: me.data,
    fetching: me.isFetching,
    failed: me.isError,
  });
  if (decision === 'show') return children;
  if (decision === 'wait') return <LoadingState />;
  return <Redirect href={decision} />;
}
