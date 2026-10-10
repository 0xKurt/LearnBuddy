// The one seam through which a domain adds its part to what Buddy knows, says and shows (issue
// #107, cut 5; docs/buddy-kit.md §Modulgrenzen). The core reads its own tables and renders its own
// sections: settings, memories, goals and steps, the conversation, contact. Everything a domain owns
// — its rows in Buddy's state, its STATE sections and prompt rules, its cards on the home screen,
// its hooks in a turn, its look-backs — comes from the provider it registers at start-up
// (LearnBuddy: modules/learning/register.ts). The core never names the domain's modules or tables;
// `pnpm guards` counts both (boundaries.mjs, domain-sql.mjs).
//
// The types a domain adds to the state (its rows, its aliases, its totals, its undo kinds) it
// declares by augmenting the empty interfaces in state.ts, context.ts and toolKit.ts — so the core
// compiles without any domain, and each part names its own fields.

import type { ActionSummary, BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import type { Aliases, DomainAliases, LearnerFacts } from './context.js';
import type { LookBackCandidate, LookBackFocus } from './lookback.js';
import type { BuddyState, DomainState, DomainTotals, GoalRow, StepRow } from './state.js';
import type { DomainUndo } from './toolKit.js';
import type { ClaimedMessage, TurnLearner, TurnOutcome } from './turn.js';

// ─────────────── state and STATE ───────────────

/** One section of STATE a domain renders, where it stands, and the strings it shows (#168). */
export type SectionSpec = {
  name: string;
  /** Before or after "Goals and plan" in the cache order (context.ts). */
  place: 'before_goals' | 'after_goals';
  /** Whether a model answer can quote it (blocks.ts). */
  quotable: boolean;
  /** The row data it renders (blocks.ts `blockData`). */
  data(state: BuddyState): string[];
};

/** What a domain renders into one STATE, given the aliases the core has numbered so far. */
export type StateRender = {
  /** After a goal's title: its subject, say. */
  goalSuffix(g: GoalRow): string;
  /** Lines under a goal: before its topics, and after them. */
  goalLines(g: GoalRow): { before: string[]; after: string[] };
  /** After a step's line: what it holds. */
  stepExtra(st: StepRow): string;
  /** Its sections' lines by name; rendered after the goals and steps have their aliases. */
  sections(): Record<string, string[]>;
};

type StateContext = {
  /** Its part of Buddy's state, read with the caller's connection (and snapshot). */
  load(db: Db, learnerId: string, now: Date): Promise<DomainState & { totals: DomainTotals }>;
  /** How her level reads in the Learner section. */
  level(learner: LearnerFacts, today: string): string;
  /** Its aliases, empty: a scene without tools resolves none. */
  noAliases(): DomainAliases;
  /** Alias prefixes a topic key may hold that name its rows, and which of its alias maps. */
  topicKeyAliases: Readonly<Record<string, keyof DomainAliases>>;
  /** Its sections, in cache order. */
  sections: readonly SectionSpec[];
  /** Starts one STATE: it numbers its aliases into `aliases` as it renders. */
  render(
    state: BuddyState,
    aliases: Aliases,
    at: { timezone: string; locale: string },
  ): StateRender;
  /** Its rules for the model, between the core's tool rules and the lookups (prompts.ts). */
  turnRules: string;
};

/** The categories a goal may belong to (a school subject, say): goals keep only the id. */
type Subjects = {
  names(db: Db, learnerId: string, ids: readonly string[]): Promise<Map<string, string>>;
  findOrCreate(
    db: Db,
    learnerId: string,
    name: string,
    kind: string,
  ): Promise<{ id: string; name: string; created: boolean }>;
};

// ─────────────── the home screen ───────────────

/** The parts of the home screen the core builds itself; the rest is the domain's. */
export type CoreHomeKey =
  | 'learner'
  | 'decision'
  | 'done'
  | 'next'
  | 'thread'
  | 'thread_has_more'
  | 'system'
  | 'context_version';

/** One page of the conversation, as the core read it, for the domain to dress. */
export type ThreadPage = {
  messages: ReadonlyArray<{ id: string; roleplay_id: string | null; rehearsal_id: string | null }>;
  actions: ReadonlyArray<{ id: string; result: ActionSummary; cannot_start_at: Date | null }>;
};

/** The fields of a message in the conversation the core fills itself; the rest is the domain's. */
type CoreMessageKey =
  | 'id'
  | 'role'
  | 'text'
  | 'status'
  | 'failure_code'
  | 'client_message_id'
  | 'options'
  | 'reply_to_id'
  | 'outreach'
  | 'actions'
  | 'created_at';

type ThreadDress = {
  /** An action's card as it stands now (its button may no longer start anything). */
  summary(actionId: string, s: ActionSummary): ActionSummary;
  /** What a message carries beyond the core's fields. */
  message(m: ThreadPage['messages'][number]): Omit<MessageView, CoreMessageKey>;
};

type Home = {
  /** Its parts of the screen, read in the screen's snapshot. */
  screen(
    deps: Deps,
    learnerId: string,
    state: BuddyState,
    today: string,
    now: Date,
  ): Promise<Omit<BuddyHome, CoreHomeKey>>;
  /** When she last did something of the domain's (sent a photo, started a practice). */
  lastActed(db: Db, learnerId: string): Promise<Date | null>;
  thread(db: Db, learnerId: string, page: ThreadPage, now: Date): Promise<ThreadDress>;
};

// ─────────────── a turn ───────────────

/** What one in-mode turn came to (turn.ts). */
export type ModeRound =
  | { kind: 'outcome'; outcome: TurnOutcome }
  | { kind: 'repair'; errors: string[] }
  | { kind: 'stale' };

/** A mode her message is answered in instead of an ordinary turn (a roleplay, say). */
export type TurnMode = (
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  at: {
    contextVersion: number;
    attempt: number;
    repairErrors: string[] | null;
    now: Date;
    timezone: string;
  },
) => Promise<ModeRound>;

type TurnHooks = {
  /** The mode running for her right now, or null. */
  mode(db: Db, learnerId: string, now: Date): Promise<TurnMode | null>;
  /** What her words point at, read before the model starts (null: nothing). */
  lookAhead(deps: Deps, learnerId: string, timezone: string, words: string): Promise<string | null>;
  /** Why a reply may not go out as written (empty: it may). */
  checkReply(
    deps: Deps,
    learnerId: string,
    reply: string,
    learnerWords: readonly string[],
  ): Promise<string[]>;
  /** After a decision was applied: work it starts in the background. */
  applied(
    deps: Deps,
    learnerId: string,
    actions: ReadonlyArray<{ id: string; summary: ActionSummary }>,
  ): void;
  /** A held-back message ends what runs in its mode, in the same transaction. */
  concern(tx: Db, learnerId: string, now: Date): Promise<void>;
};

// ─────────────── the provider ───────────────

export type ContextProvider = {
  state: StateContext;
  subjects: Subjects;
  home: Home;
  turn: TurnHooks;
  /** A topic that sits now and was shaky some days ago, as candidate for a look back. */
  lookBack(
    db: Db,
    learnerId: string,
    now: Date,
    focus: LookBackFocus,
  ): Promise<LookBackCandidate | null>;
  /** A sheet that was just read, for the fixed message when no model can answer. */
  readySheet(
    db: Db,
    learnerId: string,
    id: string,
  ): Promise<{
    title: string | null;
    goalId: string | null;
    subjectId: string | null;
    questions: number;
  } | null>;
  /** Its undo kinds: whether one still applies, and applying it. */
  undo: {
    applies(db: Db, learnerId: string, undo: DomainUndo): Promise<boolean>;
    run(db: Db, learnerId: string, undo: DomainUndo): Promise<boolean>;
  };
};

let provider: ContextProvider | null = null;

export function registerContextProvider(p: ContextProvider): void {
  if (provider) throw new Error('context provider registered twice');
  provider = p;
}

/** The registered provider; a Buddy runs with exactly one (createApp checks at start-up). */
export function contextProvider(): ContextProvider {
  if (!provider)
    throw new Error(
      'No context provider registered — the domain registers one at start-up (modules/learning/register.ts)',
    );
  return provider;
}

/** Whether a domain registered its provider (the start-up check asks). */
export function hasContextProvider(): boolean {
  return provider !== null;
}
