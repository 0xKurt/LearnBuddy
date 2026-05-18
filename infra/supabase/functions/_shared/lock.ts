// Shared cron-lock helper for Edge Functions. Migration 0013.
//
// Usage at the top of an Edge Function:
//   const lock = await acquireLock(supabase, 'photo-wipe');
//   if (!lock) return Response.json({ ok: true, skipped: 'locked' });
//   try { ...work... } finally { await releaseLock(supabase, 'photo-wipe'); }

// @ts-expect-error — esm.sh resolves at deploy time.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

export async function acquireLock(
  supabase: SupabaseClient,
  name: string,
): Promise<{ locked_until: string } | null> {
  const holder = `${Deno.env.get('DENO_DEPLOYMENT_ID') ?? 'local'}:${crypto.randomUUID()}`;
  const { data, error } = await supabase.rpc('lb_acquire_cron_lock', {
    p_name: name,
    p_holder: holder,
  });
  if (error) {
    console.warn(`[lock] acquire failed for ${name}: ${error.message}`);
    return null;
  }
  const rows = (data ?? []) as Array<{ name: string; locked_until: string }>;
  return rows.length > 0 ? { locked_until: rows[0]!.locked_until } : null;
}

export async function releaseLock(supabase: SupabaseClient, name: string): Promise<void> {
  await supabase.rpc('lb_release_cron_lock', { p_name: name });
}

declare const Deno: { env: { get: (k: string) => string | undefined } };
