// RevenueCat webhook. Doc 04 §webhooks + Doc 08 §grants.
//
// RevenueCat fires a server-to-server event on every subscription
// lifecycle transition (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
// EXPIRATION, BILLING_ISSUE). We verify the shared-secret header,
// translate the event to a subscription tier + status update, and grant
// credits per Doc 08 §grant-logic Path A.
//
// Configure REVENUECAT_WEBHOOK_SECRET in the deployment env and paste the
// same string in the RevenueCat dashboard (Project → Webhooks → secret).

import { Hono } from 'hono';
import { z } from 'zod';

import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';

const RevenueCatEvent = z.object({
  event: z.object({
    type: z.enum([
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'CANCELLATION',
      'EXPIRATION',
      'BILLING_ISSUE',
      'NON_RENEWING_PURCHASE',
      'UNCANCELLATION',
      'SUBSCRIBER_ALIAS',
      'TRIAL_STARTED',
      'TRIAL_CONVERTED',
      'TRIAL_CANCELLED',
    ]),
    app_user_id: z.string(),
    product_id: z.string().optional(),
    expiration_at_ms: z.number().int().optional(),
    period_type: z.string().optional(),
  }),
});

const TIER_FROM_PRODUCT: Record<string, 'standard' | 'plus'> = {
  'learnbuddy.standard.monthly': 'standard',
  'learnbuddy.plus.monthly': 'plus',
};

const MONTHLY_ALLOTMENT: Record<'standard' | 'plus', number> = {
  standard: 4000,
  plus: 10_000,
};

const ROLLOVER_CAP: Record<'standard' | 'plus', number> = {
  standard: 12_000,
  plus: 30_000,
};

export const webhookRoutes = new Hono();

webhookRoutes.post('/revenuecat', async (c) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const auth = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!secret) {
    throw new ApiError('internal', 'REVENUECAT_WEBHOOK_SECRET not configured');
  }
  if (!auth || auth !== `Bearer ${secret}`) {
    throw new ApiError('unauthenticated', 'Invalid webhook signature');
  }

  const raw = await c.req.json();
  const parsed = RevenueCatEvent.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('validation_failed', `Invalid webhook payload: ${parsed.error.message}`);
  }
  const ev = parsed.data.event;

  const { supabase } = getDeps(c);

  // Resolve the subscription by app_user_id (set during signup).
  const subRow = await supabase
    .from('subscriptions')
    .select('account_id, tier')
    .eq('revenuecat_app_user_id', ev.app_user_id)
    .maybeSingle();
  if (subRow.error || !subRow.data) {
    // No matching subscription — log and ack so RevenueCat doesn't retry forever.
    console.warn(`[webhook] no subscription for ${ev.app_user_id}`);
    return c.json({ ok: true, ignored: true });
  }
  const account_id = (subRow.data as { account_id: string }).account_id;

  const tier = ev.product_id ? (TIER_FROM_PRODUCT[ev.product_id] ?? null) : null;
  const expiresAt = ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null;

  switch (ev.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
    case 'TRIAL_CONVERTED': {
      if (tier) {
        await supabase
          .from('subscriptions')
          .update({
            tier,
            status: 'active',
            product_id: ev.product_id,
            expires_at: expiresAt,
          })
          .eq('account_id', account_id);
        await grantMonthlyAllotment(supabase, account_id, tier);
      }
      break;
    }
    case 'BILLING_ISSUE':
      await supabase.from('subscriptions').update({ status: 'grace' }).eq('account_id', account_id);
      break;
    case 'CANCELLATION':
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('account_id', account_id);
      break;
    case 'EXPIRATION':
      await supabase
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('account_id', account_id);
      break;
    case 'TRIAL_STARTED':
    case 'TRIAL_CANCELLED':
    case 'NON_RENEWING_PURCHASE':
    case 'SUBSCRIBER_ALIAS':
      // No state changes needed for these in v1.
      break;
  }

  return c.json({ ok: true });
});

async function grantMonthlyAllotment(
  supabase: ReturnType<typeof getDeps>['supabase'],
  account_id: string,
  tier: 'standard' | 'plus',
): Promise<void> {
  const allotment = MONTHLY_ALLOTMENT[tier];
  const cap = ROLLOVER_CAP[tier];

  const bucket = await supabase
    .from('credit_buckets')
    .select('current_balance')
    .eq('account_id', account_id)
    .maybeSingle();
  if (bucket.error || !bucket.data) return;
  const current = (bucket.data as { current_balance: number }).current_balance;

  const requested = current + allotment;
  const newBalance = Math.min(cap, requested);
  const granted = newBalance - current;
  const dropped = requested - newBalance;

  await supabase
    .from('credit_buckets')
    .update({
      tier,
      current_balance: newBalance,
      monthly_allotment: allotment,
      rollover_cap: cap,
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .eq('account_id', account_id);

  await supabase.from('credit_events').insert({
    account_id,
    delta: granted,
    reason: 'monthly_grant',
  });
  if (dropped > 0) {
    await supabase.from('credit_events').insert({
      account_id,
      delta: 0,
      reason: 'rollover_capped',
    });
  }
}
