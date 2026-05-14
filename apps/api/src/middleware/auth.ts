// Supabase JWT verification. Doc 02 §api + doc 04 §auth.
//
// Stub: extracts the bearer token from the Authorization header and verifies
// it via the Supabase SDK. In production the verifier should also cache the
// decoded claim shape per request lifecycle.

import type { MiddlewareHandler } from 'hono';
import { ApiError } from '../lib/errors.js';

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

export const requireAuth: MiddlewareHandler = async (c, _next) => {
  const header = c.req.header('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new ApiError('unauthenticated', 'Missing bearer token');
  }
  // TODO(doc 02 §api): verify JWT with @supabase/supabase-js auth.getUser(token)
  // and resolve account_id via a single query joining accounts on owner_user_id.
  // For the skeleton we throw unauthenticated so the 401 path is exercised even
  // when a (currently unverifiable) bearer token is present.
  throw new ApiError('unauthenticated', 'JWT verification not implemented');
};

export const optionalAuth: MiddlewareHandler = async (c, next) => {
  // For endpoints marked "public" in doc 04 that may still want to surface
  // an authenticated context when one is provided.
  await next();
};

export const requireLearnerContext: MiddlewareHandler = async (c, next) => {
  const learnerId = c.req.header('x-learner-id');
  if (!learnerId) {
    throw new ApiError('validation_failed', 'X-Learner-Id header required');
  }
  // TODO: confirm learner belongs to the authenticated account.
  c.set('learner_id', learnerId);
  await next();
};
