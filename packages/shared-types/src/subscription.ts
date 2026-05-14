import { z } from 'zod';
import { Iso8601, SubscriptionStatus, Tier, Uuid } from './enums.js';

export const Subscription = z.object({
  account_id: Uuid,
  revenuecat_app_user_id: z.string(),
  product_id: z.string().nullable(),
  tier: Tier,
  status: SubscriptionStatus,
  expires_at: Iso8601.nullable(),
  trial_ends_at: Iso8601.nullable(),
  updated_at: Iso8601,
});
export type Subscription = z.infer<typeof Subscription>;
