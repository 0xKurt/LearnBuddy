import { z } from 'zod';

import { IsoDateTime, LocalDate, LocalTime, tolerantArray, Uuid } from './common.js';
import {
  DifficultyWish,
  PageProblem,
  SessionView,
  TestMinutes,
  UnclearSpot,
  VocabDirection,
  VoiceName,
  VoiceSpeed,
} from './learning.js';

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
    tool: z.literal('request_material'),
    step_id: Uuid,
    title: z.string(),
    /** The sheet this page completes, when it is one she already sent (issue #118). */
    material_id: Uuid.nullable().default(null),
  }),
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
  /** What she said about one of her own sheets, done in the conversation (issue #111). */
  z.object({ tool: z.literal('delete_material'), material_id: Uuid, title: z.string().nullable() }),
  /**
   * Buddy PROPOSES to delete something; the app shows a card with its name and two
   * buttons, and her tap is what decides (issue #151). Deleting a sheet cannot be taken
   * back, and consent is the one thing the model must not read between the lines
   * (CLAUDE.md rule 1, docs/UX-PRINCIPLES.md §18).
   */
  z.object({
    tool: z.literal('confirm_delete'),
    pending_id: Uuid,
    what: z.enum(['material', 'item']),
    /** The sheet's name as it read when she was asked. */
    title: z.string().nullable(),
    /** delete_item: the question, as she would read it. */
    detail: z.string().nullable(),
    /** Where it stands now, so the card is honest after the app was closed and reopened. */
    status: z.enum(['open', 'confirmed', 'declined', 'expired', 'superseded']).default('open'),
  }),
  z.object({ tool: z.literal('rename_material'), material_id: Uuid, title: z.string() }),
  /** One question she asked to be taken off a sheet (issue #120). */
  z.object({ tool: z.literal('delete_item'), item_id: Uuid, question: z.string() }),
  z.object({ tool: z.literal('schedule_check'), at: IsoDateTime }),
  /** Buddy's voice as she asked for it ("sprich langsamer", "andere Stimme"), ADR 0008. */
  z.object({ tool: z.literal('set_voice'), voice: VoiceName, speed: VoiceSpeed }),
  /** Buddy offers to start learning; the app shows a button that starts it (POST /practice/topic). */
  z.object({
    tool: z.literal('offer_learning'),
    kind: z.enum(['practice', 'vocab', 'speak', 'listen', 'help', 'test']),
    text: z.string(),
    /** A planned test it is for: its questions stay within that test's sheets. */
    goal_id: Uuid.nullable().default(null),
    /**
     * What she asked for beyond the topic (issue #113); the button hands both to
     * `POST /practice/topic`. Absent in older records, hence the defaults.
     */
    difficulty: DifficultyWish.nullable().default(null),
    direction: VocabDirection.nullable().default(null),
    /**
     * test only: the time limit she asked for (issue #241), one of `TEST_MINUTES`. Null — and
     * absent in older records — means no clock: a timer is never there without her wish.
     */
    minutes: TestMinutes.nullable().default(null),
    /**
     * Whether its button can still start anything (issue #196). False once preparing this
     * offer was refused as unusable — the app then shows the quiet line instead of a button
     * she would tap and wait on for nothing. Decided by the preparation, never by the model;
     * true until something proves otherwise (CLAUDE.md rule 5), hence the default for every
     * record written before this existed.
     */
    startable: z.boolean().default(true),
  }),
  /** Buddy points to a part of the app (said, not searched for); the app shows a button to open it. */
  z.object({
    tool: z.literal('open_area'),
    area: z.enum(['library', 'memory', 'settings', 'history', 'capture']),
  }),
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

/** Practice Buddy has prepared for today, ready to start. */
export const PreparedPractice = z.object({
  step_id: Uuid,
  title: z.string(),
  question_count: z.number().int(),
  est_minutes: z.number().int(),
  focus_topics: z.array(z.string()),
  goal: GoalBrief.nullable(),
});
export type PreparedPractice = z.infer<typeof PreparedPractice>;

/** The real stages of reading a sheet (docs/architecture.md §Material, gap 5). */
export const ReadingStage = z.enum(['sending', 'waiting', 'reading', 'building']);
export type ReadingStage = z.infer<typeof ReadingStage>;

