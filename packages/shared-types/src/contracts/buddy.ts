import { z } from 'zod';

import { IsoDateTime, LocalDate, LocalTime, tolerantArray, Uuid } from './common.js';
import { VoiceName, VoiceSpeed } from './voice.js';

// ─────────────── what Buddy did (rendered as cards, not prose) ───────────────

/** The generic tools' cards; a domain adds its own (`buddyContracts`). */
const CORE_ACTIONS = [
  z.object({
    tool: z.literal('remember'),
    memory_id: Uuid,
    statement: z.string(),
    kind: z.enum(['fact', 'preference', 'goal', 'constraint']),
    valid_until: IsoDateTime.nullable(),
  }),
  z.object({ tool: z.literal('correct_memory'), memory_id: Uuid, statement: z.string() }),
  z.object({
    tool: z.literal('forget'),
    /** Null when everything was forgotten at once (issue #114); then `forgotten` counts it. */
    memory_id: Uuid.nullable(),
    statement: z.string().nullable(),
    forgotten: z.number().int().optional(),
  }),
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
    tool: z.literal('plan_step'),
    step_id: Uuid,
    title: z.string(),
    date: LocalDate,
    time: LocalTime.nullable(),
    agreed: z.boolean(),
    /** A standing arrangement, so the card can say "jeden Tag" and not just a date (#112). */
    repeat: z.enum(['daily', 'weekdays', 'weekly']).nullable(),
    repeat_until: LocalDate.nullable(),
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
  z.object({
    tool: z.literal('set_contact'),
    preferred_start: LocalTime,
    preferred_end: LocalTime,
    avoid_weekdays: z.array(z.number().int()),
    paused_until: IsoDateTime.nullable(),
    /** No messages from then until the morning (absent in older records). */
    quiet_start: LocalTime.optional(),
    /** Nothing before this time in the morning (absent in records before issue #114). */
    quiet_end: LocalTime.optional(),
  }),
  z.object({ tool: z.literal('schedule_check'), at: IsoDateTime }),
  /** Buddy's voice as she asked for it ("sprich langsamer", "andere Stimme"), ADR 0008. */
  z.object({ tool: z.literal('set_voice'), voice: VoiceName, speed: VoiceSpeed }),
  /** Buddy points to a part of the app (said, not searched for); the app shows a button to open it. */
  z.object({
    tool: z.literal('open_area'),
    area: z.enum(['library', 'memory', 'settings', 'history', 'capture']),
  }),
] as const;

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

// ─────────────── conversation and home ───────────────

export const GoalBrief = z.object({
  id: Uuid,
  /** talk: a Referat, GFS, presentation or recital with its own steps (issue #264). */
  kind: z.enum(['exam', 'topic', 'talk']),
  title: z.string(),
  due_date: LocalDate.nullable(),
  days_left: z.number().int().nullable(),
  subject_name: z.string().nullable(),
});
export type GoalBrief = z.infer<typeof GoalBrief>;

export const Decision = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('contact_opt_in'),
    /** False for minors: an adult enables contact with the PIN. */
    can_enable_here: z.boolean(),
    /**
     * What would be allowed, from the stored rules, so the card (and the parents' PIN)
     * says exactly that (user feedback #4). Null from an older API.
     */
    rules: z.object({ quiet_start: LocalTime }).nullable().catch(null),
  }),
  z.object({
    type: z.literal('how_did_it_go'),
    goal: GoalBrief,
    /**
     * When the question arose — the start of the day after the test, in her zone (issue #630).
     * The card stands in the conversation at that moment instead of under everything said since;
     * the server stops asking a week after the test. Absent from an older server.
     */
    asked_at: IsoDateTime.optional(),
  }),
]);
export type Decision = z.infer<typeof Decision>;

