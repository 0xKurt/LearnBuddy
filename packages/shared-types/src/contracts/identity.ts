import { z } from 'zod';

import { AppLocale, IsoDateTime, LocalDate, Uuid } from './common.js';

export const LearnerLevel = z.enum(['unknown', 'school', 'university', 'adult']);
export type LearnerLevel = z.infer<typeof LearnerLevel>;

export const LearnerView = z.object({
  id: Uuid,
  relation: z.enum(['self', 'child']),
  display_name: z.string(),
  is_minor: z.boolean(),
  level: LearnerLevel,
  grade: z.number().int().min(1).max(13).nullable(),
  locale: AppLocale,
  version: z.number().int(),
});
export type LearnerView = z.infer<typeof LearnerView>;

export const MeResponse = z.object({
  account: z
    .object({
      id: Uuid,
      locale: AppLocale,
      pin_set: z.boolean(),
      deletion_due_at: IsoDateTime.nullable(),
      consent_current: z.boolean(),
    })
    .nullable(),
  learner: LearnerView.nullable(),
  consent_version: z.string(),
  capabilities: z.object({ model: z.boolean(), push: z.boolean() }),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const CreateAccountRequest = z.object({
  locale: AppLocale,
  consent_version: z.string().min(1),
  accept_privacy: z.literal(true),
});
export type CreateAccountRequest = z.infer<typeof CreateAccountRequest>;

export const CreateLearnerRequest = z.object({
  relation: z.enum(['self', 'child']),
  display_name: z.string().trim().min(1).max(40),
  birth_date: LocalDate,
  locale: AppLocale,
  /** Required (true) when the learner is under 16: the account holder's consent. */
  minor_consent: z.boolean(),
});
export type CreateLearnerRequest = z.infer<typeof CreateLearnerRequest>;

export const UpdateLearnerRequest = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  level: LearnerLevel.optional(),
  grade: z.number().int().min(1).max(13).nullable().optional(),
  locale: AppLocale.optional(),
  version: z.number().int(),
});
export type UpdateLearnerRequest = z.infer<typeof UpdateLearnerRequest>;

export const Pin = z.string().regex(/^\d{4,8}$/, '4–8 digits');

export const SetPinRequest = z.object({ pin: Pin, current_pin: Pin.optional() });
export type SetPinRequest = z.infer<typeof SetPinRequest>;

export const AdminSessionRequest = z.object({ pin: Pin });
export const AdminSessionResponse = z.object({ admin_token: z.string(), expires_at: IsoDateTime });
export type AdminSessionResponse = z.infer<typeof AdminSessionResponse>;

export const DeletionResponse = z.object({ deletion_due_at: IsoDateTime.nullable() });
export type DeletionResponse = z.infer<typeof DeletionResponse>;
