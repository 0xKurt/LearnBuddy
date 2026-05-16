// Auth routes. Doc 04 §auth + doc 01 §account-features + doc 06 §trial-credits.
//
// POST /auth/account/signup
//   Public. Creates auth.users (via Supabase signup) + accounts + subscriptions
//   (trial, 14 days) + credit_buckets (1500 credits, 14-day period).
//   Sends the email confirmation via Supabase's default templates.
//
// POST /auth/account/consent
//   Authenticated. Records dsgvo_consent_version + dsgvo_consent_at on the
//   account row. Required once per session before /materials etc. may be used.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { AccountConsentInput, AccountSignup } from '@learnbuddy/shared-types';

import { ApiError } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';
import { idempotency } from '../lib/idempotency.js';
import { requireAuth } from '../middleware/auth.js';

export const authRoutes = new Hono();

// ── Signup ────────────────────────────────────────────────────────────────

authRoutes.post('/account/signup', idempotency, zValidator('json', AccountSignup), async (c) => {
  const { env, supabase, supabaseAnon, now } = getDeps(c);
  const input = c.req.valid('json');

  // 1. Create the auth user via the anon client. Supabase sends the
  //    confirmation email automatically based on the project email template.
  const signUp = await supabaseAnon.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: env.EMAIL_REDIRECT_URL,
      data: { locale: input.locale, country_code: input.country_code },
    },
  });
  if (signUp.error) {
    // Supabase returns 422 with `user_already_exists` for duplicates.
    const msg = signUp.error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || signUp.error.status === 422) {
      throw new ApiError('conflict', 'Email already in use');
    }
    if (msg.includes('password')) {
      throw new ApiError('validation_failed', signUp.error.message);
    }
    throw new ApiError('internal', signUp.error.message);
  }
  const user = signUp.data.user;
  if (!user) {
    throw new ApiError('internal', 'Signup returned no user');
  }

  // 2. Create the account, subscription, credit_bucket rows. We do this with
  //    the service client because RLS allows account access only for owners,
  //    and we don't have a session yet (email unverified).
  const nowDate = now();
  const trialEndsAt = new Date(nowDate.getTime() + 14 * 86_400_000);
  const periodEnd = new Date(nowDate.getTime() + 30 * 86_400_000);

  const accountInsert = await supabase
    .from('accounts')
    .insert({
      owner_user_id: user.id,
      locale: input.locale,
      country_code: input.country_code,
    })
    .select('id')
    .single();
  if (accountInsert.error) {
    throw new ApiError('internal', 'Failed to create account', { cause: accountInsert.error.message });
  }
  const accountId = accountInsert.data.id as string;

  const subInsert = await supabase.from('subscriptions').insert({
    account_id: accountId,
    revenuecat_app_user_id: `pending:${user.id}`,
    tier: 'trial',
    status: 'trial',
    trial_ends_at: trialEndsAt.toISOString(),
  });
  if (subInsert.error) {
    throw new ApiError('internal', 'Failed to create subscription', { cause: subInsert.error.message });
  }

  const bucketInsert = await supabase.from('credit_buckets').insert({
    account_id: accountId,
    tier: 'trial',
    current_balance: 1500,
    monthly_allotment: 1500,
    rollover_cap: 4500,
    current_period_end: periodEnd.toISOString(),
  });
  if (bucketInsert.error) {
    throw new ApiError('internal', 'Failed to create credit bucket', {
      cause: bucketInsert.error.message,
    });
  }

  await supabase.from('credit_events').insert({
    account_id: accountId,
    delta: 1500,
    reason: 'monthly_grant',
  });

  // Session is null until the email is confirmed.
  const session = signUp.data.session;
  return c.json(
    {
      account_id: accountId,
      user_id: user.id,
      requires_verification: session === null,
      session: session
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at ?? null,
          }
        : null,
    },
    201,
  );
});

// ── Consent ──────────────────────────────────────────────────────────────

authRoutes.post(
  '/account/consent',
  requireAuth,
  zValidator('json', AccountConsentInput),
  async (c) => {
    const { supabase, now, env } = getDeps(c);
    const { account_id } = c.get('auth');
    const input = c.req.valid('json');

    if (input.version !== env.DSGVO_CONSENT_VERSION) {
      throw new ApiError('validation_failed', 'Consent version mismatch', {
        expected: env.DSGVO_CONSENT_VERSION,
        received: input.version,
      });
    }

    const update = await supabase
      .from('accounts')
      .update({
        dsgvo_consent_version: input.version,
        dsgvo_consent_at: now().toISOString(),
      })
      .eq('id', account_id);
    if (update.error) {
      throw new ApiError('internal', 'Failed to record consent', { cause: update.error.message });
    }

    return c.json({
      account_id,
      version: input.version,
      accepted_at: now().toISOString(),
    });
  },
);