export const UpcomingItem = z.object({
  /**
   * 'message': a message Buddy has planned to send (its title), not yet sent. 'talk': the day of a
   * talk she gives (issue #264) — a date like a test, but nothing to take a test on.
   */
  kind: z.enum(['exam', 'step', 'message', 'talk']),
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
  push: z.enum(['active', 'no_token', 'disabled', 'invalid']).catch('disabled'),
  contact_enabled: z.boolean(),
  /** 'stale' = background work has not run recently: Buddy cannot act on its own. */
  scheduler: z.enum(['ok', 'stale', 'unknown']).catch('unknown'),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

// ─────────────── what a domain adds (issue #107, cut 7) ───────────────

type ToolSummary = z.ZodDiscriminatedUnionOption<'tool'>;

/**
 * Buddy's conversation and home, built from what a domain adds to them (issue #107, cut 7): its
 * tools' cards (`actions`, discriminated by `tool`), its fields on a message (`message`) and on the
 * home (`home`). The generic core names none of them; a Buddy without a domain passes
 * `{ actions: [], message: {}, home: {} }`. The app's contracts are assembled from the core and
 * the learning domain in `buddyLearning.ts`.
 */
export function buddyContracts<
  const A extends readonly ToolSummary[],
  M extends z.ZodRawShape,
  H extends z.ZodRawShape,
>(domain: { actions: A; message: M; home: H }) {
  const ActionSummary = z.discriminatedUnion('tool', [...CORE_ACTIONS, ...domain.actions]);
  const ActionView = z.object({
    id: Uuid,
    status: z.enum(['applied', 'undone']),
    undoable: z.boolean(),
    summary: ActionSummary,
    created_at: IsoDateTime,
  });
  const MessageView = z.object({
    id: Uuid,
    role: z.enum(['learner', 'buddy']),
    text: z.string(),
    status: z.enum(['processing', 'done', 'failed']),
    /**
     * Why a learner message failed (status failed) or was held back by the safety filter
     * (status done, 'blocked'): blocked · model_unavailable · budget · invalid · stale · internal.
     * The app says what really happened instead of "not arrived" (CLAUDE.md rule 5).
     */
    failure_code: z.string().nullable().default(null),
    /** The app's idempotency key (learner messages); resend a failed message with it. */
    client_message_id: Uuid.nullable(),
    /** Quick answers Buddy offered with this message. */
    options: z.array(z.string()).nullable(),
    reply_to_id: Uuid.nullable(),
    /** A delivery state this build does not know reads as "no delivery line" (M-69). */
    outreach: OutreachView.nullable().catch(null),
    actions: tolerantArray(ActionView),
    ...domain.message,
    created_at: IsoDateTime,
  });
  // Forward compatible (audit M-69): the API deploys at once, store builds lag.
  // A card, notice, decision, action or message this build does not know is
  // left out (never the whole home); an unknown presentation state reads as
  // the calmest known one.
  const BuddyHome = z.object({
    learner: z.object({ id: Uuid, name: z.string(), is_minor: z.boolean() }),
    ...domain.home,
    decision: Decision.nullable().catch(null),
    done: tolerantArray(ActionView),
    next: tolerantArray(UpcomingItem),
    thread: tolerantArray(MessageView),
    thread_has_more: z.boolean(),
    system: SystemStatus,
    /** Context version the home was built from (debugging and stale checks). */
    context_version: z.number().int(),
    /**
     * When to ask again, in ms, while something is in progress (#671, KI-Audit F14): the server
     * says it, so the pace can change without an app release. Null: nothing in progress (the app
     * asks once a minute). Absent from an older API: the app decides by `pollAfterMs` itself.
     */
    // Bounded (#818 review): a value outside 1 s–2 min is not taken; the app then uses its own rule.
    poll_after_ms: z.number().int().min(1000).max(120_000).nullable().optional().catch(undefined),
  });
  const SendMessageResponse = z.object({
    status: z.enum(['done', 'processing', 'failed']),
    /** Stable code when failed: model_unavailable, budget_exhausted, … */
    error_code: z.string().nullable(),
    home: BuddyHome,
  });
  return { ActionSummary, ActionView, MessageView, BuddyHome, SendMessageResponse };
}

export const SendMessageRequest = z.object({
  client_message_id: Uuid,
  text: z.string().trim().min(1).max(2000),
  reply_to_id: Uuid.nullable().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

/**
 * POST /buddy/messages with `Accept: text/event-stream` (docs/architecture.md §Speed):
 * `reply` events while Buddy writes, then one `done` event carrying the
 * SendMessageResponse (or `error` with { code }). A higher `round` replaces the
 * text of a lower one. `speakable`: the text may be shown and read aloud now —
 * the answer changes nothing, or it has just been stored (#644); otherwise wait.
 */
export const ReplyStreamEvent = z.object({
  round: z.number().int().min(1),
  text: z.string(),
  speakable: z.boolean(),
  done: z.boolean(),
});
export type ReplyStreamEvent = z.infer<typeof ReplyStreamEvent>;

// ─────────────── memory ("Was Buddy weiß") ───────────────

export const MemoryView = z.object({
  id: Uuid,
  kind: z.enum(['fact', 'preference', 'goal', 'constraint']),
  statement: z.string(),
  /** 'consolidated': several of her items said once, by the nightly tidy-up (issue #20). */
  source: z.enum(['learner_stated', 'learner_edited', 'account_holder', 'consolidated']),
  quote: z.string().nullable(),
  valid_until: IsoDateTime.nullable(),
  created_at: IsoDateTime,
  version: z.number().int(),
});
export type MemoryView = z.infer<typeof MemoryView>;

export const MemoryList = z.object({ memories: z.array(MemoryView) });
export type MemoryList = z.infer<typeof MemoryList>;

/** Her answer to a proposed deletion (issue #151): the tap that decides, or the one that keeps it. */
export const AnswerConfirmationRequest = z.object({ confirm: z.boolean() });
export type AnswerConfirmationRequest = z.infer<typeof AnswerConfirmationRequest>;

export const UpdateMemoryRequest = z.union([
  z.object({ statement: z.string().trim().min(1).max(300), version: z.number().int() }),
  z.object({ retract: z.literal(true), version: z.number().int() }),
  /**
   * Taking a removal back, for the "Rückgängig" the app offers in the moment it happens
   * (issue #133 position 12). Deliberately not a way to resurrect anything at any time:
   * the server only allows it while the removal is fresh (UNRETRACT_WINDOW_MINUTES) and
   * the version still matches, so "vergessen" keeps meaning forgotten.
   */
  z.object({ unretract: z.literal(true), version: z.number().int() }),
]);
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequest>;

// ─────────────── settings: contact and Buddy's voice ───────────────

export const BuddySettingsView = z.object({
  contact_enabled: z.boolean(),
  quiet_start: LocalTime,
  quiet_end: LocalTime,
  preferred_start: LocalTime,
  preferred_end: LocalTime,
  avoid_weekdays: z.array(z.number().int().min(1).max(7)),
  paused_until: IsoDateTime.nullable(),
  /** "Seltener schreiben": only important messages from Buddy reach the phone. */
  only_important: z.boolean(),
  timezone: z.string(),
  /** Buddy's voice when read aloud (ADR 0008): chosen in the setup, the settings or by asking. */
  voice: VoiceName,
  /**
   * Whether Buddy's own (natural) voices can read her language here: a provider is configured
   * AND it reads this language (issue #526). Without them the phone's voice reads every sample
   * alike, so the app offers no voice to choose — no picker, no setup step. Said by the server
   * up front; the app never guesses it from a sample that happened to sound like the phone.
   */
  natural_voice: z.boolean(),
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
  paused_until: IsoDateTime.nullable().optional(),
  /** Off again allows more contact: under 16 with the parents' PIN. */
  only_important: z.boolean().optional(),
  /** Buddy's voice, picked in the setup or the settings (ADR 0008 §Amendment). */
  voice: VoiceName.optional(),
  version: z.number().int(),
});
export type UpdateBuddySettingsRequest = z.infer<typeof UpdateBuddySettingsRequest>;

/** Android notification channel the app creates and every push targets. */
// v2: Android never raises an existing channel's importance, so the HIGH
// channel (heads-up for a reminder she asked for) needs a new id; the app
// deletes the old 'buddy' channel on start (apps/mobile/lib/push.ts).
export const PUSH_CHANNEL_ID = 'buddy-v2';

/** A random id of this app install (not the hardware): push tokens are bound to it. */
export const DeviceId = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);

export const RegisterPushTokenRequest = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android']),
  /** Missing only from older app builds. */
  device_id: DeviceId.optional(),
});
export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequest>;

/** Claim (signed in) or release (signing out) this install's push binding. */
export const PushDeviceRequest = z.object({ device_id: DeviceId });
export type PushDeviceRequest = z.infer<typeof PushDeviceRequest>;

/** Notification category ids (the server sets one per push; the app registers the buttons). */
export const PUSH_CATEGORY = {
  /** A message about practice that is ready: "Jetzt üben", "Heute nicht", "Seltener schreiben". */
  practice: 'lb_practice',
  /** Any other message from Buddy: "Heute nicht", "Seltener schreiben". */
  message: 'lb_message',
} as const;

/** A button pressed on a notification (lib/push.ts), sent through the API (rule 5). */
export const OutreachAction = z.enum(['practice_now', 'not_today', 'less_often']);
export type OutreachAction = z.infer<typeof OutreachAction>;

export const OutreachActionRequest = z.object({ action: OutreachAction });
export type OutreachActionRequest = z.infer<typeof OutreachActionRequest>;

export const OutreachActionResponse = z.object({
  /** "Jetzt üben": the practice session the prepared practice started (null: none open). */
  session_id: Uuid.nullable(),
});
export type OutreachActionResponse = z.infer<typeof OutreachActionResponse>;

export const OutreachOpenedRequest = z.object({
  response: z.enum(['start', 'later', 'not_now', 'dismissed']).nullable(),
});
export type OutreachOpenedRequest = z.infer<typeof OutreachOpenedRequest>;
