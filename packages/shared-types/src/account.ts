import { z } from 'zod';
import { Iso8601, Locale, SubscriptionStatus, Tier, Uuid } from './enums.js';
import { Learner } from './learner.js';

export const AccountSubscription = z.object({
  tier: Tier,
  status: SubscriptionStatus,
  expires_at: Iso8601.nullable(),
  trial_ends_at: Iso8601.nullable(),
});
export type AccountSubscription = z.infer<typeof AccountSubscription>;

export const AccountConsent = z.object({
  version: z.string(),
  accepted_at: Iso8601,
});
export type AccountConsent = z.infer<typeof AccountConsent>;

export const Account = z.object({
  id: Uuid,
  display_name: z.string().nullable(),
  locale: Locale,
  country_code: z.string().length(2),
  subscription: AccountSubscription,
  consent: AccountConsent.nullable(),
  learner: Learner.nullable(),
});
export type Account = z.infer<typeof Account>;

export const AccountSignup = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  locale: Locale,
  country_code: z.string().length(2),
});
export type AccountSignup = z.infer<typeof AccountSignup>;

export const AccountConsentInput = z.object({
  accepted: z.literal(true),
  version: z.string(),
});
export type AccountConsentInput = z.infer<typeof AccountConsentInput>;
