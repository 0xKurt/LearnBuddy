// Materials routes. Doc 04 §materials + Doc 06 §P1 + Doc 08 §atomic-debit.
//
// POST /materials/upload-url
//   Reserves a `materials` row in `extraction_status='pending'` and returns
//   signed PUT URLs into the `materials-raw` bucket (one per photo).
//
// POST /materials
//   Confirms the photos are uploaded. Pre-debits the credit estimate, persists
//   `material_photos`, and ENQUEUES a durable `extraction_jobs` row, then
//   returns 202 immediately. The heavy Vertex work runs in a worker
//   (POST /materials-worker/drain) — NOT inside this request — so a dropped
//   connection or the function budget no longer strands the material. The
//   client polls GET /materials/:id for status. ADR 0003.
//
// POST /materials/:id/retry
//   Re-enqueues a failed/stuck material from the already-uploaded photos
//   (they live 7 days). Re-debits (the failed attempt was refunded); guarded
//   so a double-tap can't double-charge or double-enqueue.
//
// GET /materials/:id           — full material with items (carries
//                                extraction_status + extraction_error so the
//                                client can poll/retry)
// GET /materials/:id/items     — items only
//
// All learner endpoints require an X-Learner-Id header + bearer token.
// Cross-account access returns 404.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MaterialCreateRequest, MaterialUploadUrlRequest } from '@learnbuddy/shared-types';

import { refund, settle, tryDebit } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { VISION_ESTIMATE } from '../lib/extraction.js';

// Maximum total claim attempts (initial + retries) before we refuse to keep
// burning credits on a material that legitimately can't be extracted.
const MAX_RETRY_ATTEMPTS = 3;
import type { GeneratedVisionItem, VisionInput } from '../lib/llm/gateway.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const materialRoutes = new Hono();
materialRoutes.use('*', requireAuth, requireLearnerContext);

/** Verify the subject belongs to the authed learner. Returns 404 on miss. */
async function ownedSubject(
  supabase: ReturnType<typeof getDeps>['supabase'],
  learner_id: string,
  subject_id: string,
): Promise<void> {
  const s = await supabase
    .from('subjects')
    .select('id, learner_id')
    .eq('id', subject_id)
    .is('archived_at', null)
    .maybeSingle();
  if (s.error) {
    throw new ApiError('internal', 'Failed to resolve subject', { cause: s.error.message });
  }
  if (!s.data || (s.data as { learner_id: string }).learner_id !== learner_id) {
    throw new ApiError('not_found', 'Subject not found');
  }
}

/** Verify the folder belongs to the subject. Returns 404 on miss. */
async function ownedFolder(
  supabase: ReturnType<typeof getDeps>['supabase'],
  subject_id: string,
  folder_id: string,
): Promise<void> {
  const f = await supabase
    .from('folders')
    .select('id, subject_id')
    .eq('id', folder_id)
    .is('archived_at', null)
    .maybeSingle();
  if (f.error) {
    throw new ApiError('internal', 'Failed to resolve folder', { cause: f.error.message });
  }
  if (!f.data || (f.data as { subject_id: string }).subject_id !== subject_id) {
    throw new ApiError('not_found', 'Folder not found');
  }
}

/** Verify a material belongs to the authed learner. Returns 404 on miss. */
async function ownedMaterial(
  supabase: ReturnType<typeof getDeps>['supabase'],
  learner_id: string,
  material_id: string,
): Promise<{ id: string; learner_id: string; subject_id: string; folder_id: string | null }> {
  const m = await supabase
    .from('materials')
    .select('id, learner_id, subject_id, folder_id')
    .eq('id', material_id)
    .is('archived_at', null)
    .maybeSingle();
  if (m.error) {
    throw new ApiError('internal', 'Failed to load material', { cause: m.error.message });
  }
  if (!m.data || (m.data as { learner_id: string }).learner_id !== learner_id) {
    throw new ApiError('not_found', 'Material not found');
  }
  return m.data as {
    id: string;
    learner_id: string;
    subject_id: string;
    folder_id: string | null;
  };
}

