// The learning domain's part of Buddy's conversation and home (issue #107, cut 7): its tools' cards,
// its fields on a message and on the home, and its responses. Assembled with the generic core
// (`buddyContracts` in buddy.ts) into the contracts the app and the API use.

import { z } from 'zod';

import { buddyContracts, GoalBrief } from './buddy.js';
import { IsoDateTime, LocalDate, Uuid } from './common.js';
import { DrillCarry, DrillLine, DrillRange, DrillRow } from './drill.js';
import { ModelFigureType } from './figure.js';
import {
  DifficultyWish,
  PageProblem,
  PracticeSummary,
  SessionView,
  TestMinutes,
  UnclearSpot,
  VocabDirection,
  VocabularyRequest,
} from './learning.js';
import { RehearsalKind, RehearsalView, TalkFormat, TalkStage } from './talk.js';

// ─────────────── a roleplay in a foreign language (issue #244) ───────────────

/** The languages a roleplay can be played in — the app's five. */
export const RoleplayLanguage = z.enum(['de', 'en', 'fr', 'es', 'it']);
export type RoleplayLanguage = z.infer<typeof RoleplayLanguage>;

/** Her turns in one roleplay before code ends it and gives the feedback (issue #244). */
export const ROLEPLAY_MAX_TURNS = 12;

/** A roleplay running right now, for the conversation mode: it listens and reads in this language. */
export const RoleplayNow = z.object({
  id: Uuid,
  language: RoleplayLanguage,
  /** Where it plays, in her words — the strip above the conversation names it. */
  scene: z.string().default(''),
});
export type RoleplayNow = z.infer<typeof RoleplayNow>;

/**
 * The checked feedback after a roleplay (issue #384): each key point of her role card, managed
 * only with a quote that stands in her own lines, and up to three of her lines said better. No
 * grade, no score, no count. Code checked it (`checkFeedback`, modules/buddy/roleplay.ts); the
 * app shows it as the result card and never parses it out of the message's text.
 */
export const RoleplayFeedback = z.object({
  points: z.array(
    z.object({
      /** The key point, in her app language, as the role card named it. */
      name: z.string(),
      met: z.boolean(),
      /** Her own words that show it; null when not met. */
      quote: z.string().nullable(),
    }),
  ),
  /** Her line as she wrote it, and how she could say it more naturally, in the roleplay language. */
  better: z.array(z.object({ said: z.string(), better: z.string() })),
});
export type RoleplayFeedback = z.infer<typeof RoleplayFeedback>;

// ─────────────── its tools' cards ───────────────

/**
 * Where a practice card's practice stands now (issue #844), decorated when the thread is served
 * (CLAUDE.md rule 5): null while it waits to be started; running with what is left of her run;
 * done with the run that finished it; closed when it can no longer start (replaced, dropped, or
 * its run left behind). What stood in the conversation stays there, in its end state.
 */
export const PracticeOutcome = z.discriminatedUnion('state', [
  z.object({ state: z.literal('running'), session_id: Uuid, left: z.number().int() }),
  z.object({ state: z.literal('done'), session_id: Uuid }),
  z.object({ state: z.literal('closed') }),
]);
export type PracticeOutcome = z.infer<typeof PracticeOutcome>;

