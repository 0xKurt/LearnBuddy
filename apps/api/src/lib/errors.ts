// Error envelope. Doc 04 §conventions + §error-codes.

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'insufficient_credits'
  | 'subscription_required'
  | 'extraction_failed'
  | 'evaluation_failed'
  | 'max_attempts_reached'
  | 'rate_limited'
  | 'not_educational'
  | 'not_implemented'
  | 'conflict'
  | 'learner_already_exists'
  | 'safety_blocked'
  | 'internal';

const HTTP_STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  insufficient_credits: 402,
  subscription_required: 402,
  extraction_failed: 502,
  evaluation_failed: 502,
  max_attempts_reached: 422,
  rate_limited: 429,
  not_educational: 422,
  not_implemented: 501,
  conflict: 409,
  learner_already_exists: 409,
  safety_blocked: 422,
  internal: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}
