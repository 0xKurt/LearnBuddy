// The error envelope of the API, as its own module: the class carries no
// transport and no Expo module, so the code that decides what a failure means
// (lib/capture/attachments.ts, lib/capture/materialUpload.ts) stays testable
// under Node. lib/api/client.ts re-exports it — nothing else changes.

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The more specific reason the API gives (e.g. "photos_missing"), if any. */
  get reason(): string | null {
    const r = this.details?.reason;
    return typeof r === 'string' ? r : null;
  }
}

/**
 * Whether the same request is worth sending again (issue #315): one rule for every screen.
 * A failure without an answer (no connection, a cut stream) and a 5xx may pass; a "slow down"
 * (`rate_limited`, 429) passes by waiting. Any other 4xx will not get better by repeating it —
 * that includes the day's model budget (`budget_exhausted`, also 429).
 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.code === 'rate_limited') return true;
  return !(err.status >= 400 && err.status < 500);
}

/** The session changed elsewhere: the question is already closed, the session ended or is gone. */
export function isOutdated(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'conflict' || err.code === 'not_found');
}
