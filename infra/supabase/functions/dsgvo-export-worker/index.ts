// dsgvo-export-worker — Edge Function. Doc 09 §account-holder-rights.
//
// Picks dsgvo_requests where kind='export' and status='pending', assembles a
// JSON dump of the account's full footprint, uploads it to the
// `dsgvo-exports` storage bucket, generates a signed URL valid 7d, sets
// status='done' + result_path + result_signed_url_expires_at.
//
// The signed URL goes out by email via a hook on the dsgvo_requests row
// (configured in Supabase email templates). Mobile polls GET /dsgvo/requests/:id.

// @ts-expect-error — Deno-style import resolved at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (h: (r: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const pending = await supabase
    .from('dsgvo_requests')
    .select('id, account_id')
    .eq('kind', 'export')
    .eq('status', 'pending')
    .limit(20);
  if (pending.error) {
    return Response.json({ ok: false, error: pending.error.message }, { status: 500 });
  }

  let processed = 0;
  for (const req of pending.data ?? []) {
    const r = req as { id: string; account_id: string };
    await supabase.from('dsgvo_requests').update({ status: 'running' }).eq('id', r.id);

    // Gather data.
    const account = await supabase.from('accounts').select('*').eq('id', r.account_id).single();
    const learners = await supabase.from('learners').select('*').eq('account_id', r.account_id);
    const learnerIds = ((learners.data ?? []) as Array<{ id: string }>).map((l) => l.id);
    const subjects = learnerIds.length
      ? await supabase.from('subjects').select('*').in('learner_id', learnerIds)
      : { data: [] };
    const materials = learnerIds.length
      ? await supabase.from('materials').select('*').in('learner_id', learnerIds)
      : { data: [] };
    const items = learnerIds.length
      ? await supabase.from('items').select('*').in('learner_id', learnerIds)
      : { data: [] };
    const attempts = learnerIds.length
      ? await supabase.from('attempts').select('*').in('learner_id', learnerIds)
      : { data: [] };

    const dump = {
      exported_at: new Date().toISOString(),
      account: account.data,
      learners: learners.data,
      subjects: subjects.data,
      materials: materials.data,
      items: items.data,
      attempts: attempts.data,
    };

    const path = `${r.account_id}/${r.id}.json`;
    const upload = await supabase.storage
      .from('dsgvo-exports')
      .upload(path, new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }), {
        upsert: true,
      });
    if (upload.error) {
      await supabase.from('dsgvo_requests').update({ status: 'failed' }).eq('id', r.id);
      continue;
    }

    const signed = await supabase.storage
      .from('dsgvo-exports')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

    await supabase
      .from('dsgvo_requests')
      .update({
        status: 'done',
        result_path: signed.data?.signedUrl ?? path,
        result_signed_url_expires_at: expiresAt,
        completed_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    processed++;
  }

  return Response.json({ ok: true, processed });
});