// ── POST /materials/upload-url ──────────────────────────────────────────────

materialRoutes.post(
  '/upload-url',
  rateLimit({ key: 'materials_upload_url', per_day: 60 }),
  zValidator('json', MaterialUploadUrlRequest),
  async (c) => {
    const { supabase } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) {
      throw new ApiError('unauthenticated', 'Missing learner context');
    }
    const input = c.req.valid('json');

    await ownedSubject(supabase, learner_id, input.subject_id);
    if (input.folder_id) {
      await ownedFolder(supabase, input.subject_id, input.folder_id);
    }

    const created = await supabase
      .from('materials')
      .insert({
        subject_id: input.subject_id,
        folder_id: input.folder_id ?? null,
        learner_id,
        source_kind: 'photo',
        page_count: input.photo_count,
        extraction_status: 'pending',
      })
      .select('id')
      .single();
    if (created.error) {
      throw new ApiError('internal', 'Failed to reserve material', {
        cause: created.error.message,
      });
    }
    const material_id = (created.data as { id: string }).id;

    const ext = input.mime_type === 'image/png' ? 'png' : 'jpg';
    const uploads: Array<{
      position: number;
      storage_path: string;
      signed_url: string;
      expires_at: string;
    }> = [];
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    for (let i = 1; i <= input.photo_count; i++) {
      const path = `${account_id}/${material_id}/${i}.${ext}`;
      const signed = await supabase.storage.from('materials-raw').createSignedUploadUrl(path);
      if (signed.error || !signed.data?.signedUrl) {
        throw new ApiError('internal', 'Failed to sign upload URL', {
          cause: signed.error?.message ?? 'no signed url',
        });
      }
      uploads.push({
        position: i,
        storage_path: `materials-raw/${path}`,
        signed_url: signed.data.signedUrl,
        expires_at: expiresAt,
      });
    }

    return c.json({ material_id, uploads });
  },
);

// ── POST /materials — enqueue (no LLM work in the request) ──────────────────

materialRoutes.post(
  '/',
  rateLimit({ key: 'materials_create', per_day: 20 }),
  zValidator('json', MaterialCreateRequest),
  async (c) => {
    const { supabase, now } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) {
      throw new ApiError('unauthenticated', 'Missing learner context');
    }
    const input = c.req.valid('json');

    // 1. Ownership + shape.
    const material = await ownedMaterial(supabase, learner_id, input.material_id);
    if (material.subject_id !== input.subject_id) {
      throw new ApiError('validation_failed', 'subject_id does not match material');
    }
    if (input.client_quality_scores.length === 0) {
      throw new ApiError('validation_failed', 'client_quality_scores must be non-empty');
    }

    // 2. Atomic credit pre-debit (Doc 08) — debit on enqueue; the worker
    //    settles to actual cost, the failure/sweep path refunds.
    const debit = {
      estimate: VISION_ESTIMATE,
      reason: 'materials_create',
      learner_id,
      reference_id: input.material_id,
    };
    await tryDebit(supabase, account_id, debit);

    // 3. Persist the photo rows (idempotent-ish; one set per material).
    const photoRows = input.client_quality_scores.map((s) => ({
      material_id: input.material_id,
      position: s.position,
      storage_path: `materials-raw/${account_id}/${input.material_id}/${s.position}.jpg`,
      width: s.width ?? null,
      height: s.height ?? null,
      byte_size: null,
      client_blur_score: s.blur,
      client_brightness: s.brightness,
    }));
    const photosIns = await supabase.from('material_photos').insert(photoRows);
    if (photosIns.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to persist material photos');
    }

    // 4. Enqueue the durable job. One row per material (unique index).
    const jobIns = await supabase.from('extraction_jobs').insert({
      material_id: input.material_id,
      learner_id,
      account_id,
      subject_id: input.subject_id,
      status: 'queued',
      attempts: 0,
      locale: input.locale,
      title: input.title ?? null,
      client_quality_scores: input.client_quality_scores,
      credit_estimate: VISION_ESTIMATE,
      created_at: now().toISOString(),
      updated_at: now().toISOString(),
    });
    if (jobIns.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to enqueue extraction');
    }

    await supabase
      .from('materials')
      .update({ extraction_status: 'pending', extraction_error: null })
      .eq('id', input.material_id);

    return c.json({ material_id: input.material_id, status: 'pending' }, 202);
  },
);

