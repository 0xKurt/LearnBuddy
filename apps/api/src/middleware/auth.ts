// Supabase JWT verification. Doc 02 §api + doc 04 §auth.
//
// Verifies a bearer token via `auth.getUser(token)` on the anon client,
// then resolves `account_id` via a single SELECT on `accounts`. The result
// is cached on the request via `c.set('auth', ...)`.
//
// A second variant, `optionalAuth`, attaches the same context when a token
// is present but does not require it — used by public endpoints that may
// want to surface authenticated state if available.
//
// `requireLearnerContext` confirms an `X-Learner-Id` header belongs to the
// authenticated account before exposing it on the context.

import type { Context, MiddlewareHandler, Next } from 'hono';

import { ApiError } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';

export type AuthContext = {
  account_id: string;
  user_id: string;
  email: string;
};

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
    learner_id: string | null;
  }
}

function readBearer(c: Context): string | null {
  const header = c.req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

async function resolve(c: Context, token: string): Promise<AuthContext> {
  const { supabaseAnon, supabase } = getDeps(c);
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError('unauthenticated', 'Invalid or expired token');
  }
  const user = data.user;
  const email = user.email;
  if (!email) {
    throw new ApiError('unauthenticated', 'User has no email');
  }
  const accountRow = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (accountRow.error) {
    throw new ApiError('internal', 'Failed to resolve account', {
      cause: accountRow.error.message,
    });
  }
  if (!accountRow.data) {
    throw new ApiError('unauthenticated', 'Authenticated user has no account row');
  }
  return {
    account_id: accountRow.data.id as string,
    user_id: user.id,
    email,
  };
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = readBearer(c);
  if (!token) {
    throw new ApiError('unauthenticated', 'Missing bearer token');
  }
  const auth = await resolve(c, token);
  c.set('auth', auth);
  await next();
};

export const optionalAuth: MiddlewareHandler = async (c: Context, next: Next) => {
  const token = readBearer(c);
  if (token) {
    try {
      const auth = await resolve(c, token);
      c.set('auth', auth);
    } catch {
      // soft-fail: route may proceed unauthenticated
    }
  }
  await next();
};

export const requireLearnerContext: MiddlewareHandler = async (c, next) => {
  const learnerId = c.req.header('x-learner-id');
  if (!learnerId) {
    throw new ApiError('validation_failed', 'X-Learner-Id header required');
  }
  const auth = c.get('auth');
  if (!auth) {
    throw new ApiError('unauthenticated', 'requireLearnerContext used without requireAuth');
  }
  const { supabase } = getDeps(c);
  const lookup = await supabase
    .from('learners')
    .select('id')
    .eq('id', learnerId)
    .eq('account_id', auth.account_id)
    .is('archived_at', null)
    .maybeSingle();
  if (lookup.error) {
    throw new ApiError('internal', 'Failed to verify learner', { cause: lookup.error.message });
  }
  if (!lookup.data) {
    throw new ApiError('forbidden', 'Learner does not belong to authenticated account');
  }
  c.set('learner_id', learnerId);
  await next();
};
