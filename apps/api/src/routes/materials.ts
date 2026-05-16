// Materials routes. Doc 04 §materials + Doc 06 §P1 + Doc 08 §atomic-debit.
//
// POST /materials/upload-url
//   Reserves a `materials` row in `extraction_status='pending'` and returns
//   signed PUT URLs into the `materials-raw` bucket (one per photo). The
//   storage paths are `materials-raw/{accountId}/{materialId}/{position}.jpg`
//   so the bucket RLS policy (migration 0008) lets the owner read them back.
//
// POST /materials
//   Confirms the photos are uploaded. Pre-debits the credit estimate per
//   Doc 08 §estimated-costs-per-action, downloads photo bytes from Supabase
//   Storage, calls the LLM gateway (Vertex in prod, Fake in tests / when GCP
//   is unconfigured) for vision extraction, then streams an SSE:
//   `reading_images` → `generating_items` → `done`. On not_educational,
//   too_few_items, or any Vertex-side failure the route refunds and marks
//   the material `failed` (Doc 06 §failure-modes-and-refunds).
//
// GET /materials/:id           — full material with items
// GET /materials/:id/items     — items only
//
// All endpoints require an X-Learner-Id header (requireLearnerContext) and a
// bearer token (requireAuth). Cross-account access returns 404 (we do not
// leak that the id exists).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { MaterialCreateRequest, MaterialUploadUrlRequest } from '@learnbuddy/shared-types';

import { refund, settle, tryDebit } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { notImplemented } from '../lib/errors.js';
import type { GeneratedVisionItem, VisionInput } from '../lib/llm/gateway.js';
import { streamMaterialEvents } from '../lib/sse.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const VISION_ESTIMATE = 20; // Doc 08 §estimated-costs-per-action
const PHOTO_WIPE_DELAY_MS = 7 * 86_400_000; // Doc 09 §4 (raw photos T+7d)

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

materialRoutes.post('/upload-url', zValidator('json', MaterialUploadUrlRequest), async (c) => {
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
});

// ── POST /materials ─────────────────────────────────────────────────────────

materialRoutes.post(
  '/',
  rateLimit({ key: 'materials_create', per_day: 20 }),
  zValidator('json', MaterialCreateRequest),
  async (c) => {
    const { supabase, llm, now } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    if (!learner_id) {
      throw new ApiError('unauthenticated', 'Missing learner context');
    }
    const input = c.req.valid('json');

    // 1. Confirm ownership of the freshly-allocated material row.
    const material = await ownedMaterial(supabase, learner_id, input.material_id);
    if (material.subject_id !== input.subject_id) {
      throw new ApiError('validation_failed', 'subject_id does not match material');
    }
    if (input.client_quality_scores.length === 0) {
      throw new ApiError('validation_failed', 'client_quality_scores must be non-empty');
    }

    // 2. Look up subject + learner context for the vision prompt.
    const subjRow = await supabase
      .from('subjects')
      .select('name, subject_kind')
      .eq('id', input.subject_id)
      .maybeSingle();
    if (subjRow.error || !subjRow.data) {
      throw new ApiError('not_found', 'Subject not found');
    }
    const subject = subjRow.data as { name: string; subject_kind: VisionInput['subjectKind'] };

    const learnerRow = await supabase
      .from('learners')
      .select('grade_level')
      .eq('id', learner_id)
      .maybeSingle();
    if (learnerRow.error || !learnerRow.data) {
      throw new ApiError('not_found', 'Learner not found');
    }
    const gradeLevel = (learnerRow.data as { grade_level: number | null }).grade_level ?? 7;

    // 3. Atomic credit pre-debit. Throws 402 on insufficient balance.
    const debit = {
      estimate: VISION_ESTIMATE,
      reason: 'materials_create',
      learner_id,
      reference_id: input.material_id,
    };
    await tryDebit(supabase, account_id, debit);

    // 4. Persist material_photos rows from the client-side quality scores.
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
      throw new ApiError('internal', 'Failed to persist material photos', {
        cause: photosIns.error.message,
      });
    }

    // 5. Download photo bytes from storage (Vertex needs base64-encoded images).
    //    Failing photos are skipped; if none survive we extraction_failed
    //    BEFORE the LLM call so the user gets a meaningful error instead of
    //    a misleading validation 400 from the gateway's images=0 guard.
    const images = await downloadPhotosAsBase64(
      supabase,
      `${account_id}/${input.material_id}`,
      input.client_quality_scores.length,
    );
    if (images.length === 0) {
      await refund(supabase, account_id, debit);
      await markFailed(supabase, input.material_id, 'photos_not_retrievable');
      throw new ApiError(
        'extraction_failed',
        'Could not retrieve any photos from storage. Try uploading again.',
      );
    }

    // 6. Call the LLM gateway. Doc 06 §P1. Errors mapped to Doc 06 §failure-modes.
    let vision;
    try {
      vision = await llm.visionExtractAndGenerate({
        images,
        locale: input.locale as VisionInput['locale'],
        gradeLevel,
        subject: subject.name,
        subjectKind: subject.subject_kind,
        targetCount: input.target_item_count,
      });
    } catch (err) {
      await refund(supabase, account_id, debit);
      await markFailed(
        supabase,
        input.material_id,
        err instanceof Error ? err.message : 'Unknown vision failure',
      );
      throw err instanceof ApiError
        ? err
        : new ApiError(
            'extraction_failed',
            err instanceof Error ? err.message : 'Vision call failed',
          );
    }

    if (vision.error === 'not_educational') {
      await refund(supabase, account_id, debit);
      await markFailed(supabase, input.material_id, 'not_educational');
      throw new ApiError('not_educational', 'Images do not look like educational material');
    }

    if (vision.items.length < 3) {
      await refund(supabase, account_id, debit);
      await markFailed(supabase, input.material_id, 'too_few_items');
      throw new ApiError('extraction_failed', 'Too few valid items after post-processing');
    }

    // 7. Persist items.
    const itemRows = vision.items.map((it) =>
      toItemRow(it, input.material_id, learner_id, vision.usage),
    );
    const itemsIns = await supabase.from('items').insert(itemRows).select('*');
    if (itemsIns.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to persist generated items', {
        cause: itemsIns.error.message,
      });
    }
    const persistedItems = (itemsIns.data ?? []) as unknown[];

    // 8. Mark the material ready + schedule photo wipe at T+7d.
    const updatedAt = now();
    const wipeAt = new Date(updatedAt.getTime() + PHOTO_WIPE_DELAY_MS).toISOString();
    const ready = await supabase
      .from('materials')
      .update({
        extraction_status: 'ready',
        page_count: input.client_quality_scores.length,
        detected_language: vision.detected_language ?? input.locale,
        extracted_markdown: vision.extracted_markdown,
        title: input.title ?? null,
        scheduled_photo_deletion_at: wipeAt,
        extraction_model: vision.usage.model,
        extraction_prompt_version: vision.usage.prompt_version,
      })
      .eq('id', input.material_id);
    if (ready.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to finalize material', {
        cause: ready.error.message,
      });
    }

    // 9. Settle credits to actual cost. Doc 08 §atomic-debit step 3.
    //    1 credit = 100 micro-dollars (= $0.0001). Round to nearest credit;
    //    floor at 1 so a zero-token call still records something.
    const actualCredits = Math.max(1, Math.round(vision.usage.cost_usd_micros / 100));
    await settle(supabase, account_id, debit, actualCredits, vision.usage);

    // 10. Stream the SSE response.
    return streamMaterialEvents(c, async (push) => {
      await push({ event: 'phase', data: { phase: 'reading_images' } });
      await push({ event: 'phase', data: { phase: 'generating_items' } });
      await push({
        event: 'done',
        data: {
          material_id: input.material_id,
          items: persistedItems,
          templates: [],
          study_assets: [],
          extracted_language: vision.detected_language ?? input.locale,
          credits_used: actualCredits,
        },
      });
    });
  },
);