// ── POST /materials/:id/retry ───────────────────────────────────────────────

materialRoutes.post('/:id/retry', rateLimit({ key: 'materials_retry', per_day: 20 }), async (c) => {
  const { supabase, now } = getDeps(c);
  const { account_id } = c.get('auth');
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const material_id = c.req.param('id');

  const material = await ownedMaterial(supabase, learner_id, material_id);

  const statusRow = await supabase
    .from('materials')
    .select('extraction_status')
    .eq('id', material_id)
    .maybeSingle();
  const status = (statusRow.data as { extraction_status: string } | null)?.extraction_status;
  if (status === 'ready') {
    throw new ApiError('validation_failed', 'Material is already processed');
  }

  const jobRow = await supabase
    .from('extraction_jobs')
    .select('*')
    .eq('material_id', material_id)
    .maybeSingle();
  const job = jobRow.data as {
    id: string;
    status: string;
    attempts: number;
    client_quality_scores: unknown;
    locale: string;
    title: string | null;
  } | null;
  if (!job) {
    throw new ApiError('not_found', 'No extraction job to retry');
  }
  // Guard a double-tap: an in-flight job must not be re-debited/re-queued.
  if (job.status === 'queued' || job.status === 'running') {
    return c.json({ material_id, status: 'pending' }, 202);
  }
  // Cap retries so a learner can't burn credits indefinitely on a material
  // that legitimately can't be extracted (non-educational page, unreadable
  // photo). The rate limit alone allows ~20 retries/day × 20 credits each.
  if (job.attempts >= MAX_RETRY_ATTEMPTS) {
    throw new ApiError(
      'max_attempts_reached',
      'This material has been retried too many times — please re-take the photos',
    );
  }

  // The prior failed attempt was refunded on failure, so a retry is a
  // fresh debit (not a double charge).
  const debit = {
    estimate: VISION_ESTIMATE,
    reason: 'materials_create',
    learner_id,
    reference_id: material_id,
  };
  await tryDebit(supabase, account_id, debit);

  const reset = await supabase
    .from('extraction_jobs')
    .update({
      status: 'queued',
      last_error: null,
      started_at: null,
      finished_at: null,
      updated_at: now().toISOString(),
      subject_id: material.subject_id,
    })
    .eq('id', job.id)
    .eq('status', job.status); // optimistic: only if it hasn't moved
  if (reset.error) {
    await refund(supabase, account_id, debit);
    throw new ApiError('internal', 'Failed to re-enqueue extraction');
  }

  await supabase
    .from('materials')
    .update({ extraction_status: 'pending', extraction_error: null })
    .eq('id', material_id);

  return c.json({ material_id, status: 'pending' }, 202);
});

// ── helpers ────────────────────────────────────────────────────────────────

function toItemRow(
  it: GeneratedVisionItem,
  material_id: string,
  learner_id: string,
  usage: { model: string; prompt_version: string },
): Record<string, unknown> {
  // study_asset_id surfaces both as a first-class FK on items and inside
  // stimulus_data; populate both so the read path can join either way.
  const studyAssetIdFromStimulus =
    typeof it.stimulus_data?.study_asset_id === 'string'
      ? (it.stimulus_data.study_asset_id as string)
      : null;
  return {
    material_id,
    learner_id,
    question: it.question,
    expected_answer: it.expected_answer,
    acceptable_answers: it.acceptable_answers ?? [],
    answer_kind: it.answer_kind,
    mc_options: it.mc_options ?? null,
    mc_correct_index: it.mc_correct_index ?? null,
    units: it.units ?? null,
    latex_expected: it.latex_expected ?? null,
    latex_acceptable: it.latex_acceptable ?? [],
    fill_blank_template: it.fill_blank_template ?? null,
    fill_blank_answers: it.fill_blank_answers ?? [],
    study_asset_id: studyAssetIdFromStimulus,
    diagram_label_index:
      it.answer_kind === 'diagram_label' && it.diagram_ref ? it.diagram_ref.label_index : null,
    stimulus_kind: it.stimulus_kind ?? 'none',
    stimulus_data: it.stimulus_data ?? {},
    difficulty: it.difficulty,
    topic: it.topic ?? null,
    language: it.language,
    source_excerpt: it.source_excerpt ?? null,
    generated_by_model: usage.model,
    generated_by_prompt_version: usage.prompt_version,
  };
}

