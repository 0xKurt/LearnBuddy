// Error envelope for the whole API: {"error": {"code", "message", "details"?}}.
// Codes are stable English identifiers; the app maps them to localized copy.
// Messages never contain provider bodies, SQL, stack traces or user content.

export const ERROR_STATUS = {
  unauthenticated: 401,
  admin_required: 403,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale: 409,
  too_large: 413,
  invalid_input: 422,
  pin_locked: 423,
  rate_limited: 429,
  budget_exhausted: 429,
  internal: 500,
  model_unavailable: 503,
  unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): (typeof ERROR_STATUS)[ErrorCode] {
    return ERROR_STATUS[this.code];
  }

  toJSON(): { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
