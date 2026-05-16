// Learner profile routes. Doc 04 §learners + doc 01 §profile-features.
//
// POST /learners
//   Creates the single learner profile attached to the authenticated account.
//   A unique index `learners_account_idx` (active rows only) enforces the
//   one-profile-per-account rule — duplicate creation returns 409.
//   For minors (birth_year < now − 16), `minor_consent_version` is required.
//
// PATCH /learners/:id
//   Partial update. Editing `birth_year` may flip a profile between adult
//   and minor; `[implied — needs design]` for the tone/copy transition.
//
// DELETE /learners/:id
//   Soft-archive (sets `archived_at = now()`). 30-day grace before hard delete
//   is enforced by a daily Edge Function (separate slice).
//
// The /subjects sub-resource and /schedule-summary live in their own slice
// (B2) — left as `notImplemented` here until then.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { LearnerCreate, LearnerUpdate } from '@learnbuddy/shared-types';

import { ApiError, notImplemented } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';
import { idempotency } from '../lib/idempotency.js';
import { requireAuth } from '../middleware/auth.js';

export const learnerRoutes = new Hono();

learnerRoutes.use('*', requireAuth);

// ── Create ───────────────────────────────────────────────────────────────

learnerRoutes.post('/', idempotency, zValidator('json', LearnerCreate), async (c) => {
  const { supabase, now, env } = getDeps(c);
  const { account_id } = c.get('auth');
  const input = c.req.valid('json');

  const today = now();
  const ageThisYear = today.getUTCFullYear() - input.birth_year;
  const isMinor = ageThisYear < 16;
  if (isMinor && !input.minor_consent_version) {
    throw new ApiError('validation_failed', 'Minor profile requires explicit consent', {
      field: 'minor_consent_version',
    });
  }
  if (isMinor && input.minor_consent_version !== env.DSGVO_CONSENT_VERSION) {
    throw new ApiError('validation_failed', 'Minor consent version mismatch', {
      expected: env.DSGVO_CONSENT_VERSION,
    });
  }

  const insert = await supabase
    .from('learners')
    .insert({
      account_id,
      display_name: input.display_name,
      birth_year: input.birth_year,
      grade_level: input.grade_level,
      ui_locale: input.ui_locale,
      preferred_answer_mode: input.preferred_answer_mode,
      avatar_id: input.avatar_id,
    })
    .select('*')
    .single();

  if (insert.error) {
    // Postgres unique-violation code is 23505; the Supabase error surface
    // reports it as `code: '23505'` on the underlying `details.code`.
    const code = (insert.error as { code?: string }).code;
    if (code === '23505') {
      throw new ApiError('learner_already_exists', 'Account already has an active learner');
    }
    throw new ApiError('internal', 'Failed to create learner', { cause: insert.error.message });
  }

  return c.json(insert.data, 201);
});

// ── Patch ────────────────────────────────────────────────────────────────

learnerRoutes.patch('/:id', zValidator('json', LearnerUpdate), async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');
  const input = c.req.valid('json');

  if (Object.keys(input).length === 0) {
    throw new ApiError('validation_failed', 'Empty update body');
  }

  const upd = await supabase
    .from('learners')
    .update(input)
    .eq('id', id)
    .eq('account_id', account_id)
    .is('archived_at', null)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to update learner', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Learner not found');
  }

  return c.json(upd.data);
});

// ── Delete (soft-archive) ────────────────────────────────────────────────

learnerRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const id = c.req.param('id');

  const upd = await supabase
    .from('learners')
    .update({ archived_at: now().toISOString() })
    .eq('id', id)
    .eq('account_id', account_id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive learner', { cause: upd.error.message });
  }
  if (!upd.data) {
    throw new ApiError('not_found', 'Learner not found');
  }

  return c.json({ id: upd.data.id, archived: true });
});

// ── Sub-resources still to wire (Slice B2) ───────────────────────────────

learnerRoutes.get('/:learnerId/subjects', (c) =>
  notImplemented(c, 'GET /learners/:learnerId/subjects'),
);
learnerRoutes.post('/:learnerId/subjects', (c) =>
  notImplemented(c, 'POST /learners/:learnerId/subjects'),
);
learnerRoutes.get('/:learnerId/schedule-summary', (c) =>
  notImplemented(c, 'GET /learners/:learnerId/schedule-summary'),
);
