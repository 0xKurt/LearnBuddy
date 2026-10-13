// Where a signed-in person belongs, decided from GET /me (app/index.tsx) — and whether a route
// may be drawn for her at all (components/auth/SetupGuard.tsx).

import type { MeResponse } from '@learnbuddy/shared-types/contracts';

export type GateRoute = '/deleting' | '/consent' | '/profile' | '/buddy';

type Me = Pick<MeResponse, 'account' | 'learner'>;

export function gateRoute(me: Me): GateRoute {
  const { account, learner } = me;
  // A running deletion comes first: nothing else can be done with the account any more.
  if (account?.deletion_running) return '/deleting';
  if (!account || !account.consent_current) return '/consent';
  if (!learner) return '/profile';
  // She has turned 16: from now on she decides herself, and is asked once (issue #31).
  if (learner.own_consent_due) return '/consent';
  return '/buddy';
}

/**
 * The routes (expo-router names, app/<name>.tsx) that exist before there is a Buddy to talk to:
 * the gate itself, signing in, the setup's own pages and the two states in which nothing else
 * works. Everything else under app/ is the app proper and is drawn only for a finished setup.
 * The tour is not in here: it follows the profile, so it needs one like every in-app route.
 */
export const PRE_APP_ROUTES: ReadonlySet<string> = new Set([
  'index',
  '+not-found',
  'welcome',
  'reset-password',
  'update',
  'consent',
  'profile',
  'deleting',
]);

export type GuardDecision = 'show' | 'wait' | Exclude<GateRoute, '/buddy'>;

/**
 * May this route be drawn? A direct link (a typed address, a reload, a notification) reaches any
 * route without passing the start screen, and the server refuses every call while consent or the
 * profile is missing — so the screen stood there as an empty shell, and conversation mode showed
 * itself listening (#599). The same `gateRoute` decides; nothing is decided twice.
 *
 * `wait` draws nothing yet: no session (the root layout sends her to the start), `/me` still
 * unknown, or a kept copy that says "not set up" while the fresh answer is on its way — the copy
 * on the device can be a moment older than the setup she just finished (lib/api/persist.ts).
 */
export function guardRoute(
  route: string,
  state: {
    signedIn: boolean;
    me: Me | undefined;
    /** `/me` is being asked right now. */
    fetching: boolean;
    /** `/me` could not be loaded; with nothing kept, the screen says so itself. */
    failed: boolean;
  },
): GuardDecision {
  if (PRE_APP_ROUTES.has(route)) return 'show';
  if (!state.signedIn) return 'wait';
  if (!state.me) return state.failed ? 'show' : 'wait';
  const belongs = gateRoute(state.me);
  if (belongs === '/buddy') return 'show';
  return state.fetching ? 'wait' : belongs;
}

/**
 * The profile page with a learner that exists already and was not made on this visit: she
 * belongs further on. Seen on a reload right after the setup — the start screen decides at once
 * from the copy kept on the device, and that copy is written a moment after `/me` changes
 * (lib/api/persist.ts `WRITE_AFTER_MS`), so it can still be the one without a learner (#599).
 * `null`: stay.
 *
 * `own`: the page is on its own way and decides itself where it leads — the profile is being
 * saved, was saved on this visit (the hand-over and the voice follow), or turned out to exist
 * already and the page is going on to the tour.
 */
export function profileLeavesTo(
  me: Me | undefined,
  own: { saving: boolean; saved: boolean; goingOn: boolean },
): Exclude<GateRoute, '/profile'> | null {
  if (own.saving || own.saved || own.goingOn || !me?.learner) return null;
  const belongs = gateRoute(me);
  return belongs === '/profile' ? null : belongs;
}
