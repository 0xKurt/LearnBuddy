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
//   Doc 08 §estimated-costs-per-action, then streams an SSE: `reading_images`
//   → `generating_items` → `done`. In Slice C2 the "done" event carries
//   PLACEHOLDER items (Doc 06 §P1 — real LLM extraction lands in D1). The
//   placeholder factory lives in lib/placeholders.ts and will be deleted
//   alongside its caller here in D1.
//
// GET /materials/:id           — full material with items
// GET /materials/:id/items     — items only
//
// All endpoints require an X-Learner-Id header (requireLearnerContext) and a
// bearer token (requireAuth). Cross-account access returns 404 (we do not
// leak that the id exists).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { MaterialCreateRequest, MaterialUploadUrlRequest } from '@learnbuddy/shared-types';

import { tryDebit, refund } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { notImplemented } from '../lib/errors.js';
import { generatePlaceholderItems } from '../lib/placeholders.js';
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
    const { supabase, now } = getDeps(c);
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

    // 2. Atomic credit pre-debit. Throws 402 on insufficient balance.
    const debit = {
      estimate: VISION_ESTIMATE,
      reason: 'materials_create',
      learner_id,
      reference_id: input.material_id,
    };
    await tryDebit(supabase, account_id, debit);

    // 3. Persist material_photos rows from the client-side quality scores.
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

    // 4. TEMPORARY — Slice D1 swaps this for `llm.visionExtractAndGenerate`.
    //    Doc 06 §P1. The placeholder factory is the only place in the prod
    //    path where the API invents content (CLAUDE.md §rule #5 carve-out).
    const placeholders = generatePlaceholderItems(input.material_id, learner_id, input.locale);
    const itemsIns = await supabase.from('items').insert(placeholders).select('*');
    if (itemsIns.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to persist generated items', {
        cause: itemsIns.error.message,
      });
    }
    const items = (itemsIns.data ?? []) as unknown[];

    // 5. Mark the material ready + schedule photo wipe at T+7d. Title is set
    //    when the client passed one; the LLM run in D1 will refine it.
    const updatedAt = now();
    const wipeAt = new Date(updatedAt.getTime() + PHOTO_WIPE_DELAY_MS).toISOString();
    const ready = await supabase
      .from('materials')
      .update({
        extraction_status: 'ready',
        page_count: input.client_quality_scores.length,
        detected_language: input.locale,
        title: input.title ?? null,
        scheduled_photo_deletion_at: wipeAt,
        extraction_model: 'placeholder-C2',
        extraction_prompt_version: 'placeholder-C2',
      })
      .eq('id', input.material_id);
    if (ready.error) {
      await refund(supabase, account_id, debit);
      throw new ApiError('internal', 'Failed to finalize material', {
        cause: ready.error.message,
      });
    }

    // 6. Stream the SSE response. C2 fires the phases back-to-back; D1 will
    //    interleave them with real Vertex calls.
    return streamMaterialEvents(c, async (push) => {
      await push({ event: 'phase', data: { phase: 'reading_images' } });
      await push({ event: 'phase', data: { phase: 'generating_items' } });
      await push({
        event: 'done',
        data: {
          material_id: input.material_id,
          items,
          templates: [],
          study_assets: [],
          extracted_language: input.locale,
          credits_used: VISION_ESTIMATE,
        },
      });
    });
  },
);

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

materialRoutes.get('/:id/templates', (c) => notImplemented(c, 'GET /materials/:id/templates')); // D3
materialRoutes.post(
  '/:id/regenerate-items',
  rateLimit({ key: 'materials_regenerate', per_day: 10 }),
  (c) => notImplemented(c, 'POST /materials/:id/regenerate-items (SSE)'),
); // D2
materialRoutes.patch('/:id', (c) => notImplemented(c, 'PATCH /materials/:id')); // G3
materialRoutes.delete('/:id', (c) => notImplemented(c, 'DELETE /materials/:id')); // G3
