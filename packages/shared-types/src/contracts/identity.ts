import { z } from 'zod';

import { AppLocale, IsoDateTime, LocalDate, Uuid } from './common.js';

export const LearnerLevel = z.enum(['unknown', 'school', 'university', 'adult']);
export type LearnerLevel = z.infer<typeof LearnerLevel>;

export const Pin = z.string().regex(/^\d{4,8}$/, '4–8 digits');

export const LearnerView = z.object({
  id: Uuid,
  relation: z.enum(['self', 'child']),
  display_name: z.string(),
  /** Shown to the adult for correction (profile under "Für Eltern"). */
  birth_date: LocalDate,
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
  /**
   * Required (true) for every child profile: the account holder's consent
   * (DSGVO Art. 8 under 16; for 16/17 it is recorded too, D-8).
   */
  minor_consent: z.boolean(),
  /**
   * The parents' PIN for a child profile, set in the same transaction as the
   * profile, so onboarding has no second call that could fail on its own.
   */
  pin: Pin.optional(),
});
export type CreateLearnerRequest = z.infer<typeof CreateLearnerRequest>;

export const UpdateLearnerRequest = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  /** A correction of the birth date (GDPR Art. 16); for a minor's profile only with the PIN. */
  birth_date: LocalDate.optional(),
  level: LearnerLevel.optional(),
  grade: z.number().int().min(1).max(13).nullable().optional(),
  locale: AppLocale.optional(),
  version: z.number().int(),
});
export type UpdateLearnerRequest = z.infer<typeof UpdateLearnerRequest>;

export const SetPinRequest = z.object({ pin: Pin, current_pin: Pin.optional() });
export type SetPinRequest = z.infer<typeof SetPinRequest>;

export const AdminSessionRequest = z.object({ pin: Pin });
export const AdminSessionResponse = z.object({ admin_token: z.string(), expires_at: IsoDateTime });
export type AdminSessionResponse = z.infer<typeof AdminSessionResponse>;

/**
 * A new password for the signed-in account, set by the API (Supabase admin)
 * so that for a minor's profile the parents' PIN is checked on the server.
 */
export const SetPasswordRequest = z.object({ password: z.string().min(8).max(200) });
export type SetPasswordRequest = z.infer<typeof SetPasswordRequest>;

export const DeletionResponse = z.object({ deletion_due_at: IsoDateTime.nullable() });
export type DeletionResponse = z.infer<typeof DeletionResponse>;