// ── GET /materials ──────────────────────────────────────────────────────────

materialRoutes.get('/', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');

  const folder_id = c.req.query('folder_id');
  const subject_id = c.req.query('subject_id');
  if (!folder_id && !subject_id) {
    throw new ApiError('validation_failed', 'folder_id or subject_id is required');
  }

  const base = supabase
    .from('materials')
    .select('id, title, extraction_status, page_count, created_at, subject_id, folder_id')
    .eq('learner_id', learner_id)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const result = await (folder_id
    ? base.eq('folder_id', folder_id)
    : base.eq('subject_id', subject_id as string));
  if (result.error) {
    throw new ApiError('internal', 'Failed to load materials', { cause: result.error.message });
  }
  return c.json(result.data ?? []);
});

// ── GET /materials/:id ──────────────────────────────────────────────────────

materialRoutes.get('/:id', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');

  await ownedMaterial(supabase, learner_id, id);

  const m = await supabase.from('materials').select('*').eq('id', id).maybeSingle();
  if (m.error) {
    throw new ApiError('internal', 'Failed to load material', { cause: m.error.message });
  }
  if (!m.data) throw new ApiError('not_found', 'Material not found');

  const items = await supabase
    .from('items')
    .select('*')
    .eq('material_id', id)
    .is('archived_at', null);
  if (items.error) {
    throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
  }

  return c.json({
    ...(m.data as Record<string, unknown>),
    items: items.data ?? [],
    templates: [],
    study_assets: [],
  });
});

// ── GET /materials/:id/items ────────────────────────────────────────────────

materialRoutes.get('/:id/items', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');

  await ownedMaterial(supabase, learner_id, id);

  const items = await supabase
    .from('items')
    .select('*')
    .eq('material_id', id)
    .is('archived_at', null);
  if (items.error) {
    throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
  }
  return c.json({ items: items.data ?? [] });
});

// POST /materials/:id/regenerate-items — Doc 06 §P2. Reuses cached extracted
// markdown to generate ADDITIONAL items without re-OCRing the photos.
const RegenerateRequest = zValidator(
  'json',
  z.object({
    style: z.enum(['simpler', 'harder', 'more-variety']).nullable().optional(),
  }),
);
const REGENERATE_ESTIMATE = 8; // Doc 08 §estimated-costs-per-action

