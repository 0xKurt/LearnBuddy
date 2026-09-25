// One place that turns failures into calm, specific words.

import { ApiError } from './api/client.js';
import { AuthFailure } from './auth/supabase.js';
import { i18n } from './i18n/index.js';

export function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    const reasonKey = err.reason ? `errors:reason.${err.reason}` : null;
    if (reasonKey && i18n.exists(reasonKey)) return i18n.t(reasonKey);
    const codeKey = `errors:code.${err.code}`;
    if (i18n.exists(codeKey)) return i18n.t(codeKey);
  }
  if (err instanceof AuthFailure) return i18n.t(`auth:error.${err.reason}`);
  return i18n.t('errors:code.internal');
}

/** Why a conversation turn failed (SendMessageResponse.error_code). */
export function turnFailureText(code: string | null): string {
  const key = `errors:turn.${code ?? 'internal'}`;
  return i18n.exists(key) ? i18n.t(key) : i18n.t('errors:turn.internal');
}
