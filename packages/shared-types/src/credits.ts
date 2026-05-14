import { z } from 'zod';
import { Iso8601, Tier, Uuid } from './enums.js';

export const CreditBucket = z.object({
  account_id: Uuid,
  tier: Tier,
  current_balance: z.number().int(),
  monthly_allotment: z.number().int(),
  rollover_cap: z.number().int(),
  current_period_start: Iso8601,
  current_period_end: Iso8601,
  updated_at: Iso8601,
});
export type CreditBucket = z.infer<typeof CreditBucket>;

export const CreditEventReason = z.enum([
  'monthly_grant',
  'rollover',
  'vision',
  'dialog_turn',
  'regenerate',
  'explain',
  'refund',
  'refund_failure',
]);
export type CreditEventReason = z.infer<typeof CreditEventReason>;

export const CreditEvent = z.object({
  id: Uuid,
  account_id: Uuid,
  learner_id: Uuid.nullable(),
  delta: z.number().int(),
  reason: CreditEventReason,
  reference_id: Uuid.nullable(),
  model: z.string().nullable(),
  prompt_version: z.string().nullable(),
  input_tokens: z.number().int().nullable(),
  output_tokens: z.number().int().nullable(),
  cost_usd_micros: z.number().int().nullable(),
  created_at: Iso8601,
});
export type CreditEvent = z.infer<typeof CreditEvent>;

export const CreditSummary = z.object({
  tier: Tier,
  current_balance: z.number().int(),
  monthly_allotment: z.number().int(),
  rollover_cap: z.number().int(),
  current_period_start: Iso8601,
  current_period_end: Iso8601,
  soft_cap_reached: z.boolean(),
});
export type CreditSummary = z.infer<typeof CreditSummary>;
