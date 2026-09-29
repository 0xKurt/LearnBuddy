// Per-account request budgets for the endpoints a script could hammer
// (docs/architecture.md §Limits, ADR 0006): practice answers (typed and spoken)
// 600 an hour, messages to Buddy 120 an hour — abuse protection far above what
// a learner does, never a limit on normal use. One middleware in app.ts, in
// front of the module routes, using the shared primitive in lib/limits.ts.
// Refused requests get 429 with Retry-After and change nothing.

import type { MiddlewareHandler } from 'hono';

import { consume, limitError, type LimitScope } from '../lib/limits.js';
import { findAccountByUser } from '../modules/identity/model.js';
import { authenticate, depsOf, type AppEnv } from './context.js';

const BUDGETED: Array<{ scope: LimitScope; method: string; path: RegExp }> = [
  // speak-word joined the spoken answers (issue #83); it carries the same budget (issue #86).
  {
    scope: 'answers',
    method: 'POST',
    path: /\/practice\/sessions\/[^/]+\/(answer|speak|speak-word)$/,
  },
  { scope: 'messages', method: 'POST', path: /\/buddy\/messages$/ },
  // Dictation parses up to 2 MB per request before the daily model cap answers 429 —
  // without an hourly budget those rounds were unbounded per account (issue #86).
  { scope: 'voice', method: 'POST', path: /\/voice\/transcribe$/ },
];

export function scopeFor(method: string, path: string): LimitScope | null {
  const hit = BUDGETED.find((b) => b.method === method && b.path.test(path));
  return hit ? hit.scope : null;
}

export const accountBudgets: MiddlewareHandler<AppEnv> = async (c, next) => {
  const scope = scopeFor(c.req.method, c.req.path);
  if (!scope) return next();
  const deps = depsOf(c);
  // Unauthenticated requests are refused here exactly as the route would.
  const user = await authenticate(c);
  const account = await findAccountByUser(deps.db, user.userId);
  // Without an account the route answers account_missing; nothing to count.
  if (account) {
    c.set('account', account);
    const result = await consume(deps.db, scope, account.id, deps.now());
    if (!result.allowed) throw limitError(result);
  }
  return next();
};
