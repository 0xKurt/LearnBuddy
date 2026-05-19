// GET /study-assets/:id — Doc 06 §P1.3 (numbered-diagram pipeline),
// Doc 07 §content-types (diagram_label).
//
// Resolves a study asset the learner owns to a short-lived signed image
// URL + the marker metadata the mobile DiagramQuestion needs. The
// storage_path is never exposed to the client.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';

const SIGNED_URL_TTL_SECONDS = 600;

type LabelPosition = { index: number; x: number; y: number };

export const studyAssetRoutes = new Hono();
studyAssetRoutes.use('*', requireAuth, requireLearnerContext);

studyAssetRoutes.get('/:id', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const id = c.req.param('id');

  const row = await supabase
    .from('study_assets')
    .select('id, learner_id, storage_path, width, height, metadata')
    .eq('id', id)
    .maybeSingle();
  if (row.error) {
    throw new ApiError('internal', 'Failed to load study asset', { cause: row.error.message });
  }
  const asset = row.data as {
    id: string;
    learner_id: string;
    storage_path: string;
    width: number;
    height: number;
    metadata: { label_positions?: LabelPosition[] } | null;
  } | null;
  if (!asset || asset.learner_id !== learner_id) {
    throw new ApiError('not_found', 'Study asset not found');
  }

  const signed = await supabase.storage
    .from('study-assets')
    .createSignedUrl(asset.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new ApiError('internal', 'Failed to sign study asset url', {
      cause: signed.error?.message ?? 'no url',
    });
  }

  return c.json({
    id: asset.id,
    width: asset.width,
    height: asset.height,
    label_positions: asset.metadata?.label_positions ?? [],
    signed_url: signed.data.signedUrl,
  });
});
