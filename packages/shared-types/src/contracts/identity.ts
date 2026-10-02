import { z } from 'zod';

import { AppLocale, IsoDateTime, LocalDate, Uuid } from './common.js';

export const LearnerLevel = z.enum(['unknown', 'school', 'university', 'adult']);
export type LearnerLevel = z.infer<typeof LearnerLevel>;

export const Pin = z.string().regex(/^\d{4,8}$/, '4–8 digits');

/**
 * Where the learner goes to school, as far as the curriculum is concerned (issue #199).
 *
 * It decides what counts as a right answer. At twelve verified places in
 * `docs/lehrplan-und-uebungsformen.md` the same task has different expected solutions per
 * state: the sentence-element analysis of one German sentence has four, the operator
 * "vergleichen" demands a closing judgement in Bayern and explicitly none in Niedersachsen,
 * the Hypothesentest is compulsory in Berlin/Brandenburg and BW and absent from the NRW and
 * Bayern core curriculum. Without this, Buddy can teach a child something that is marked
 * wrong in her own class test.
 *
 * The sixteen keys are the ISO 3166-2:DE codes in lower case — stable machine keys; the
 * names a learner reads come from the locale files (`auth:region.names.*`), never from here.
 * The order is the German alphabet, which is the order the picker shows.
 *
 * `other` is the escape for a learner who is not at a German school (the app ships in five
 * languages): a required field with sixteen German states would be a dead end for her.
 * `other` is a given answer, not a missing one — and it is treated exactly like `null`: no
 * state-specific rule applied, and a more cautious judgement instead.
 *
 * WHAT READS IT (issue #214, since 02.10.2026 — this list is what is wired and tested, not
 * what is planned). The knowledge itself is a table in the API, one entry per place and one
 * ruling per state, each with the curriculum it comes from
 * (`apps/api/src/modules/curriculum/points.ts`). Three places read this field through it:
 * question GENERATION from a topic (`practice/generate.ts`) and from a photographed sheet
 * (`materials/service.ts`) are told the rule of her state; JUDGING an answer
 * (`practice/tutor.ts` via `service.ts`) is told it before it judges; and a practice TEST drops
 * a question her state does not teach at her year (`curriculum/state.ts` → `offCurriculum`).
 * Where no rule applies — `other`, `null`, or one of the ten states nobody has researched yet —
 * no state rule is used and a model "wrong" becomes "partly right" rather than a claim nobody
 * can back (`enforceTutorInvariants`). Proof: `apps/api/src/__tests__/curriculum.int.test.ts`
 * judges one question with one answer differently in Bayern and in NRW.
 *
 * The model never writes this value (CLAUDE.md rule 2): it comes from a tap at registration.
 */
export const CurriculumRegion = z.enum([
  'bw', // Baden-Württemberg
  'by', // Bayern
  'be', // Berlin
  'bb', // Brandenburg
  'hb', // Bremen
  'hh', // Hamburg
  'he', // Hessen
  'mv', // Mecklenburg-Vorpommern
  'ni', // Niedersachsen
  'nw', // Nordrhein-Westfalen
  'rp', // Rheinland-Pfalz
  'sl', // Saarland
  'sn', // Sachsen
  'st', // Sachsen-Anhalt
  'sh', // Schleswig-Holstein
  'th', // Thüringen
  'other', // not at a German school
]);
export type CurriculumRegion = z.infer<typeof CurriculumRegion>;

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
  /**
   * Null for every profile created before issue #199: the column is nullable and nothing
   * blocks on it. "Not known" — no state-specific curriculum rule is applied.
   */
  curriculum_region: CurriculumRegion.nullable(),
  version: z.number().int(),
  /**
   * She has turned 16 and has not yet confirmed the privacy text for herself (issue #31,
   * EDPB §147–149): the parents' consent carried her until now, from now on hers does.
   * The app asks her once; nothing is taken away while she has not answered.
   */
  own_consent_due: z.boolean(),
});
export type LearnerView = z.infer<typeof LearnerView>;

export const MeResponse = z.object({
  account: z
    .object({
      id: Uuid,
      locale: AppLocale,
      pin_set: z.boolean(),
      deletion_due_at: IsoDateTime.nullable(),
      /** The 7-day hold is over and the deletion is being carried out (no longer cancellable). */
      deletion_running: z.boolean(),
      consent_current: z.boolean(),
    })
    .nullable(),
  learner: LearnerView.nullable(),
  consent_version: z.string(),
  capabilities: z.object({ model: z.boolean(), push: z.boolean() }),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** From 16 she confirms the privacy text herself (issue #31). */
export const SelfConsentRequest = z.object({
  consent_version: z.string().min(1),
  accept_privacy: z.literal(true),
});
export type SelfConsentRequest = z.infer<typeof SelfConsentRequest>;

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
   * Required at registration (owner 2026-10-02, issue #199): "Einfach bei der Registrierung
   * als Pflichtfeld abfragen". A new profile without it is refused — there is nothing
   * sensible to guess, and a guessed state is worse than none.
   */
  curriculum_region: CurriculumRegion,
  /**
   * Required (true) for a child profile under 16: the parents' consent
   * (DSGVO Art. 8, German age 16, ADR 0006). From 16 she consents herself.
   */
  minor_consent: z.boolean(),
  /**
   * Contact opt-in decided during registration (owner 2026-09-28): for a child
   * the adult giving Art.-8 consent decides it in this same request; from 16
   * the learner does. Off unless explicitly true; later changes follow the
   * contact rules (loosening needs the adult PIN for minors).
   */
  contact_enabled: z.boolean().optional(),
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
  /**
   * The learner's own field, like level and grade: a profile that still has none (every
   * profile created before issue #199) can set it, and a family that moved can correct it.
   * It can never be cleared back to "not known" — that state only exists for rows that
   * were never asked.
   */
  curriculum_region: CurriculumRegion.optional(),
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