// ── helpers ────────────────────────────────────────────────────────────────

/** Mark the material `failed` with an error message. Best-effort: a failure
 *  here is logged but not re-thrown, because the caller is already in an
 *  error path that's refunded the credit. Without this guard, an update
 *  failure would silently strand the material in `pending` after refund. */
async function markFailed(
  supabase: ReturnType<typeof getDeps>['supabase'],
  material_id: string,
  reason: string,
): Promise<void> {
  const upd = await supabase
    .from('materials')
    .update({ extraction_status: 'failed', extraction_error: reason })
    .eq('id', material_id);
  if (upd.error) {
    console.error(
      `[materials] markFailed(${material_id}, ${reason}): ${upd.error.message} — material may be stranded in 'pending' state`,
    );
  }
}

async function downloadPhotosAsBase64(
  supabase: ReturnType<typeof getDeps>['supabase'],
  prefix: string,
  count: number,
): Promise<Array<{ mimeType: 'image/jpeg' | 'image/png'; data: string }>> {
  const out: Array<{ mimeType: 'image/jpeg' | 'image/png'; data: string }> = [];
  for (let i = 1; i <= count; i++) {
    const path = `${prefix}/${i}.jpg`;
    const dl = await supabase.storage.from('materials-raw').download(path);
    if (dl.error || !dl.data) continue;
    const buf = Buffer.from(await dl.data.arrayBuffer());
    out.push({ mimeType: 'image/jpeg', data: buf.toString('base64') });
  }
  return out;
}

function toItemRow(
  it: GeneratedVisionItem,
  material_id: string,
  learner_id: string,
  usage: { model: string; prompt_version: string },
): Record<string, unknown> {
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

// ── Routes deferred to later slices ─────────────────────────────────────────
// Kept registered as 501 so the surface area matches Doc 04 §materials and
// the IMPLEMENTATION-AUDIT count of `notImplemented()` routes drops by 4
// (this slice) rather than by 4 and then re-rising when downstream slices
// add the missing handlers. Each line names the slice that completes it.

// POST /materials/:id/regenerate-items — Doc 06 §P2. Reuses cached extracted
// markdown to generate ADDITIONAL items without re-OCRing the photos.
const RegenerateRequest = zValidator(
  'json',
  z.object({
    target_item_count: z.number().int().min(1).max(25).default(10),
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
        targetCount: body.target_item_count,
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

materialRoutes.get('/:id/templates', (c) => notImplemented(c, 'GET /materials/:id/templates')); // D3
materialRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /materials/:id')); // G3
materialRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /materials/:id')); // G3
