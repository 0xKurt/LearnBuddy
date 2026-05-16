// dsgvo-delete-executor — Edge Function. Doc 09 §account-holder-rights.
//
// Picks dsgvo_requests where kind='delete', status='pending', and
// requested_at + 7d <= now(). Deletes the auth user (cascade via FK
// deletes accounts → learners → subjects → … → all owned data).

// @ts-expect-error — Deno-style import resolved at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (h: (r: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HOLD_DAYS = 7;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const cutoff = new Date(Date.now() - HOLD_DAYS * 86_400_000).toISOString();
  const due = await supabase
    .from('dsgvo_requests')
    .select('id, account_id, requested_at')
    .eq('kind', 'delete')
    .eq('status', 'pending')
    .lt('requested_at', cutoff)
    .limit(20);
  if (due.error) {
    return Response.json({ ok: false, error: due.error.message }, { status: 500 });
  }

  let deleted = 0;
  for (const row of due.data ?? []) {
    const r = row as { id: string; account_id: string };
    await supabase.from('dsgvo_requests').update({ status: 'running' }).eq('id', r.id);

    const account = await supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', r.account_id)
      .single();
    const ownerUserId = (account.data as { owner_user_id: string } | null)?.owner_user_id;

    let ok = false;
    if (ownerUserId) {
      const del = await supabase.auth.admin.deleteUser(ownerUserId);
      ok = !del.error;
    }

    await supabase
      .from('dsgvo_requests')
      .update({
        status: ok ? 'done' : 'failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (ok) deleted++;
  }

  return Response.json({ ok: true, deleted });
});
