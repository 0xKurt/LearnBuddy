// Request context: dependencies, the verified user, their account and the
// learner profile. Every learner-scoped route gets the learner id from here —
// never from the request body, path or a model output.

import type { Context, MiddlewareHandler } from 'hono';

import type { AuthUser } from '../auth/verifier.js';
import type { Deps } from '../deps.js';
import { AppError } from '../lib/errors.js';
import { isValidTimeZone } from '../lib/time.js';
import { DEFAULT_TIMEZONE } from '../lib/zone.js';
import { bumpContext } from '../modules/buddy/plan.js';
import {
  findAccountByUser,
  findLearner,
  isMinor,
  verifyAdminToken,
  type AccountRow,
  type LearnerRow,
} from '../modules/identity/model.js';
import { assertNotDeleting } from '../modules/identity/privacy.js';
import type { Timeline } from './timing.js';

export type LearnerContext = LearnerRow & { isMinor: boolean; timezone: string };

export type AppEnv = {
  Variables: {
    deps: Deps;
    user: AuthUser;
    account: AccountRow;
    learner: LearnerContext;
    /** The request's milestones since it reached the API (http/timing.ts, issue #447). */
    timeline: Timeline;
  };
};

export type AppContext = Context<AppEnv>;

export function depsOf(c: AppContext): Deps {
  return c.get('deps');
}

/** The caller's own token — what Supabase scopes a "sign out the others" against (#131). */
export function bearerOf(c: AppContext): string {
  const token = bearer(c);
  if (!token) throw new AppError('unauthenticated', 'Missing bearer token');
  return token;
}

function bearer(c: AppContext): string | null {
  const h = c.req.header('authorization');
  if (!h) return null;
  const [scheme, token] = h.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * The verified Supabase user of this request. Verified once per request: the
 * rate-limit middleware (http/limits.ts) may have done it already.
 */
export async function authenticate(c: AppContext): Promise<AuthUser> {
  const known = c.get('user') as AuthUser | undefined;
  if (known) return known;
  const token = bearer(c);
  if (!token) throw new AppError('unauthenticated', 'Missing bearer token');
  const user = await depsOf(c).auth.verify(token);
  if (!user) throw new AppError('unauthenticated', 'Invalid or expired token');
  c.get('timeline').mark('auth');
  c.set('user', user);
  return user;
}

/** Verified Supabase user. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  await authenticate(c);
  await next();
};

async function loadAccount(c: AppContext): Promise<AccountRow> {
  const known = c.get('account') as AccountRow | undefined;
  if (known) return known;
  const account = await findAccountByUser(depsOf(c).db, c.get('user').userId);
  if (!account) throw new AppError('forbidden', 'No account yet', { reason: 'account_missing' });
  // A deletion that has begun takes no more writes and cannot be cancelled (docs/privacy.md).
  assertNotDeleting(account.deletion_started_at);
  c.set('account', account);
  return account;
}

/**
 * Verified user with an account whose consent covers the current privacy text
 * (docs/privacy.md: `consent_version` must equal CONSENT_VERSION). After a
 * version bump everything learner-facing answers 409 consent_outdated until
 * the account holder has agreed again (POST /account).
 */
export const requireAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  const account = await loadAccount(c);
  const current = depsOf(c).config.CONSENT_VERSION;
  if (account.consent_version !== current) {
    throw new AppError('conflict', 'The privacy text has changed; please review it again', {
      reason: 'consent_outdated',
      current,
    });
  }
  await next();
};

/**
 * An account, whatever the consent version: for what must keep working before
 * the new text is accepted — the PIN (the adult needs it to agree again),
 * export and deletion (data subject rights never depend on consent).
 */
export const requireAccountAnyConsent: MiddlewareHandler<AppEnv> = async (c, next) => {
  await loadAccount(c);
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
  // The zone decides what "today" and "Friday" mean for every decision, so it is part of the
  // fenced context (CLAUDE.md rule 4): a change bumps context_version in the same transaction,
  // and a decision the model made in the old zone is stale instead of landing a day off
  // (audit M-48 timezone-header-no-context-bump). The bump goes through `bumpContext`, the one
  // door to the version (issue #315); a request in the zone already stored writes no more than
  // its presence.
  const settings = await deps.db.one<{ timezone: string }>(
    `insert into buddy_settings (learner_id, timezone, last_seen_at)
       values ($1, coalesce($2, $4::text), $3)
     on conflict (learner_id) do update set last_seen_at = $3
     returning timezone`,
    [learner.id, tz, now, DEFAULT_TIMEZONE],
  );
  let timezone = settings.timezone;
  if (tz !== null && tz !== timezone) {
    timezone = await deps.db.tx(async (tx) => {
      const moved = await tx.maybeOne<{ timezone: string }>(
        `update buddy_settings set timezone = $2
          where learner_id = $1 and timezone <> $2 returning timezone`,
        [learner.id, tz],
      );
      // Another request of hers moved it there meanwhile (and bumped): nothing more to do.
      if (moved) await bumpContext(tx, learner.id);
      return tz;
    });
  }
  c.set('learner', {
    ...learner,
    isMinor: isMinor(learner, now),
    timezone,
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
  return hasValidAdminToken(c) ? 'account_holder' : 'learner';
}

/** A valid, unexpired admin token for this account in x-admin-token. */
export function hasValidAdminToken(c: AppContext): boolean {
  const deps = depsOf(c);
  const token = c.req.header('x-admin-token');
  return (
    token !== undefined &&
    verifyAdminToken(deps.config.ADMIN_TOKEN_SECRET, token, c.get('account').id, deps.now())
  );
}

/** True when the request may do account-holder things (always for adults). */
export function hasAccountHolderRights(c: AppContext): boolean {
  return !c.get('learner').isMinor || actorOf(c) === 'account_holder';
}

/**
 * The same proof for routes that run without a learner profile (account-level
 * privacy, consent, credentials): with no profile, or an adult one, the
 * signed-in user is the account holder; for a minor's profile the admin token
 * is required.
 */
export function assertAccountHolderOf(c: AppContext, learner: LearnerRow | null): void {
  if (!learner || !isMinor(learner, depsOf(c).now())) return;
  if (!hasValidAdminToken(c))
    throw new AppError('admin_required', 'An adult has to confirm this with the PIN');
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
