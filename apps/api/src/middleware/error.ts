import type { Context, Next } from 'hono';
import { ApiError } from '../lib/errors.js';

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof ApiError) {
      return c.json(err.toJSON(), err.status as never);
    }
    console.error('[api] unhandled error', err);
    const internal = new ApiError('internal', 'Internal server error');
    return c.json(internal.toJSON(), 500);
  }
}
