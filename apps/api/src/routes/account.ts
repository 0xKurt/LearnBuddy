// Account routes. Doc 04 §account-and-learners.
//
// GET /account
//   Returns the authenticated account holder's account row, current
//   subscription, consent record (if accepted), and active learner (if any).
//   Per Doc 04 §49-65 this is the single endpoint mobile uses on cold launch
//   to decide whether to drop into the learner surface, finish onboarding,
//   or re-prompt for consent.
//
// GET /account/credits/summary — slice F1.

import { Hono } from 'hono';

import { ApiError, notImplemented } from '../lib/errors.js';
import { getDeps } from '../lib/deps.js';
import { requireAuth } from '../middleware/auth.js';

export const accountRoutes = new Hono();

accountRoutes.use('*', requireAuth);

accountRoutes.get('/', async (c) => {
  const { supabase } = getDeps(c);
  const { account_id } = c.get('auth');

  const account = await supabase.from('accounts').select('*').eq('id', account_id).maybeSingle();
  if (account.error) {
    throw new ApiError('internal', 'Failed to load account', { cause: account.error.message });
  }
  if (!account.data) {
    throw new ApiError('not_found', 'Account not found');
  }

  const subscription = await supabase
    .from('subscriptions')
    .select('*')
    .eq('account_id', account_id)
    .maybeSingle();
  if (subscription.error) {
    throw new ApiError('internal', 'Failed to load subscription', {
      cause: subscription.error.message,
    });
  }

  const learner = await supabase
    .from('learners')
    .select('*')
    .eq('account_id', account_id)
    .is('archived_at', null)
    .maybeSingle();
  if (learner.error) {
    throw new ApiError('internal', 'Failed to load learner', { cause: learner.error.message });
  }

  const acct = account.data as Record<string, unknown>;
  const sub = subscription.data as Record<string, unknown> | null;

  return c.json({
    id: acct.id,
    display_name: acct.display_name ?? null,
    locale: acct.locale,
    country_code: acct.country_code,
    subscription: sub
      ? {
          tier: sub.tier,
          status: sub.status,
          expires_at: sub.expires_at ?? null,
          trial_ends_at: sub.trial_ends_at ?? null,
        }
      : { tier: 'trial', status: 'expired', expires_at: null, trial_ends_at: null },
    consent:
      acct.dsgvo_consent_version && acct.dsgvo_consent_at
        ? { version: acct.dsgvo_consent_version, accepted_at: acct.dsgvo_consent_at }
        : null,
    learner: learner.data ?? null,
  });
});

accountRoutes.get('/credits/summary', (c) => notImplemented(c, 'GET /account/credits/summary'));
