// Map a retry-material failure into an Alert title + body the user can
// actually understand. The previous version reused the delete-failed
// strings, which made every retry-failure look like "Löschen
// fehlgeschlagen" — confusing, scary, and wrong.

import type { TFunction } from 'i18next';

import { ApiError } from '../../lib/api/client.js';

export function retryErrorCopy(err: unknown, t: TFunction): { title: string; body: string } {
  if (err instanceof ApiError) {
    if (err.code === 'max_attempts_reached') {
      return {
        title: t('material.retry_max_title'),
        body: t('material.retry_max_body'),
      };
    }
    if (err.code === 'insufficient_credits') {
      return {
        title: t('material.retry_credits_title'),
        body: t('material.retry_credits_body'),
      };
    }
    // Surface the server-supplied message so a real failure is debuggable
    // instead of "something went wrong".
    return {
      title: t('material.retry_failed_title'),
      body: err.message || t('material.retry_failed_body'),
    };
  }
  return {
    title: t('material.retry_failed_title'),
    body: err instanceof Error ? err.message : t('material.retry_failed_body'),
  };
}
