// photo-wipe — daily Edge Function. Doc 09 §4 (raw photos T+7d).
//
// Selects materials with scheduled_photo_deletion_at < now() AND
// photos_deleted_at IS NULL, deletes the storage objects under
// `materials-raw/{account_id}/{material_id}/*`, and stamps
// photos_deleted_at. Idempotent — re-running the same day is a no-op.
//
// Deploy:
//   supabase functions deploy photo-wipe --no-verify-jwt
//   then schedule daily via pg_cron in a separate migration:
//     select cron.schedule('photo-wipe-daily','15 3 * * *',
//       'select net.http_post(...) /* invoke this function */');

// @ts-expect-error — Deno-style import resolved at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (h: (r: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from('materials')
    .select('id, learner_id')
    .is('photos_deleted_at', null)
    .lt('scheduled_photo_deletion_at', nowIso)
    .limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  let wiped = 0;
  for (const m of due ?? []) {
    const photos = await supabase
      .from('material_photos')
      .select('storage_path')
      .eq('material_id', (m as { id: string }).id);
    const paths = (photos.data ?? []).map((p) => (p as { storage_path: string }).storage_path);
    if (paths.length > 0) {
      const strippedPaths = paths.map((p) => p.replace(/^materials-raw\//, ''));
      await supabase.storage.from('materials-raw').remove(strippedPaths);
    }
    await supabase
      .from('materials')
      .update({ photos_deleted_at: nowIso })
      .eq('id', (m as { id: string }).id);
    wiped++;
  }
  return Response.json({ ok: true, wiped });
});
