import type { Context } from 'hono';
import type { z } from 'zod';

import { AppError } from '../lib/errors.js';

function issuesOf(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message }));
}

/** Parse and validate the JSON body; 422 invalid_input on any mismatch. */
export async function readBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('invalid_input', 'Body must be JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('invalid_input', 'Invalid request', { issues: issuesOf(parsed.error) });
  }
  return parsed.data as z.infer<S>;
}

/** Validate a value (path params, query); 422 on mismatch. */
export function check<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError('invalid_input', 'Invalid request', { issues: issuesOf(parsed.error) });
  }
  return parsed.data as z.infer<S>;
}
