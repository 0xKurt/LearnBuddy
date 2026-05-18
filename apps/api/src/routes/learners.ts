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
// Sub-resources (Slice B2):
//   GET  /learners/:learnerId/subjects          — subjects list w/ counts + test chip
//   POST /learners/:learnerId/subjects          — create a subject
//   GET  /learners/:learnerId/schedule-summary  — folders within 7 days + streak
// All three resolve the learner via account_id first so cross-account ids
// return 404 (we do not leak whether the id exists at all).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { LearnerCreate, LearnerUpdate, SubjectCreate } from '@learnbuddy/shared-types';

import { ApiError } from '../lib/errors.js';
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

// ── Sub-resources (Slice B2) ─────────────────────────────────────────────

type SubjectRow = {
  id: string;
  learner_id: string;
  name: string;
  subject_kind: string;
  color_hex: string;
  icon_id: string | null;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type FolderRow = {
  id: string;
  subject_id: string;
  name: string;
  scheduled_for: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialRow = {
  id: string;
  subject_id: string;
  archived_at: string | null;
};

/** Verify the learner belongs to this account and is active. 404 otherwise. */
async function resolveLearner(
  supabase: ReturnType<typeof getDeps>['supabase'],
  accountId: string,
  learnerId: string,
): Promise<{ id: string }> {
  const r = await supabase
    .from('learners')
    .select('id')
    .eq('id', learnerId)
    .eq('account_id', accountId)
    .is('archived_at', null)
    .maybeSingle();
  if (r.error) {
    throw new ApiError('internal', 'Failed to resolve learner', { cause: r.error.message });
  }
  if (!r.data) {
    throw new ApiError('not_found', 'Learner not found');
  }
  return r.data as { id: string };
}

/**
 * Days until a `YYYY-MM-DD` date string from `from`. Returns null when the
 * date is more than 7 days out, in the past, or unparseable. Inclusive of
 * today (0) — used by the home-screen "Test in N Tagen" chip per Doc 04 §subjects.
 */
function daysUntilWithinWindow(date: string, from: Date, windowDays = 7): number | null {
  // Anchor both ends at UTC midnight so we don't get half-day drift.
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays < 0 || diffDays > windowDays) return null;
  return diffDays;
}

learnerRoutes.get('/:learnerId/subjects', async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const learnerId = c.req.param('learnerId');

  await resolveLearner(supabase, account_id, learnerId);

  const showArchived = c.req.query('show_archived') === 'true';
  const baseQuery = supabase.from('subjects').select('*').eq('learner_id', learnerId);
  const subjectsRes = await (showArchived
    ? baseQuery.not('archived_at', 'is', null)
    : baseQuery.is('archived_at', null));
  if (subjectsRes.error) {
    throw new ApiError('internal', 'Failed to load subjects', { cause: subjectsRes.error.message });
  }
  const subjects = (subjectsRes.data ?? []) as SubjectRow[];
  if (subjects.length === 0) {
    return c.json([]);
  }
  const subjectIds = subjects.map((s) => s.id);

  // Batch-fetch folders + materials for these subjects. Two extra queries
  // total — fine for the ≤ ~12 subjects a learner will ever have.
  const foldersRes = await supabase
    .from('folders')
    .select('id, subject_id, scheduled_for, archived_at')
    .in('subject_id', subjectIds)
    .is('archived_at', null);
  if (foldersRes.error) {
    throw new ApiError('internal', 'Failed to load folders', { cause: foldersRes.error.message });
  }
  const folders = (foldersRes.data ?? []) as FolderRow[];

  const materialsRes = await supabase
    .from('materials')
    .select('id, subject_id, archived_at')
    .in('subject_id', subjectIds)
    .is('archived_at', null);
  if (materialsRes.error) {
    throw new ApiError('internal', 'Failed to load materials', {
      cause: materialsRes.error.message,
    });
  }
  const materials = (materialsRes.data ?? []) as MaterialRow[];

  const today = now();
  const decorated = subjects
    .map((s) => {
      const subjFolders = folders.filter((f) => f.subject_id === s.id);
      const subjMaterials = materials.filter((m) => m.subject_id === s.id);
      const upcoming = subjFolders
        .map((f) => (f.scheduled_for ? daysUntilWithinWindow(f.scheduled_for, today) : null))
        .filter((d): d is number => d !== null)
        .sort((a, b) => a - b);
      return {
        ...s,
        folder_count: subjFolders.length,
        material_count: subjMaterials.length,
        // Doc 01 explicitly forbids any "due items" count to the learner;
        // `upcoming_test_in_days` is a calendar fact, not a queue size.
        upcoming_test_in_days: upcoming.length > 0 ? upcoming[0] : null,
      };
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  return c.json(decorated);
});

learnerRoutes.post(
  '/:learnerId/subjects',
  idempotency,
  zValidator('json', SubjectCreate),
  async (c) => {
    const { supabase } = getDeps(c);
    const { account_id } = c.get('auth');
    const learnerId = c.req.param('learnerId');
    const input = c.req.valid('json');

    await resolveLearner(supabase, account_id, learnerId);

    const insert = await supabase
      .from('subjects')
      .insert({
        learner_id: learnerId,
        name: input.name,
        subject_kind: input.subject_kind,
        color_hex: input.color_hex,
        icon_id: input.icon_id ?? null,
        custom_glyph: input.custom_glyph ?? null,
        sort_order: input.sort_order ?? 0,
        archived_at: null,
      })
      .select('*')
      .single();
    if (insert.error) {
      throw new ApiError('internal', 'Failed to create subject', { cause: insert.error.message });
    }
    return c.json(insert.data, 201);
  },
);

learnerRoutes.get('/:learnerId/schedule-summary', async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const learnerId = c.req.param('learnerId');

  await resolveLearner(supabase, account_id, learnerId);

  const subjectsRes = await supabase
    .from('subjects')
    .select('id')
    .eq('learner_id', learnerId)
    .is('archived_at', null);
  if (subjectsRes.error) {
    throw new ApiError('internal', 'Failed to load subjects', {
      cause: subjectsRes.error.message,
    });
  }
  const subjectIds = ((subjectsRes.data ?? []) as Array<{ id: string }>).map((s) => s.id);

  let upcomingTests: Array<{
    folder_id: string;
    subject_id: string;
    name: string;
    scheduled_for: string;
    days_until: number;
  }> = [];

  if (subjectIds.length > 0) {
    const foldersRes = await supabase
      .from('folders')
      .select('id, subject_id, name, scheduled_for, archived_at')
      .in('subject_id', subjectIds)
      .is('archived_at', null);
    if (foldersRes.error) {
      throw new ApiError('internal', 'Failed to load folders', {
        cause: foldersRes.error.message,
      });
    }
    const today = now();
    upcomingTests = ((foldersRes.data ?? []) as FolderRow[])
      .filter((f): f is FolderRow & { scheduled_for: string } => f.scheduled_for !== null)
      .map((f) => {
        const d = daysUntilWithinWindow(f.scheduled_for, today);
        return d === null
          ? null
          : {
              folder_id: f.id,
              subject_id: f.subject_id,
              name: f.name,
              scheduled_for: f.scheduled_for,
              days_until: d,
            };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.days_until - b.days_until);
  }

  // Compute streak from completed sessions.
  const sessionsRes = await supabase
    .from('sessions')
    .select('started_at, ended_at')
    .eq('learner_id', learnerId);

  type SessionRow = { started_at: string; ended_at: string | null };
  const completedSessions = (
    !sessionsRes.error ? ((sessionsRes.data ?? []) as SessionRow[]) : []
  ).filter((s) => s.ended_at !== null);

  const activeDays = new Set(completedSessions.map((s) => s.started_at.slice(0, 10)));
  const lastSessionAt =
    completedSessions.slice().sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0]
      ?.started_at ?? null;

  let streakCurrent = 0;
  let streakLongest = 0;

  if (activeDays.size > 0) {
    // Current streak: walk backwards from today.
    let cursor = new Date(now().toISOString().slice(0, 10) + 'T00:00:00Z');
    while (activeDays.has(cursor.toISOString().slice(0, 10))) {
      streakCurrent++;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }

    // Longest streak: scan chronologically sorted unique days.
    const sortedDays = [...activeDays].sort();
    let run = 1;
    streakLongest = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const prev = sortedDays[i - 1];
      const curr = sortedDays[i];
      if (!prev || !curr) continue;
      const diff = (new Date(curr).getTime() - new Date(prev).getTime()) / 86_400_000;
      if (diff === 1) {
        run++;
        if (run > streakLongest) streakLongest = run;
      } else if (diff > 1) {
        run = 1;
      }
    }
  }

  return c.json({
    upcoming_tests: upcomingTests,
    streak_current: streakCurrent,
    streak_longest: streakLongest,
    last_session_at: lastSessionAt,
  });
});
