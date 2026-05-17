// Admin (auth + allowlist). Doc 04 §admin.
//
// Admin endpoints serve internal dashboards. Authentication is two-layer:
//   1. requireAuth — must present a valid Supabase JWT (same as every other
//      authenticated endpoint).
//   2. The verified email on the JWT must appear in ADMIN_ALLOWLIST_EMAILS.
//
// The previous implementation trusted an unsigned `X-Admin-Email` header,
// which let anyone who knew an admin's address impersonate them. Replaced
// with a JWT-anchored check so an attacker would also need the admin's
// password/session.

import { Hono } from 'hono';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const adminRoutes = new Hono();

adminRoutes.use('*', requireAuth, async (c, next) => {
  const { email } = c.get('auth');
  const allowlist = (process.env.ADMIN_ALLOWLIST_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) {
    throw new ApiError('internal', 'ADMIN_ALLOWLIST_EMAILS not configured');
  }
  if (!allowlist.includes(email)) {
    throw new ApiError('forbidden', 'Account is not an admin');
  }
  await next();
});

// GET /admin/spend — aggregate credit_events for the operator dashboard.
//
// Query params:
//   ?since=ISO8601  (default: last 30 days)
//   ?account_id=…   (optional filter)
//
// Returns a per-reason totals breakdown plus per-day totals.
adminRoutes.get('/spend', async (c) => {
  const { supabase, now } = getDeps(c);
  const since = c.req.query('since') ?? new Date(now().getTime() - 30 * 86_400_000).toISOString();
  const accountFilter = c.req.query('account_id');

  let q = supabase
    .from('credit_events')
    .select('account_id, learner_id, delta, reason, model, cost_usd_micros, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (accountFilter) {
    q = q.eq('account_id', accountFilter);
  }
  const evs = await q;
  if (evs.error) {
    throw new ApiError('internal', 'Failed to load credit_events', { cause: evs.error.message });
  }
  const rows = (evs.data ?? []) as Array<{
    account_id: string;
    learner_id: string | null;
    delta: number;
    reason: string;
    model: string | null;
    cost_usd_micros: number | null;
    created_at: string;
  }>;

  const byReason = new Map<string, { credits: number; usd_micros: number; count: number }>();
  const byDay = new Map<string, { credits: number; usd_micros: number }>();
  let totalCredits = 0;
  let totalUsdMicros = 0;
  for (const r of rows) {
    const reason = r.reason;
    const day = r.created_at.slice(0, 10);
    const bucket = byReason.get(reason) ?? { credits: 0, usd_micros: 0, count: 0 };
    bucket.credits += r.delta;
    bucket.usd_micros += r.cost_usd_micros ?? 0;
    bucket.count += 1;
    byReason.set(reason, bucket);

    const dayBucket = byDay.get(day) ?? { credits: 0, usd_micros: 0 };
    dayBucket.credits += r.delta;
    dayBucket.usd_micros += r.cost_usd_micros ?? 0;
    byDay.set(day, dayBucket);

    totalCredits += r.delta;
    totalUsdMicros += r.cost_usd_micros ?? 0;
  }

  return c.json({
    since,
    account_id: accountFilter ?? null,
    total_credits: totalCredits,
    total_usd_micros: totalUsdMicros,
    by_reason: Object.fromEntries(byReason.entries()),
    by_day: Object.fromEntries(byDay.entries()),
    event_count: rows.length,
  });
});
