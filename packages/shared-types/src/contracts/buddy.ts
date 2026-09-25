import { z } from 'zod';

import { IsoDateTime, LocalDate, LocalTime, Uuid } from './common.js';

// ─────────────── what Buddy did (rendered as cards, not prose) ───────────────

export const ActionSummary = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('remember'),
    memory_id: Uuid,
    statement: z.string(),
    kind: z.enum(['fact', 'preference', 'goal', 'constraint']),
    valid_until: IsoDateTime.nullable(),
  }),
  z.object({ tool: z.literal('correct_memory'), memory_id: Uuid, statement: z.string() }),
  z.object({ tool: z.literal('forget'), memory_id: Uuid, statement: z.string() }),
  z.object({
    tool: z.literal('set_level'),
    level: z.enum(['unknown', 'school', 'university', 'adult']),
    grade: z.number().int().nullable(),
  }),
  z.object({
    tool: z.literal('plan_exam'),
    goal_id: Uuid,
    title: z.string(),
    due_date: LocalDate,
    subject_name: z.string().nullable(),
  }),
  z.object({
    tool: z.literal('update_goal'),
    goal_id: Uuid,
    title: z.string(),
    due_date: LocalDate.nullable(),
  }),
  z.object({
    tool: z.literal('close_goal'),
    goal_id: Uuid,
    title: z.string(),
    status: z.enum(['done', 'dropped']),
    outcome: z.enum(['good', 'ok', 'hard']).nullable(),
  }),
  z.object({
    tool: z.literal('prepare_practice'),
    step_id: Uuid,
    title: z.string(),
    question_count: z.number().int(),
    est_minutes: z.number().int(),
  }),
  z.object({
    tool: z.literal('plan_step'),
    step_id: Uuid,
    title: z.string(),
    date: LocalDate,
    time: LocalTime.nullable(),
    agreed: z.boolean(),
  }),
  z.object({
    tool: z.literal('update_step'),
    step_id: Uuid,
    title: z.string(),
    date: LocalDate.nullable(),
    time: LocalTime.nullable(),
    state: z.string(),
  }),
  z.object({ tool: z.literal('mark_step_done'), step_id: Uuid, title: z.string() }),
  z.object({ tool: z.literal('request_material'), step_id: Uuid, title: z.string() }),
  z.object({
    tool: z.literal('set_contact'),
    preferred_start: LocalTime,
    preferred_end: LocalTime,
    avoid_weekdays: z.array(z.number().int()),
    paused_until: IsoDateTime.nullable(),
    max_per_week: z.number().int(),
  }),
  z.object({ tool: z.literal('schedule_check'), at: IsoDateTime }),
]);
export type ActionSummary = z.infer<typeof ActionSummary>;

export const ActionView = z.object({
  id: Uuid,
  status: z.enum(['applied', 'undone']),
  undoable: z.boolean(),
  summary: ActionSummary,
  created_at: IsoDateTime,
});
export type ActionView = z.infer<typeof ActionView>;

// ─────────────── outreach (contact outside the app) ───────────────

export const OutreachStatus = z.enum([
  'suppressed',
  'scheduled',
  'sending',
  'accepted',
  'provider_accepted',
  'provider_rejected',
  'send_failed',
  'send_uncertain',
  'in_app',
  'expired',
  'cancelled',
]);
export type OutreachStatus = z.infer<typeof OutreachStatus>;

export const OutreachView = z.object({
  id: Uuid,
  kind: z.enum(['idea', 'reminder', 'checkin', 'result']),
  origin: z.enum(['agreed', 'buddy']),
  title: z.string(),
  body: z.string(),
  why: z.string().nullable(),
  status: OutreachStatus,
  send_at: IsoDateTime.nullable(),
  sent_at: IsoDateTime.nullable(),
  opened_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export type OutreachView = z.infer<typeof OutreachView>;

// ─────────────── conversation ───────────────

export const MessageView = z.object({
  id: Uuid,
  role: z.enum(['learner', 'buddy']),
  text: z.string(),
  status: z.enum(['processing', 'done', 'failed']),
  /** The app's idempotency key (learner messages); resend a failed message with it. */
  client_message_id: Uuid.nullable(),
  /** Quick answers Buddy offered with this message. */
  options: z.array(z.string()).nullable(),
  reply_to_id: Uuid.nullable(),
  outreach: OutreachView.nullable(),
  actions: z.array(ActionView),
  created_at: IsoDateTime,
});
export type MessageView = z.infer<typeof MessageView>;

// ─────────────── home: now / decision / done / next ───────────────

export const GoalBrief = z.object({
  id: Uuid,
  kind: z.enum(['exam', 'topic']),
  title: z.string(),
  due_date: LocalDate.nullable(),
  days_left: z.number().int().nullable(),
  subject_name: z.string().nullable(),
});
export type GoalBrief = z.infer<typeof GoalBrief>;

export const PracticeResultBrief = z.object({
  answered: z.number().int(),
  first_try: z.number().int(),
  secure_topics: z.array(z.string()),
  shaky_topics: z.array(z.string()),
});
export type PracticeResultBrief = z.infer<typeof PracticeResultBrief>;

export const NowCard = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resume_practice'),
    session_id: Uuid,
    title: z.string(),
    remaining: z.number().int(),
  }),
  z.object({
    type: z.literal('practice_ready'),
    step_id: Uuid,
    title: z.string(),
    question_count: z.number().int(),
    est_minutes: z.number().int(),
    focus_topics: z.array(z.string()),
    goal: GoalBrief.nullable(),
  }),
  z.object({
    type: z.literal('capture_needed'),
    step_id: Uuid.nullable(),
    title: z.string(),
    goal: GoalBrief.nullable(),
  }),
  z.object({
    type: z.literal('material_processing'),
    material_id: Uuid,
    status: z.enum(['awaiting_upload', 'queued', 'processing']),
  }),
  z.object({
    type: z.literal('material_failed'),
    material_id: Uuid,
    reason: z.string().nullable(),
    retryable: z.boolean(),
  }),
  z.object({ type: z.literal('practice_result'), session_id: Uuid, result: PracticeResultBrief }),
]);
export type NowCard = z.infer<typeof NowCard>;

