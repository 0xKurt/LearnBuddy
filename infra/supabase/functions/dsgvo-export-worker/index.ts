// dsgvo-export-worker — Edge Function. Doc 09 §account-holder-rights.
//
// Picks dsgvo_requests where kind='export' and status='pending', streams a
// per-table NDJSON dump into Supabase Storage, generates a signed URL valid
// 7 days, marks the request done.
//
// Streaming approach: each table is paged in 1000-row chunks and written
// as NDJSON (one row per line). The previous implementation buffered
// everything as a single JSON.stringify and OOM'd the 256 MB Edge Function
// for power-user accounts (years of attempts can exceed that). NDJSON also
// makes diffing exports / pulling specific tables much easier for the
// account holder.

// @ts-expect-error — Deno-style import resolved at deploy time.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { acquireLock, releaseLock } from '../_shared/lock.ts';

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (h: (r: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;
const PAGE_SIZE = 1000;
const LOCK = 'dsgvo-export-worker';

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const lock = await acquireLock(supabase, LOCK);
  if (!lock) return Response.json({ ok: true, skipped: 'locked' });
  try {
    return await runExport(supabase);
  } finally {
    await releaseLock(supabase, LOCK);
  }
});

async function runExport(supabase: SupabaseClient): Promise<Response> {
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
    try {
      await exportOne(supabase, r);
      processed++;
    } catch (err) {
      console.error(`[dsgvo-export] account=${r.account_id}:`, err);
      await supabase.from('dsgvo_requests').update({ status: 'failed' }).eq('id', r.id);
    }
  }
  return Response.json({ ok: true, processed });
}

async function exportOne(
  supabase: SupabaseClient,
  r: { id: string; account_id: string },
): Promise<void> {
  // The Storage upload API needs a Blob, not a stream. We assemble NDJSON
  // chunk-by-chunk in a chunked array (each chunk ~1 MB worst case) and
  // upload in a single PUT at the end. Memory peak is the largest single
  // table's chunk array, not the entire account, so a learner with 50k
  // attempts (~5 MB NDJSON) stays well under the 256 MB Edge cap.
  const chunks: string[] = [];
  const append = (line: string): void => {
    chunks.push(line);
  };
  append(
    JSON.stringify({
      _meta: 'LearnBuddy DSGVO export',
      account_id: r.account_id,
      exported_at: new Date().toISOString(),
      format: 'ndjson',
      tables: [
        'account',
        'subscription',
        'credit_bucket',
        'credit_events',
        'learners',
        'subjects',
        'folders',
        'materials',
        'items',
        'item_states',
        'sessions',
        'attempts',
        'dsgvo_requests',
      ],
    }) + '\n',
  );

  // Account + subscription + credit_bucket are single-row; cheap.
  await dumpRow(supabase, 'account', 'accounts', { col: 'id', val: r.account_id }, append);
  await dumpRow(
    supabase,
    'subscription',
    'subscriptions',
    { col: 'account_id', val: r.account_id },
    append,
  );
  await dumpRow(
    supabase,
    'credit_bucket',
    'credit_buckets',
    { col: 'account_id', val: r.account_id },
    append,
  );

  await pageDump(
    supabase,
    'credit_events',
    'credit_events',
    { col: 'account_id', val: r.account_id },
    'created_at',
    append,
  );

  // Learner-scoped tables (one IN-list per table).
  const learners = await supabase
    .from('learners')
    .select('*')
    .eq('account_id', r.account_id);
  const learnerIds = ((learners.data ?? []) as Array<{ id: string }>).map((l) => l.id);
  for (const row of (learners.data ?? []) as Array<Record<string, unknown>>) {
    append(JSON.stringify({ _table: 'learners', ...row }) + '\n');
  }

  if (learnerIds.length > 0) {
    await pageDumpIn(supabase, 'subjects', 'subjects', 'learner_id', learnerIds, 'created_at', append);
    await pageDumpIn(supabase, 'folders', 'folders', 'subject_id', await subjectIds(supabase, learnerIds), 'created_at', append);
    await pageDumpIn(supabase, 'materials', 'materials', 'learner_id', learnerIds, 'created_at', append);
    await pageDumpIn(supabase, 'items', 'items', 'learner_id', learnerIds, 'created_at', append);
    await pageDumpIn(supabase, 'item_states', 'item_states', 'learner_id', learnerIds, 'updated_at', append);
    await pageDumpIn(supabase, 'sessions', 'sessions', 'learner_id', learnerIds, 'started_at', append);
    await pageDumpIn(supabase, 'attempts', 'attempts', 'learner_id', learnerIds, 'created_at', append);
  }

  await pageDump(
    supabase,
    'dsgvo_requests',
    'dsgvo_requests',
    { col: 'account_id', val: r.account_id },
    'requested_at',
    append,
  );

  const body = chunks.join('');
  chunks.length = 0; // GC hint.

  const path = `${r.account_id}/${r.id}.ndjson`;
  const upload = await supabase.storage
    .from('dsgvo-exports')
    .upload(path, new Blob([body], { type: 'application/x-ndjson' }), {
      upsert: true,
      contentType: 'application/x-ndjson',
    });
  if (upload.error) throw new Error(`upload failed: ${upload.error.message}`);

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
}

async function dumpRow(
  supabase: SupabaseClient,
  label: string,
  table: string,
  filter: { col: string; val: string },
  append: (line: string) => void,
): Promise<void> {
  const res = await supabase.from(table).select('*').eq(filter.col, filter.val).maybeSingle();
  if (res.error) throw new Error(`read ${table}: ${res.error.message}`);
  if (res.data) append(JSON.stringify({ _table: label, ...(res.data as object) }) + '\n');
}

async function pageDump(
  supabase: SupabaseClient,
  label: string,
  table: string,
  filter: { col: string; val: string },
  orderCol: string,
  append: (line: string) => void,
): Promise<void> {
  let offset = 0;
  while (true) {
    const page = await supabase
      .from(table)
      .select('*')
      .eq(filter.col, filter.val)
      .order(orderCol, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (page.error) throw new Error(`page ${table}: ${page.error.message}`);
    const rows = (page.data ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) append(JSON.stringify({ _table: label, ...row }) + '\n');
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
}

async function pageDumpIn(
  supabase: SupabaseClient,
  label: string,
  table: string,
  col: string,
  ids: string[],
  orderCol: string,
  append: (line: string) => void,
): Promise<void> {
  if (ids.length === 0) return;
  // Chunk the IN list to keep URL length / PG bind params reasonable.
  const ID_CHUNK = 200;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const sub = ids.slice(i, i + ID_CHUNK);
    let offset = 0;
    while (true) {
      const page = await supabase
        .from(table)
        .select('*')
        .in(col, sub)
        .order(orderCol, { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (page.error) throw new Error(`page ${table}: ${page.error.message}`);
      const rows = (page.data ?? []) as Array<Record<string, unknown>>;
      for (const row of rows) append(JSON.stringify({ _table: label, ...row }) + '\n');
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
}

async function subjectIds(supabase: SupabaseClient, learnerIds: string[]): Promise<string[]> {
  if (learnerIds.length === 0) return [];
  const r = await supabase.from('subjects').select('id').in('learner_id', learnerIds);
  return ((r.data ?? []) as Array<{ id: string }>).map((s) => s.id);
}