export const NowCard = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resume_practice'),
    session_id: Uuid,
    /** help: homework help. */
    mode: z.enum(['practice', 'test', 'help']),
    title: z.string(),
    remaining: z.number().int(),
  }),
  z.object({ type: z.literal('practice_ready') }).extend(PreparedPractice.shape),
  z.object({
    type: z.literal('capture_needed'),
    step_id: Uuid.nullable(),
    title: z.string(),
    goal: GoalBrief.nullable(),
    /** A page that joins a sheet she already sent, not a new one (issue #118). */
    completes: Uuid.nullable().default(null),
  }),
  z.object({
    type: z.literal('material_processing'),
    material_id: Uuid,
    /** ready: read, and Buddy is making practice from it (stage 'building'). */
    status: z.enum(['awaiting_upload', 'queued', 'processing', 'ready']),
    /**
     * Where it really is (only real server stages, CLAUDE.md rule 5): the photos are on
     * their way, waiting for the reader, being read, or read and Buddy makes practice.
     * Missing from older servers: the app goes by `status`.
     */
    stage: ReadingStage.optional(),
    /** How many photos (pages) she sent. */
    pages: z.number().int().min(1).optional(),
    /** Tasks found, once read (stage 'building'): a result, never a count of due work. */
    found: z.number().int().min(0).nullable().optional(),
    /** Homework goes straight to help after reading: no practice to build. */
    purpose: z.enum(['study', 'homework']).optional(),
  }),
  z.object({
    type: z.literal('material_failed'),
    material_id: Uuid,
    reason: z.string().nullable(),
    retryable: z.boolean(),
    /** "Neues Foto" re-opens capture for the same purpose … */
    purpose: z.enum(['study', 'homework']),
    /** … and, for a failed retake or added page, the sheet it belongs to. */
    completes: Uuid.nullable(),
    /** The sheet's title, when it has one. */
    title: z.string().nullable(),
  }),
  z.object({
    type: z.literal('practice_result'),
    session_id: Uuid,
    /** help: homework — solved by herself, no hit rate (docs/UX-PRINCIPLES.md). */
    mode: z.enum(['practice', 'test', 'help']).default('practice'),
    result: PracticeResultBrief,
    /**
     * What is ready next, so the result never hides prepared practice (user feedback #2).
     * An unreadable one reads as none.
     */
    next: PreparedPractice.nullable().catch(null),
  }),
]);
export type NowCard = z.infer<typeof NowCard>;

/**
 * Something Buddy tells in the conversation (at its end, with buttons), not a card on
 * top: it does not push the rest of home around.
 */
export const HomeNotice = z.discriminatedUnion('type', [
  /** Some pages of a material could not be read: photograph them again, or leave it. */
  z.object({
    type: z.literal('pages_missing'),
    material_id: Uuid,
    title: z.string().nullable(),
    photo_count: z.number().int(),
    pages: z.array(PageProblem).min(1),
  }),
  /**
   * One spot the reading could not settle, asked in words — the smallest clarification a sheet
   * needs instead of "photograph the whole page again" (issue #164 point 1). Stands before
   * `pages_missing`: it is the small question, and answering it writes the one question that was
   * missing. Only ever one at a time, and it expires unanswered — nothing nags.
   */
  z.object({
    type: z.literal('unclear_spot'),
    /** The sheet her answer belongs to (the id the API takes the answer for). */
    material_id: Uuid,
    title: z.string().nullable(),
    /** Which of her photos the spot is on, and how many she sent for that reading. */
    page: z.number().int().min(1),
    photo_count: z.number().int(),
    /**
     * The material her photos were sent for — the same as `material_id` unless these pages were
     * added to an earlier sheet. The app shows that page from its own copy on the phone; no
     * crop and no coordinates are involved (a box from the model could point at another task).
     */
    photo_material_id: Uuid,
    spot: UnclearSpot,
  }),
]);
export type HomeNotice = z.infer<typeof HomeNotice>;

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
  push: z.enum(['active', 'no_token', 'disabled', 'invalid']).catch('disabled'),
  contact_enabled: z.boolean(),
  /** 'stale' = background work has not run recently: Buddy cannot act on its own. */
  scheduler: z.enum(['ok', 'stale', 'unknown']).catch('unknown'),
});
export type SystemStatus = z.infer<typeof SystemStatus>;

// Forward compatible (audit M-69): the API deploys at once, store builds lag.
// A card, notice, decision, action or message this build does not know is
// left out (never the whole home); an unknown presentation state reads as
// the calmest known one.
export const BuddyHome = z.object({
  learner: z.object({ id: Uuid, name: z.string(), is_minor: z.boolean() }),
  now: NowCard.nullable().catch(null),
  notice: HomeNotice.nullable().catch(null),
  decision: Decision.nullable().catch(null),
  done: tolerantArray(ActionView),
  next: tolerantArray(UpcomingItem),
  thread: tolerantArray(MessageView),
  thread_has_more: z.boolean(),
  system: SystemStatus,
  /**
   * Buddy is working on something the learner is waiting for right now: what to do with the
   * photos they just sent ('material') or the practice they just finished ('session').
   */
  working: z.enum(['material', 'session']).nullable().catch(null),
  /**
   * She answered a practice question today (her zone): the quiet "Heute geübt ✓" beside the
   * greeting (DESIGN-BRIEF §What we are NOT allows it). Never a count, never missed days.
   */
  practiced_today: z.boolean().catch(false),
  /**
   * What she is working on, as one line above the conversation (issue #160). Her own words
   * where she gave them, otherwise the subject and the sheet. Null while nothing has been
   * agreed — the line is not an empty slot waiting to be filled.
   */
  focus: z
    .object({
      text: z.string(),
      /** The sheet it is about, so tapping the line can open it. */
      material_id: Uuid.nullable().default(null),
    })
    .nullable()
    .catch(null),
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

/**
 * POST /buddy/messages with `Accept: text/event-stream` (docs/architecture.md §Speed):
 * `reply` events while Buddy writes, then one `done` event carrying the
 * SendMessageResponse (or `error` with { code }). A higher `round` replaces the
 * text of a lower one. `speakable`: the answer changes nothing, so the text may
 * be shown and read aloud now; otherwise wait for `done`.
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

export const StartStepResponse = z.object({
  session_id: Uuid,
  /** The started session itself, so the first question shows without another request. */
  session: SessionView.optional(),
});
export type StartStepResponse = z.infer<typeof StartStepResponse>;
