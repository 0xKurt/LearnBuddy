// One place that turns failures into calm, specific words.
//
// Whatever is thrown, what comes out is one of the app's own texts in the learner's language.
// Nothing an engine, a library or a server wrote is ever passed through: no English, no code,
// no stack (issue #183 — a stream error from the fetch polyfill stood on a child's screen in
// the engine's own words). lib/__tests__/errors.test.ts holds this to the locale files.

// The class, not the transport: lib/api/apiError.ts and lib/auth/authFailure.ts carry no Expo
// module, so the one place that turns a failure into words can be tested under Node.
import { ApiError } from './api/apiError.js';
import { AuthFailure } from './auth/authFailure.js';
import { i18n } from './i18n/index.js';

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const reasonKey = err.reason ? `errors:reason.${err.reason}` : null;
    if (reasonKey && i18n.exists(reasonKey)) return i18n.t(reasonKey);
    const codeKey = `errors:code.${err.code}`;
    if (i18n.exists(codeKey)) return i18n.t(codeKey);
  }
  if (err instanceof AuthFailure) {
    // A reason whose text is missing would otherwise put the key itself on screen
    // ("auth:error.…") — a code in front of a child, the very thing this function exists to
    // keep away from her.
    const key = `auth:error.${err.reason}`;
    if (i18n.exists(key)) return i18n.t(key);
  }
  return i18n.t('errors:code.internal');
}

/** Why a conversation turn failed (SendMessageResponse.error_code). */
export function turnFailureText(code: string | null): string {
  const key = `errors:turn.${code ?? 'internal'}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('errors:turn.internal');
}