materialRoutes.post(
  '/:id/regenerate-items',
  rateLimit({ key: 'materials_regenerate', per_day: 10 }),
  RegenerateRequest,
  async (c) => {
    const { supabase, llm } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const material_id = c.req.param('id');
    const body = c.req.valid('json');

    const material = await ownedMaterial(supabase, learner_id, material_id);
    const matRow = await supabase
      .from('materials')
      .select('extracted_markdown, detected_language')
      .eq('id', material_id)
      .maybeSingle();
    if (matRow.error || !matRow.data) {
      throw new ApiError('not_found', 'Material not found');
    }
    const mat = matRow.data as {
      extracted_markdown: string | null;
      detected_language: string | null;
    };
    if (!mat.extracted_markdown) {
      throw new ApiError(
        'validation_failed',
        'Material has no extracted_markdown to regenerate from',
      );
    }

    const subjRow = await supabase
      .from('subjects')
      .select('name, subject_kind')
      .eq('id', material.subject_id)
      .maybeSingle();
    if (subjRow.error || !subjRow.data) throw new ApiError('not_found', 'Subject not found');
    const subject = subjRow.data as { name: string; subject_kind: VisionInput['subjectKind'] };

    const learnerRow = await supabase
      .from('learners')
      .select('grade_level')
      .eq('id', learner_id)
      .maybeSingle();
    const gradeLevel = (learnerRow.data as { grade_level: number | null } | null)?.grade_level ?? 7;

    const existing = await supabase
      .from('items')
      .select('question')
      .eq('material_id', material_id)
      .is('archived_at', null);
    const existingQuestions = (existing.data ?? []).map(
      (r) => (r as { question: string }).question,
    );

    const debit = {
      estimate: REGENERATE_ESTIMATE,
      reason: 'regenerate',
      learner_id,
      reference_id: material_id,
    };
    await tryDebit(supabase, account_id, debit);

    try {
      const result = await llm.regenerateFromText({
        extractedMarkdown: mat.extracted_markdown,
        locale: (mat.detected_language ?? 'de') as 'de' | 'en' | 'fr' | 'es' | 'it',
        gradeLevel,
        subject: subject.name,
        subjectKind: subject.subject_kind,
        style: body.style ?? undefined,
        excludeQuestions: existingQuestions,
      });
      const rows = result.items.map((it) => toItemRow(it, material_id, learner_id, result.usage));
      const ins = await supabase.from('items').insert(rows).select('*');
      if (ins.error) {
        await refund(supabase, account_id, debit);
        throw new ApiError('internal', 'Failed to insert regenerated items', {
          cause: ins.error.message,
        });
      }
      const actualCredits = Math.max(1, Math.round(result.usage.cost_usd_micros / 100));
      await settle(supabase, account_id, debit, actualCredits, result.usage);
      return c.json({
        added_items: ins.data ?? [],
        credits_used: actualCredits,
      });
    } catch (err) {
      await refund(supabase, account_id, debit);
      throw err instanceof ApiError
        ? err
        : new ApiError(
            'extraction_failed',
            err instanceof Error ? err.message : 'Regenerate failed',
          );
    }
  },
);

materialRoutes.get('/:id/templates', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');
  await ownedMaterial(supabase, learner_id, id);
  const t = await supabase
    .from('problem_templates')
    .select('*')
    .eq('material_id', id)
    .is('archived_at', null);
  if (t.error) {
    throw new ApiError('internal', 'Failed to load templates', { cause: t.error.message });
  }
  return c.json({ templates: t.data ?? [] });
});

// PATCH /materials/:id — rename / move-to-folder. Doc 04 §materials.
const MaterialPatchRequest = z.object({
  title: z.string().min(1).max(120).optional(),
  folder_id: z.string().uuid().nullable().optional(),
});

materialRoutes.patch('/:id', zValidator('json', MaterialPatchRequest), async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const material = await ownedMaterial(supabase, learner_id, id);

  if (Object.keys(body).length === 0) {
    throw new ApiError('validation_failed', 'Empty update body');
  }

  // If moving to a folder, confirm the new folder belongs to the same subject.
  if (body.folder_id) {
    await ownedFolder(supabase, material.subject_id, body.folder_id);
  }

  const upd = await supabase
    .from('materials')
    .update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.folder_id !== undefined ? { folder_id: body.folder_id } : {}),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to update material', { cause: upd.error.message });
  }
  if (!upd.data) throw new ApiError('not_found', 'Material not found');
  return c.json(upd.data);
});

// DELETE /materials/:id — soft archive (Doc 03 §soft-archive-pattern).
materialRoutes.delete('/:id', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');

  await ownedMaterial(supabase, learner_id, id);

  const upd = await supabase
    .from('materials')
    .update({ archived_at: now().toISOString() })
    .eq('id', id);
  if (upd.error) {
    throw new ApiError('internal', 'Failed to archive material', { cause: upd.error.message });
  }
  return c.json({ ok: true });
});