export const Decision = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('contact_opt_in'),
    /** False for minors: an adult enables contact in the settings (PIN). */
    can_enable_here: z.boolean(),
  }),
  z.object({ type: z.literal('how_did_it_go'), goal: GoalBrief }),
]);
export type Decision = z.infer<typeof Decision>;

export const UpcomingItem = z.object({
  /** 'message': a message Buddy has planned to send (its title), not yet sent. */
  kind: z.enum(['exam', 'step', 'message']),
  id: Uuid,
  title: z.string(),
  date: LocalDate.nullable(),
  time: LocalTime.nullable(),
  state: z.string(),
  agreed: z.boolean(),
});
export type UpcomingItem = z.infer<typeof UpcomingItem>;

export const SystemStatus = z.object({
  model: z.boolean(),
  push: z.enum(['active', 'no_token', 'disabled', 'invalid']),
  contact_enabled: z.boolean(),
  /** 'stale' = background work has not run recently: Buddy cannot act on its own. */
  scheduler: z.enum(['ok', 'stale', 'unknown']),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

export const BuddyHome = z.object({
  learner: z.object({ id: Uuid, name: z.string(), is_minor: z.boolean() }),
  now: NowCard.nullable(),
  decision: Decision.nullable(),
  done: z.array(ActionView),
  next: z.array(UpcomingItem),
  thread: z.array(MessageView),
  thread_has_more: z.boolean(),
  system: SystemStatus,
  /**
   * Buddy is working on something the learner is waiting for right now: what to do with the
   * photos they just sent ('material') or the practice they just finished ('session').
   */
  working: z.enum(['material', 'session']).nullable(),
  /** Context version the home was built from (debugging and stale checks). */
  context_version: z.number().int(),
});
export type BuddyHome = z.infer<typeof BuddyHome>;

export const SendMessageRequest = z.object({
  client_message_id: Uuid,
  text: z.string().trim().min(1).max(2000),
  reply_to_id: Uuid.nullable().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const SendMessageResponse = z.object({
  status: z.enum(['done', 'processing', 'failed']),
  /** Stable code when failed: model_unavailable, budget_exhausted, … */
  error_code: z.string().nullable(),
  home: BuddyHome,
});
export type SendMessageResponse = z.infer<typeof SendMessageResponse>;

// ─────────────── memory ("Was Buddy weiß") ───────────────

export const MemoryView = z.object({
  id: Uuid,
  kind: z.enum(['fact', 'preference', 'goal', 'constraint']),
  statement: z.string(),
  source: z.enum(['learner_stated', 'learner_edited', 'account_holder']),
  quote: z.string().nullable(),
  valid_until: IsoDateTime.nullable(),
  created_at: IsoDateTime,
  version: z.number().int(),
});
export type MemoryView = z.infer<typeof MemoryView>;

export const MemoryList = z.object({ memories: z.array(MemoryView) });
export type MemoryList = z.infer<typeof MemoryList>;

export const UpdateMemoryRequest = z.union([
  z.object({ statement: z.string().trim().min(1).max(300), version: z.number().int() }),
  z.object({ retract: z.literal(true), version: z.number().int() }),
]);
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequest>;

// ─────────────── contact settings ───────────────

export const BuddySettingsView = z.object({
  contact_enabled: z.boolean(),
  quiet_start: LocalTime,
  quiet_end: LocalTime,
  preferred_start: LocalTime,
  preferred_end: LocalTime,
  avoid_weekdays: z.array(z.number().int().min(1).max(7)),
  max_per_day: z.number().int(),
  max_per_week: z.number().int(),
  paused_until: IsoDateTime.nullable(),
  timezone: z.string(),
  version: z.number().int(),
  /** Whether this device may loosen the rules without the adult's PIN. */
  can_loosen: z.boolean(),
});
export type BuddySettingsView = z.infer<typeof BuddySettingsView>;

export const UpdateBuddySettingsRequest = z.object({
  contact_enabled: z.boolean().optional(),
  quiet_start: LocalTime.optional(),
  quiet_end: LocalTime.optional(),
  preferred_start: LocalTime.optional(),
  preferred_end: LocalTime.optional(),
  avoid_weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  max_per_day: z.number().int().min(0).max(3).optional(),
  max_per_week: z.number().int().min(0).max(14).optional(),
  paused_until: IsoDateTime.nullable().optional(),
  version: z.number().int(),
});
export type UpdateBuddySettingsRequest = z.infer<typeof UpdateBuddySettingsRequest>;

export const RegisterPushTokenRequest = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android']),
});
export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequest>;

export const OutreachOpenedRequest = z.object({
  response: z.enum(['start', 'later', 'not_now', 'dismissed']).nullable(),
});
export type OutreachOpenedRequest = z.infer<typeof OutreachOpenedRequest>;

export const StartStepResponse = z.object({ session_id: Uuid });
export type StartStepResponse = z.infer<typeof StartStepResponse>;