const LEARNING_ACTIONS = [
  z.object({
    tool: z.literal('prepare_practice'),
    step_id: Uuid,
    title: z.string(),
    question_count: z.number().int(),
    est_minutes: z.number().int(),
  }),
  z.object({
    tool: z.literal('request_material'),
    step_id: Uuid,
    title: z.string(),
    /** The sheet this page completes, when it is one she already sent (issue #118). */
    material_id: Uuid.nullable().default(null),
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
  /** Buddy offers to start learning; the app shows a button that starts it (POST /practice/topic). */
  z.object({
    tool: z.literal('offer_learning'),
    kind: z.enum([
      'practice',
      'vocab',
      'speak',
      'listen',
      'help',
      'test',
      'spelling_dictation',
      'teach_back',
      'read',
      'essay',
    ]),
    /**
     * spelling_dictation: the sheet the words come from (issue #242); teach_back: the sheet the
     * questions are about (issue #236); essay: the sheet with the writing task (issue #258) — the
     * button hands it to `POST /practice/topic` as `material_id`. Null for every other kind and in
     * older records.
     */
    material_id: Uuid.nullable().default(null),
    text: z.string(),
    /** A planned test it is for: its questions stay within that test's sheets. */
    goal_id: Uuid.nullable().default(null),
    /**
     * What she asked for beyond the topic (issue #113); the button hands both to
     * `POST /practice/topic`. Absent in older records, hence the defaults.
     */
    difficulty: DifficultyWish.nullable().default(null),
    direction: VocabDirection.nullable().default(null),
    vocabulary: VocabularyRequest.nullable().optional(),
    preparation_failed: z.boolean().optional(),
    /**
     * test only: the time limit she asked for (issue #241), one of `TEST_MINUTES`. Null — and
     * absent in older records — means no clock: a timer is never there without her wish.
     */
    minutes: TestMinutes.nullable().default(null),
    /**
     * practice / test: the kinds of picture she asked it to show (#724), in her words, checked by
     * code; the button hands them to `POST /practice/topic`. Absent or empty means none asked
     * for: the run's own choice decides.
     */
    figures: z.array(ModelFigureType).max(3).optional(),
    /**
     * Whether its button can still start anything (issue #196). False once preparing this
     * offer was refused as unusable — the app then shows the quiet line instead of a button
     * she would tap and wait on for nothing. Decided by the preparation, never by the model;
     * true until something proves otherwise (CLAUDE.md rule 5), hence the default for every
     * record written before this existed.
     */
    startable: z.boolean().default(true),
    /**
     * The run this offer started, once she finished it (issue #630): the card then reads as
     * finished and opens its result instead of "Los geht's". Decorated when the thread is
     * served, from the session itself (CLAUDE.md rule 5); null while nothing was finished, and
     * from an older server.
     */
    finished_session_id: Uuid.nullable().default(null),
    /**
     * The run this offer started that is still open (issue #846): the bar on top then says
     * "Weitermachen" for it, and the card leaves that one control to the bar. Decorated like
     * `finished_session_id`; null while none runs.
     */
    running_session_id: Uuid.nullable().default(null),
    /**
     * Whether the run this offer prepared shows a picture (issue #842), for an offer with a
     * picture wish: read from its questions when the thread is served, never from Buddy's words —
     * he promised "Abbildungen" for a run that held none. Null while nothing is prepared, and
     * for an offer without a wish.
     */
    pictures_shown: z.boolean().nullable().default(null),
  }),
  /**
   * Buddy offers a Kopfrechnen round (issue #243): one range from a closed list, and for the
   * times tables which rows. Code writes every task (`POST /practice/drills`); nothing here is
   * a task, a key or a text the model wrote — `title` is the server's own name for the range,
   * in her language.
   */
  z.object({
    tool: z.literal('offer_drill'),
    range: DrillRange,
    rows: z.array(DrillRow).nullable().default(null),
    carry: DrillCarry.nullable().default(null),
    title: z.string(),
    /**
     * The round this offer started, once it ended (issue #643, as `offer_learning` since #630):
     * the card reads as done and opens it, instead of a "Los geht's" that opened an ended round.
     * Decorated when the thread is served; null while none ended, and from an older server.
     */
    finished_session_id: Uuid.nullable().default(null),
    running_session_id: Uuid.nullable().optional(),
  }),
  /**
   * A roleplay started in the conversation (issue #244): the role card she plays to. Scene,
   * role and the key points are in her app language; the roleplay itself is in `language`.
   * `status` is where it stands NOW (decorated when the thread is served), so the card offers
   * "end" only while it runs.
   */
  z.object({
    tool: z.literal('start_roleplay'),
    roleplay_id: Uuid,
    language: RoleplayLanguage,
    scene: z.string(),
    role: z.string(),
    points: z.array(z.string()),
    status: z.enum(['active', 'ended']).default('active'),
    /**
     * Why it ended, decorated like `status` (#599): after `turns` and `her` Buddy's feedback stands
     * in the conversation; after `concern` and `lapsed` there is none. null while it runs.
     */
    ended_reason: z.enum(['turns', 'her', 'concern', 'lapsed']).nullable().default(null),
  }),
  /**
   * A talk planned as a goal with its steps (issue #264): the day of the talk and one step per
   * stage, each on a day the server resolved. The card lists them; undo drops the whole plan.
   */
  z.object({
    tool: z.literal('plan_talk'),
    goal_id: Uuid,
    title: z.string(),
    format: TalkFormat,
    due_date: LocalDate,
    /** The length she was asked for, in minutes; null when she did not say. */
    minutes: z.number().int().nullable(),
    steps: z.array(z.object({ stage: TalkStage, date: LocalDate })).max(5),
  }),
  /**
   * Buddy offers a rehearsal talk or reading a text aloud (issue #264): a card in the conversation
   * that records her (`POST /buddy/rehearsals`). Nothing is recorded until she starts it.
   */
  z.object({
    tool: z.literal('offer_rehearsal'),
    kind: RehearsalKind,
    /** The talk's title, or the first words of the passage to read. */
    title: z.string(),
    /** Reading aloud: the passage itself, exactly as her reading is compared with it. */
    text: z.string().nullable(),
    /** A talk: the length she was asked for, in minutes, when known. */
    minutes: z.number().int().nullable(),
    goal_id: Uuid.nullable(),
  }),
  /**
   * Practice Buddy prepared that already waits for her, shown again under his answer (issue
   * #630): his words point to it, and this card is the button they mean. `ready` is where the
   * step stands NOW (decorated when the thread is served): false once it was started, done or
   * replaced — then the card no longer offers a start that is not there.
   */
  z.object({
    tool: z.literal('show_ready'),
    step_id: Uuid,
    title: z.string(),
    question_count: z.number().int(),
    est_minutes: z.number().int(),
    ready: z.boolean().default(true),
    outcome: PracticeOutcome.nullable().default(null),
  }),
] as const;

// ─────────────── on a message ───────────────

/**
 * Her message for a sheet she sent through the chat (issue #632): the material it is, never the
 * image — the app shows the page from its own copy on the phone while it keeps one. `stage` is
 * where that sheet stands now, from its row (CLAUDE.md rule 5): waiting for the reader, being
 * read, read while Buddy makes practice from it, ready, not read (`failed`), or deleted since.
 * Null where nothing alive says what happens to it — then the line says nothing.
 */
export const SheetMessage = z.object({
  material_id: Uuid,
  pages: z.number().int().min(1),
  stage: z
    .enum(['waiting', 'reading', 'building', 'ready', 'failed', 'deleted'])
    .nullable()
    .catch(null),
});
export type SheetMessage = z.infer<typeof SheetMessage>;

/**
 * The practice one of Buddy's messages from the background announces ("dein Blatt ist bereit"),
 * while it still waits for her (issue #632): its start stands under the words that announce it.
 */
export const AnnouncedPractice = z.object({
  step_id: Uuid,
  title: z.string(),
  question_count: z.number().int(),
  est_minutes: z.number().int(),
  outcome: PracticeOutcome.nullable().default(null),
});
export type AnnouncedPractice = z.infer<typeof AnnouncedPractice>;

// ─────────────── on the home ───────────────

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
    /** Result facts; optional for homes from older servers. */
    pass: z.enum(['cards', 'drill']).nullable().optional(),
    ran_out: z.boolean().optional(),
    total: z.number().int().nonnegative().optional(),
    title: z.string().nullable().optional(),
    drill_summary: DrillLine.nullable().optional(),
    /** help: homework — solved by herself, no hit rate (docs/UX-PRINCIPLES.md). */
    mode: z.enum(['practice', 'test', 'help']).default('practice'),
    result: PracticeSummary,
    /**
     * When she finished it (issue #630): the result stands in the conversation at that moment,
     * never under what was said after it, and a greeting names it only when nothing was said
     * since. Absent from an older server: then no greeting claims it as just done.
     */
    finished_at: IsoDateTime.optional(),
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

// ─────────────── the app's conversation and home ───────────────

const learning = buddyContracts({
  actions: LEARNING_ACTIONS,
  message: {
    /**
     * Buddy's closing message after a roleplay with feedback (issue #384): the feedback itself,
     * shown as the result card in place of `text` (which stays for reading aloud and copying).
     * Null on every other message, and from an older server.
     */
    roleplay_feedback: RoleplayFeedback.nullable().catch(null),
    /**
     * Buddy's message after a rehearsal talk or a read-aloud (issue #264): what code measured,
     * shown as the result card. Absent on every other message, and from an older server.
     */
    rehearsal: RehearsalView.nullable().optional().catch(null),
    /** Her sheet sent through the chat (issue #632); absent on every other message. */
    sheet: SheetMessage.nullable().optional().catch(null),
    /** The waiting practice a background message announces (issue #632); absent otherwise. */
    announces: AnnouncedPractice.nullable().optional().catch(null),
  },
  home: {
    now: NowCard.nullable().catch(null),
    notice: HomeNotice.nullable().catch(null),
    /**
     * Buddy is working on something the learner is waiting for right now: what to do with the
     * photos they just sent ('material') or the practice they just finished ('session'). The app
     * says so only for 'material'; 'session' keeps it following the home closely, unannounced,
     * since that look may rightly end in nothing (issue #845).
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
    /**
     * The roleplay running right now (issue #244), or null. Conversation mode listens and reads
     * aloud in its language while it runs.
     */
    roleplay: RoleplayNow.nullable().catch(null),
  },
});

export const ActionSummary = learning.ActionSummary;
export type ActionSummary = z.infer<typeof ActionSummary>;
export const ActionView = learning.ActionView;
export type ActionView = z.infer<typeof ActionView>;
export const MessageView = learning.MessageView;
export type MessageView = z.infer<typeof MessageView>;
export const BuddyHome = learning.BuddyHome;
export type BuddyHome = z.infer<typeof BuddyHome>;

/** How long an offer is waited for while its run is prepared (#859/#913). */
const PREPARING_MS = 2 * 60_000;

type PolledMessage = {
  status: string;
  created_at?: string;
  actions?: ReadonlyArray<{ summary: ActionSummary }>;
};

/** An offer whose prepared run or refusal has not arrived yet (#913). */
function preparing(m: PolledMessage, now: Date): boolean {
  if (!m.created_at || now.getTime() - Date.parse(m.created_at) > PREPARING_MS) return false;
  return (m.actions ?? []).some(
    ({ summary: s }) =>
      s.tool === 'offer_learning' &&
      s.running_session_id === null &&
      s.finished_session_id === null &&
      s.startable !== false,
  );
}

/**
 * How soon a home with this state should be asked again (#671, #686): a sheet being read every
 * 1.5 s, Buddy at work or a turn in flight every 3 s, otherwise null (nothing in progress). One
 * rule for the server that sends it and the app that falls back on it. With `now` (the server):
 * also every 3 s for two minutes while an offer's run is prepared in the background, so its card's
 * outcome arrives without her tap, including a refusal without a picture wish (#859/#913).
 */
export function pollAfterMs(
  home: Pick<BuddyHome, 'now' | 'working'> & { thread: ReadonlyArray<PolledMessage> },
  now?: Date,
): number | null {
  if (home.now?.type === 'material_processing') return 1500;
  if (home.working !== null || home.thread.some((m) => m.status === 'processing')) return 3000;
  if (now && home.thread.some((m) => preparing(m, now))) return 3000;
  return null;
}
export const SendMessageResponse = learning.SendMessageResponse;
export type SendMessageResponse = z.infer<typeof SendMessageResponse>;

/** POST /buddy/roleplays/:id/end — her tap on "end"; the feedback stands in the thread of `home`. */
export const EndRoleplayResponse = z.object({ home: BuddyHome });
export type EndRoleplayResponse = z.infer<typeof EndRoleplayResponse>;

/** A rehearsal measured (issue #264): the result, and the thread with Buddy's message about it. */
export const RehearseResponse = z.object({ rehearsal: RehearsalView, home: BuddyHome });
export type RehearseResponse = z.infer<typeof RehearseResponse>;

export const StartStepResponse = z.object({
  session_id: Uuid,
  /** The started session itself, so the first question shows without another request. */
  session: SessionView.optional(),
});
export type StartStepResponse = z.infer<typeof StartStepResponse>;
