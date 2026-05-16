// Error handler wired via `app.onError(...)` in app.ts. Doc 04 §error-codes.
//
// Hono v4 routes thrown errors through `this.errorHandler` rather than
// catch-around-`next()` middleware (see hono/dist/hono-base.js `#handleError`),
// so this is exported as an (err, c) => Response handler.

import type { Context, ErrorHandler } from 'hono';
import { ApiError } from '../lib/errors.js';

export const errorHandler: ErrorHandler = (err, c: Context) => {
  if (err instanceof ApiError) {
    return c.json(err.toJSON(), err.status as never);
  }
  console.error('[api] unhandled error', err);
  const internal = new ApiError('internal', 'Internal server error');
  return c.json(internal.toJSON(), 500);
};
