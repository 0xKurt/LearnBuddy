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
