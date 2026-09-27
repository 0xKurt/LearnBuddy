// Per-account request budgets for the endpoints a script could hammer
// (docs/architecture.md §Limits, D-14): practice answers (typed and spoken)
// 600 an hour, messages to Buddy 120 an hour. One middleware in app.ts, in
// front of the module routes, using the shared primitive in lib/limits.ts.
// Refused requests get 429 with Retry-After and change nothing.

import type { MiddlewareHandler } from 'hono';

import { consume, limitError, type LimitScope } from '../lib/limits.js';
import { findAccountByUser } from '../modules/identity/model.js';
import { authenticate, depsOf, type AppEnv } from './context.js';

const BUDGETED: Array<{ scope: LimitScope; method: string; path: RegExp }> = [
  { scope: 'answers', method: 'POST', path: /\/practice\/sessions\/[^/]+\/(answer|speak)$/ },
  { scope: 'messages', method: 'POST', path: /\/buddy\/messages$/ },
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
