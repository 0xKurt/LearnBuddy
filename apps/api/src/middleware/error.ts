// Error handler wired via `app.onError(...)` in app.ts. Doc 04 §error-codes.
//
// Hono v4 routes thrown errors through `this.errorHandler` rather than
// catch-around-`next()` middleware (see hono/dist/hono-base.js `#handleError`),
// so this is exported as an (err, c) => Response handler.
//
// ApiError exceptions are expected control flow — we don't ship them to
// Sentry. Anything else is unexpected; we capture, then surface the generic
// 500 error envelope to the client. We never leak internal error messages.

import type { Context, ErrorHandler } from 'hono';
import { ApiError } from '../lib/errors.js';
import { captureApiError } from '../lib/sentry.js';

export const errorHandler: ErrorHandler = (err, c: Context) => {
  if (err instanceof ApiError) {
    return c.json(err.toJSON(), err.status as never);
  }
  console.error('[api] unhandled error', err);
  captureApiError(err, {
    path: c.req.path,
    method: c.req.method,
    learner_id: c.get('learner_id'),
    account_id: c.get('auth')?.account_id,
  });
  const internal = new ApiError('internal', 'Internal server error');
  return c.json(internal.toJSON(), 500);
};
