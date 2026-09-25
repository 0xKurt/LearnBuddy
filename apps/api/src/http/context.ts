// Request context: dependencies, the verified user, their account and the
// learner profile. Every learner-scoped route gets the learner id from here —
// never from the request body, path or a model output.

import type { Context, MiddlewareHandler } from 'hono';

import type { AuthUser } from '../auth/verifier.js';
import type { Deps } from '../deps.js';
import { AppError } from '../lib/errors.js';
import { isValidTimeZone } from '../lib/time.js';
import {
  findAccountByUser,
  findLearner,
  isMinor,
  verifyAdminToken,
  type AccountRow,
  type LearnerRow,
} from '../modules/identity/model.js';

export type LearnerContext = LearnerRow & { isMinor: boolean; timezone: string };

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: AuthUser;
    account: AccountRow;
    learner: LearnerContext;
  };
};

export type AppContext = Context<AppEnv>;

export function depsOf(c: AppContext): Deps {
  return c.get('deps');
}

function bearer(c: AppContext): string | null {
  const h = c.req.header('authorization');
  if (!h) return null;
  const [scheme, token] = h.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Verified Supabase user. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearer(c);
  if (!token) throw new AppError('unauthenticated', 'Missing bearer token');
  const user = await depsOf(c).auth.verify(token);
  if (!user) throw new AppError('unauthenticated', 'Invalid or expired token');
  c.set('user', user);
  await next();
};

/** Verified user with an account (consent given). */
export const requireAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  const account = await findAccountByUser(depsOf(c).db, c.get('user').userId);
  if (!account) throw new AppError('forbidden', 'No account yet', { reason: 'account_missing' });
  c.set('account', account);
  await next();
};

/**
 * Learner profile of the account. Also records presence and the device's
 * time zone (header x-timezone), which all of Buddy's timing depends on.
 */
export const requireLearner: MiddlewareHandler<AppEnv> = async (c, next) => {
  const deps = depsOf(c);
  const account = c.get('account');
  const learner = await findLearner(deps.db, account.id);
  if (!learner)
    throw new AppError('forbidden', 'No learner profile yet', { reason: 'learner_missing' });
  const now = deps.now();
  const tzHeader = c.req.header('x-timezone');
  const tz = tzHeader && isValidTimeZone(tzHeader) ? tzHeader : null;
  const settings = await deps.db.one<{ timezone: string }>(
    `insert into buddy_settings (learner_id, timezone, last_seen_at)
       values ($1, coalesce($2, 'Europe/Berlin'), $3)
     on conflict (learner_id) do update
       set timezone = coalesce($2, buddy_settings.timezone),
           last_seen_at = $3
     returning timezone`,
    [learner.id, tz, now],
  );
  c.set('learner', {
    ...learner,
    isMinor: isMinor(learner.birth_date, now),
    timezone: settings.timezone,
  });
  await next();
};

/**
 * Who is acting. For a minor's profile the account holder proves presence
 * with a short-lived admin token (PIN); an adult learner is their own
 * account holder and acts as 'learner'.
 */
export function actorOf(c: AppContext): 'learner' | 'account_holder' {
  if (!c.get('learner').isMinor) return 'learner';
  const deps = depsOf(c);
  const token = c.req.header('x-admin-token');
  const valid =
    token !== undefined &&
    verifyAdminToken(deps.config.ADMIN_TOKEN_SECRET, token, c.get('account').id, deps.now());
  return valid ? 'account_holder' : 'learner';
}

/** True when the request may do account-holder things (always for adults). */
export function hasAccountHolderRights(c: AppContext): boolean {
  return !c.get('learner').isMinor || actorOf(c) === 'account_holder';
}

/**
 * Proof the account holder is present. Required for minors on anything that
 * loosens Buddy's contact rules or touches account data.
 */
export function assertAccountHolder(c: AppContext): 'learner' | 'account_holder' {
  if (!hasAccountHolderRights(c))
    throw new AppError('admin_required', 'An adult has to confirm this with the PIN');
  return actorOf(c);
}
