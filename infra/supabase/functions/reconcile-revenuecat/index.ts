// reconcile-revenuecat — daily Edge Function. Doc 08 §Path-B.
//
// Catches subscriptions whose period rolled over without a webhook arriving
// (RevenueCat sometimes drops events). Grants the monthly allotment for any
// account whose subscription is active/trial/grace AND
// credit_buckets.current_period_end < now().

// @ts-expect-error — Deno-style import resolved at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

declare const Deno: {
  env: { get: (k: string) => string | undefined };
  serve: (h: (r: Request) => Response | Promise<Response>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOTMENT: Record<string, number> = { trial: 1500, standard: 4000, plus: 10_000 };
const CAP: Record<string, number> = { trial: 1500, standard: 12_000, plus: 30_000 };

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();

  const due = await supabase
    .from('credit_buckets')
    .select('account_id, tier, current_balance')
    .lt('current_period_end', nowIso)
    .limit(500);
  if (due.error) return Response.json({ ok: false, error: due.error.message }, { status: 500 });

  let granted = 0;
  for (const b of due.data ?? []) {
    const row = b as { account_id: string; tier: string; current_balance: number };
    const allot = ALLOTMENT[row.tier] ?? 0;
    const cap = CAP[row.tier] ?? allot;
    if (allot === 0) continue;

    // Only renew if subscription is in a renewing state.
    const sub = await supabase
      .from('subscriptions')
      .select('status')
      .eq('account_id', row.account_id)
      .maybeSingle();
    const status = (sub.data as { status: string } | null)?.status ?? '';
    if (!['active', 'trial', 'grace'].includes(status)) continue;

    const newBalance = Math.min(cap, row.current_balance + allot);
    const delta = newBalance - row.current_balance;
    await supabase
      .from('credit_buckets')
      .update({
        current_balance: newBalance,
        current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      .eq('account_id', row.account_id);
    await supabase.from('credit_events').insert({
      account_id: row.account_id,
      delta,
      reason: 'monthly_grant_reconcile',
    });
    granted++;
  }
  return Response.json({ ok: true, granted });
});
