// One conversation turn: the learner wrote something. docs/architecture.md §Turns.
//
//   1. persist the message first (idempotent on client_message_id) and bump
//      the context version — a retry or a second device never runs it twice;
//   2. build context, ask the model for a TurnDecision (JSON schema);
//   3. validate + apply atomically (apply.ts); on a stale context retry while
//      this is still the learner's latest message; on rejection give the
//      model the reasons once; otherwise fail honestly;
//   4. on failure the message stays visible with status "failed" and a
//      stable error code — nothing half-applied, nothing invented.
// Ownership of a processing turn is a claim token: after an interruption the
// scheduler (or a client retry) takes over with a new token, and the old
// runner can no longer publish or fail the turn.

import { randomUUID } from 'node:crypto';

import type { RoleplayFeedback } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { LearnerContext } from '../../http/context.js';
import { isUniqueViolation } from '../../lib/db.js';
import { isAppError } from '../../lib/errors.js';
import { localParts, weekdayName } from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import {
  safeguardingText as sharedSafeguardingText,
  type SafeguardingKind,
} from '../../i18n/safeguarding.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmMessage } from '../../llm/gateway.js';
import { homeworkSolved, mentionsSolution } from '../practice/tutor.js';
import { applyDecision, recordUnapplied, type DecisionMeta } from './apply.js';
import { preInjectedPassages } from './connectors/material.js';
import { buildContents, buildContext } from './context.js';
import { prepareOffered } from '../practice/prepare.js';
import { askedButActed, emptyReply, TurnDecision } from './registry.js';
import { recallText } from './recall.js';
import { bumpContext } from './plan.js';
import { replyProgress, type ReplyProgress } from './stream.js';
import {
  BUDDY_PROMPT_VERSION,
  TURN_SCHEMA,
  TURN_STEP_SCHEMA,
  TURN_SYSTEM,
  repairMessage,
} from './prompts.js';
import { withLookups } from './lookups.js';
import { loadBuddyState, loadSettings, type MessageRow, TURN_STALL_MS } from './state.js';
import {
  activeRoleplay,
  endForConcern,
  feedbackText,
  languageName,
  ROLEPLAY_PROMPT_VERSION,
  ROLEPLAY_SYSTEM,
  ROLEPLAY_TURN_SCHEMA,
  roleplayContents,
  roleplayFrame,
  roleplayMessages,
  RoleplayTurnForModel,
  writeFeedback,
  type RoleplayRow,
  type RoleplayStep,
} from './roleplay.js';

const MAX_ROUNDS = 4;
export { TURN_STALL_MS };

export type TurnOutcome = { status: 'done' | 'processing' | 'failed'; errorCode: string | null };

export type ClaimedMessage = { id: string; text: string; created_at: Date; claim_token: string };

type StoredMessage = {
  id: string;
  text: string;
  status: 'processing' | 'done' | 'failed';
  created_at: Date;
  claim_token: string | null;
  claimed_at: Date | null;
};

export type TurnLearner = Pick<
  LearnerContext,
  'id' | 'display_name' | 'birth_date' | 'level' | 'grade' | 'locale' | 'isMinor'
>;

/**
 * Buddy's reply while it is being written: `round` counts the model calls of this
 * turn (a lookup or a repair starts a new one, whose reply replaces the last).
 */
export type OnReply = (round: number, progress: ReplyProgress) => void;

/** Entry point for POST /buddy/messages. */
export async function receiveLearnerMessage(
  deps: Deps,
  learner: TurnLearner,
  input: { clientMessageId: string; text: string; replyToId: string | null },
  onReply?: OnReply,
): Promise<TurnOutcome> {
  const now = deps.now();
  const token = randomUUID();
  let message: ClaimedMessage;
  try {
    message = await deps.db.tx(async (tx) => {
      const row = await tx.one<{ id: string; text: string; created_at: Date }>(
        `insert into buddy_messages (learner_id, role, text, client_message_id, status, reply_to_id,
                                     claim_token, claimed_at, created_at)
         values ($1, 'learner', $2, $3, 'processing',
                 -- Only one of her own messages; anything else is not stored (and no
                 -- foreign-key error tells whether it exists — reply-to-id-not-scoped).
                 (select id from buddy_messages where id = $4 and learner_id = $1),
                 $5, $6, $6)
         returning id, text, created_at`,
        [learner.id, input.text, input.clientMessageId, input.replyToId, token, now],
      );
      await bumpContext(tx, learner.id);
      // She is here and writing: what Buddy posted to her thread so far has been seen and
      // answered (recorded as a fact, not as a gate — nothing waits for an answer, ADR 0006).
      await tx.query(
        `update buddy_outreach o set responded_at = $2
          where o.learner_id = $1 and o.responded_at is null
            and exists (select 1 from buddy_messages m where m.outreach_id = o.id and m.created_at <= $2)`,
        [learner.id, now],
      );
      // A reply to one of Buddy's outreach messages counts as an answer to it.
      if (input.replyToId) {
        await tx.query(
          `update buddy_outreach set responded_at = coalesce(responded_at, $3)
            where learner_id = $1
              and id = (select outreach_id from buddy_messages where id = $2 and learner_id = $1)`,
          [learner.id, input.replyToId, now],
        );
      }
      return { ...row, claim_token: token };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Same client_message_id again: replay the state, never run twice.
    const existing = await deps.db.one<StoredMessage>(
      `select id, text, status, created_at, claim_token, claimed_at from buddy_messages
        where learner_id = $1 and client_message_id = $2`,
      [learner.id, input.clientMessageId],
    );
    if (existing.status === 'done') return { status: 'done', errorCode: null };
    const stalled =
      !existing.claimed_at || now.getTime() - existing.claimed_at.getTime() > TURN_STALL_MS;
    if (existing.status === 'processing' && !stalled)
      return { status: 'processing', errorCode: null };
    const claimed = await claimMessage(deps, learner.id, existing.id, existing.claim_token);
    if (!claimed) return { status: 'processing', errorCode: null };
    message = claimed;
  }
  return processTurn(deps, learner, message, onReply);
}

/**
 * Take over a failed or interrupted turn. Compare-and-set on the previous
 * token, so exactly one caller wins.
 */
export async function claimMessage(
  deps: Deps,
  learnerId: string,
  messageId: string,
  previousToken: string | null,
): Promise<ClaimedMessage | null> {
  const token = randomUUID();
  return deps.db.maybeOne<ClaimedMessage>(
    `update buddy_messages set status = 'processing', claim_token = $3, claimed_at = $4, failure_code = null
      where id = $1 and learner_id = $2 and role = 'learner' and status <> 'done'
        and claim_token is not distinct from $5
      returning id, text, created_at, claim_token`,
    [messageId, learnerId, token, deps.now(), previousToken],
  );
}

/** Stable codes for why a turn failed: stored on the message, sent to the app. */
const FAILURE_CODE: Record<string, string> = {
  model_unavailable: 'model_unavailable',
  budget_exhausted: 'budget',
  model_invalid: 'invalid',
  stale: 'stale',
};

/**
 * Runs the decision loop for one claimed learner message. Whatever goes wrong — the model,
 * the database, a bug — ends with the message marked failed and a stable code, never
 * "processing" forever (audit M-46).
 */
export async function processTurn(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  onReply?: OnReply,
): Promise<TurnOutcome> {
  const ahead = passagesAhead(deps, learner.id, message.text);
  try {
    return await decideTurn(deps, learner, message, ahead, onReply);
  } catch (err) {
    return failTurn(deps, message, isAppError(err) ? err.code : 'internal');
  } finally {
    // No work of a turn outlives it — also when it never used the look-ahead (superseded).
    await ahead;
  }
}

/**
 * The passages her message points at, looked up the moment the turn begins (issue #447): her
 * words are known before her state is, and the embedding behind the lookup is the longest wait
 * before the model starts (0.17–0.40 s in production). It used to start only after the ~20 reads
 * of her state; now they run side by side. Not during a roleplay — her line is not a question
 * about her sheets. Undefined when not looked up; it never fails the turn.
 */
function passagesAhead(
  deps: Deps,
  learnerId: string,
  text: string,
): Promise<string | null | undefined> {
  const now = deps.now();
  return Promise.all([loadSettings(deps.db, learnerId), activeRoleplay(deps.db, learnerId, now)])
    .then(([settings, play]) =>
      play ? undefined : preInjectedPassages(deps, learnerId, settings.timezone, text),
    )
    .catch(() => undefined);
}

async function decideTurn(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  ahead: Promise<string | null | undefined>,
  onReply?: OnReply,
): Promise<TurnOutcome> {
  let repairErrors: string[] | null = null;
  /** Whether the last attempt was an in-role turn: a repair note never crosses into the other kind. */
  let lastInRole: boolean | null = null;
  let round = 0;
  // Computed once per turn (one embedding call), reused across repair/stale rounds.
  let preInjected: string | null | undefined;
  for (let attempt = 1; attempt <= MAX_ROUNDS; attempt++) {
    const now = deps.now();
    const state = await loadBuddyState(deps.db, learner.id, now);

    // A newer learner message supersedes this one: its turn answers both. This one is
    // released (no claim), not "done": it becomes done with that answer, or failed with
    // it (superseded-message-done-without-reply).
    const latestLearner = [...state.messages].reverse().find((m) => m.role === 'learner');
    if (latestLearner && latestLearner.id !== message.id) {
      // Under the newer message's row lock: its turn cannot finish in between.
      const outcome = await deps.db.tx(async (tx) => {
        const newer = await tx.one<{ status: string; failure_code: string | null }>(
          `select status, failure_code from buddy_messages where id = $1 for update`,
          [latestLearner.id],
        );
        const next =
          newer.status === 'done'
            ? { status: 'done' as const, claim: null, failure: null }
            : newer.status === 'failed'
              ? { status: 'failed' as const, claim: null, failure: newer.failure_code }
              : { status: 'processing' as const, claim: null, failure: null };
        await tx.query(
          `update buddy_messages set status = $3, claim_token = $4, failure_code = $5
            where id = $1 and status = 'processing' and claim_token = $2`,
          [message.id, message.claim_token, next.status, next.claim, next.failure],
        );
        return next.status;
      });
      return { status: outcome, errorCode: null };
    }

    // A roleplay is running (issue #244): this message is her line in the scene, answered in
    // the role against the stored frame — not a Buddy turn with STATE and tools.
    const play = await activeRoleplay(deps.db, learner.id, now);
    if (lastInRole !== null && lastInRole !== (play !== null)) repairErrors = null;
    lastInRole = play !== null;
    if (play) {
      const step = await roleplayRound(deps, learner, message, play, {
        contextVersion: state.settings.context_version,
        attempt,
        repairErrors,
        now,
        timezone: state.settings.timezone,
      });
      if (step.kind === 'outcome') return step.outcome;
      if (step.kind === 'repair') {
        if (repairErrors) return failTurn(deps, message, 'model_invalid');
        repairErrors = step.errors;
      }
      continue;
    }

    const tz = state.settings.timezone;
    const written = localParts(message.created_at, tz).date;
    const today = localParts(now, tz).date;
    const ctx = buildContext(learner, state, now, {
      pushAvailable: await pushAvailable(deps, learner.id),
      // Days are resolved from today, the day the model counts from (Next days); when the
      // message is older (a resend, a recovery after midnight) the model is told so.
      ...(written !== today
        ? {
            modelNote: `NOTE: the learner wrote their latest message on ${weekdayName(written)} ${written}. Today is ${today}; "today", "tomorrow" and in_days count from today. If a day they named has passed, ask.`,
          }
        : {}),
    });
    const { dialogue, learnerWords } = turnDialogue(state.messages, message.id, learner.locale);
    // Passages her words clearly point at go into the context up front, so the answer
    // does not depend on the model calling search_material (issue #26). Appended after
    // the volatile end of STATE — the cache order (context.ts) is untouched.
    // Looked up ahead when this message is all she wrote since Buddy's last answer; otherwise
    // again, with all her words.
    if (preInjected === undefined) {
      const words = learnerWords.join('\n');
      const early = words === message.text ? await ahead : undefined;
      preInjected =
        early !== undefined
          ? early
          : learnerWords.length > 0
            ? await preInjectedPassages(deps, learner.id, tz, words)
            : null;
    }
    const contents: LlmMessage[] = buildContents(
      preInjected ? `${ctx.state}\n\n${preInjected}` : ctx.state,
      dialogue,
      repairErrors ? repairMessage(repairErrors) : undefined,
    );
    const { meta, record } = turnRecord(deps, learner.id, message.id, {
      contextVersion: ctx.contextVersion,
      attempt: attempt,
      promptVersion: BUDDY_PROMPT_VERSION,
      triggers: [{ message_id: message.id }],
    });

    let raw: unknown;
    try {
      const looked = await withLookups({
        ctx: { deps, learnerId: learner.id, timezone: tz, aliases: ctx.aliases },
        surface: 'turn',
        contents,
        call: async (messages, final) => {
          const thisRound = ++round;
          // Still working: a turn of several model calls must not look stalled and be taken
          // over while it runs (turn-cost-and-stall-window).
          const mine = await deps.db.query(
            `update buddy_messages set claimed_at = $3
              where id = $1 and claim_token = $2 and status = 'processing' returning id`,
            [message.id, message.claim_token, deps.now()],
          );
          // Stopped by her, or taken over: no further model call for a turn that is not ours.
          if (mine.length === 0) throw new ClaimLost();
          let last = '';
          const result = await callModel(deps, learner.id, today, {
            purpose: 'buddy_turn',
            tier: 'smart',
            promptVersion: BUDDY_PROMPT_VERSION,
            system: TURN_SYSTEM,
            contents: messages,
            schema: final ? TURN_SCHEMA : TURN_STEP_SCHEMA,
            maxOutputTokens: 2048,
            temperature: 0.4,
            timeoutMs: 30_000,
            thinkingBudget: 512,
            ...(onReply
              ? {
                  onPartial: (raw: string) => {
                    const p = replyProgress(raw);
                    if (!p) return;
                    const key = `${p.text}|${p.speakable}|${p.done}`;
                    if (key === last) return;
                    last = key;
                    onReply(thisRound, p);
                  },
                }
              : {}),
          });
          meta.model = result.usage.model;
          return result.json;
        },
      });
      raw = looked.raw;
      // The audit keeps what was looked up (tools and whether they worked), not the results.
      if (looked.steps.length > 0) meta.output = { lookups: looked.steps, final: raw };
    } catch (err) {
      if (err instanceof ClaimLost) return currentOutcome(deps, message.id);
      if (err instanceof LlmError && err.kind === 'blocked') {
        // The provider's safety filter held back her words or Buddy's answer. That is not
        // a glitch to resend: code answers with a fixed, caring reply (D-10), and her
        // message is never sent to the model again (audit H-31, H-32).
        await record('failed', [err.finishReason ? `blocked:${err.finishReason}` : 'blocked']);
        return answerWithSafeguarding(deps, learner, message, 'blocked');
      }
      const code = isAppError(err)
        ? err.code
        : err instanceof LlmError
          ? err.kind === 'invalid_output'
            ? 'model_invalid'
            : 'model_unavailable'
          : 'internal';
      await record('failed', [code]);
      return failTurn(deps, message, code);
    }
    if (meta.output === undefined) meta.output = raw;

    const parsed = TurnDecision.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join('.')}: ${i.message}`);
      await record('rejected', errors);
      if (repairErrors) return failTurn(deps, message, 'model_invalid');
      repairErrors = errors;
      continue;
    }
    const contradictions = [...askedButActed(parsed.data), ...emptyReply(parsed.data)];
    if (contradictions.length > 0) {
      await record('rejected', contradictions);
      if (repairErrors) return failTurn(deps, message, 'model_invalid');
      repairErrors = contradictions;
      continue;
    }
    // "Never the homework solution" is enforced in code in the chat too, not only prompted
    // (audit S-6 p2-sec-homework-solution-chat-unenforced).
    const leak = parsed.data.concern
      ? []
      : await homeworkLeak(deps, learner.id, parsed.data.reply, learnerWords);
    if (leak.length > 0) {
      await record('rejected', leak);
      if (repairErrors) return failTurn(deps, message, 'model_invalid');
      repairErrors = leak;
      continue;
    }
    // Distress: the words she gets are fixed by code, not improvised (D-10, audit H-31).
    const reply = parsed.data.concern
      ? { text: concernText(learner, parsed.data.also_asked), options: null }
      : { text: parsed.data.reply, options: parsed.data.options };

    const result = await applyDecision(deps.db, {
      learnerId: learner.id,
      locale: learner.locale,
      contextVersion: ctx.contextVersion,
      aliases: ctx.aliases,
      now,
      // The day the model counted from (audit M-51): not the day the message was written.
      reference: now,
      learnerWords,
      concern: parsed.data.concern,
      triggerMessageId: message.id,
      messageClaim: { id: message.id, token: message.claim_token },
      actions: parsed.data.actions,
      reply,
      outreach: null,
      meta,
    });
    if (result.status === 'applied') {
      // What Buddy just offered is prepared while she reads his reply (issue #48).
      prepareOffered(deps, learner.id, result.actions);
      return { status: 'done', errorCode: null };
    }
    // Another runner took this message over (e.g. recovery after a timeout): report where it stands.
    if (result.status === 'superseded') return currentOutcome(deps, message.id);
    if (result.status === 'rejected') {
      if (repairErrors) return failTurn(deps, message, 'model_invalid');
      repairErrors = result.errors;
      continue;
    }
    // stale: something changed while the model was thinking — rebuild and ask again.
  }
  return failTurn(deps, message, 'stale');
}

type RoleplayRound =
  | { kind: 'outcome'; outcome: TurnOutcome }
  | { kind: 'repair'; errors: string[] }
  | { kind: 'stale' };

/**
 * One in-role turn of a running roleplay (issue #244). Same ownership, fence, failure codes and
 * audit as any turn — what differs is what the model sees (the stored frame and the scene's own
 * lines, `roleplay.ts`), what it may answer (a line, no tools) and what code decides from it:
 *
 *   concern            → the fixed caring reply, the roleplay ends without feedback;
 *   leave              → it ends; with turns played, the checked feedback follows;
 *   another language   → the app's own hint, the turn is not counted;
 *   otherwise          → the role's line; the turn counts, and the last allowed one ends it
 *                        with the feedback in the same transaction.
 *
 * Not streamed: whether the model's words are shown at all is decided by code after the whole
 * answer (the language hint replaces them), so nothing is shown that could be withdrawn.
 */
async function roleplayRound(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  play: RoleplayRow,
  at: {
    contextVersion: number;
    attempt: number;
    repairErrors: string[] | null;
    now: Date;
    timezone: string;
  },
): Promise<RoleplayRound> {
  const today = localParts(at.now, at.timezone).date;
  const rows = await roleplayMessages(deps.db, play);
  const { dialogue, learnerWords } = turnDialogue(rows, message.id, learner.locale);
  const { meta, record } = turnRecord(deps, learner.id, message.id, {
    contextVersion: at.contextVersion,
    attempt: at.attempt,
    promptVersion: ROLEPLAY_PROMPT_VERSION,
    triggers: [{ message_id: message.id, roleplay_id: play.id }],
  });

  let raw: unknown;
  try {
    const mine = await deps.db.query(
      `update buddy_messages set claimed_at = $3
        where id = $1 and claim_token = $2 and status = 'processing' returning id`,
      [message.id, message.claim_token, deps.now()],
    );
    if (mine.length === 0) throw new ClaimLost();
    const result = await callModel(deps, learner.id, today, {
      purpose: 'buddy_turn',
      tier: 'smart',
      promptVersion: ROLEPLAY_PROMPT_VERSION,
      system: ROLEPLAY_SYSTEM,
      contents: roleplayContents(
        roleplayFrame(play, learner),
        dialogue,
        at.repairErrors ? repairMessage(at.repairErrors) : undefined,
      ),
      schema: ROLEPLAY_TURN_SCHEMA,
      maxOutputTokens: 1024,
      temperature: 0.6,
      timeoutMs: 30_000,
      thinkingBudget: 256,
    });
    meta.model = result.usage.model;
    raw = result.json;
  } catch (err) {
    if (err instanceof ClaimLost)
      return { kind: 'outcome', outcome: await currentOutcome(deps, message.id) };
    if (err instanceof LlmError && err.kind === 'blocked') {
      await record('failed', [err.finishReason ? `blocked:${err.finishReason}` : 'blocked']);
      return {
        kind: 'outcome',
        outcome: await answerWithSafeguarding(deps, learner, message, 'blocked'),
      };
    }
    const code = turnErrorCode(err);
    await record('failed', [code]);
    return { kind: 'outcome', outcome: await failTurn(deps, message, code) };
  }
  meta.output = raw;

  const parsed = RoleplayTurnForModel.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`);
    await record('rejected', errors);
    return { kind: 'repair', errors };
  }
  const d = parsed.data;
  const inLanguage = d.her_language === play.language || d.her_language === 'other';
  if (!d.concern && !d.leave && inLanguage && d.reply.trim().length === 0) {
    const errors = ['reply: write your next line in the role (empty only for concern or leave)'];
    await record('rejected', errors);
    return { kind: 'repair', errors };
  }

  // What code makes of it. The model's own words are shown only for a counted line in the role.
  let reply: { text: string; options: null } | null;
  let step: RoleplayStep;
  const base = { id: play.id, expectTurns: play.turns, feedback: null, closing: null };
  if (d.concern) {
    reply = { text: concernText(learner, d.also_asked), options: null };
    step = { ...base, count: false, end: 'concern' };
  } else if (d.leave) {
    reply = null;
    step = { ...base, count: false, end: 'her' };
  } else if (!inLanguage) {
    reply = {
      text: t(learner.locale, 'roleplay.try_in', {
        language: languageName(play.language, learner.locale),
      }),
      options: null,
    };
    step = { ...base, count: false, end: null };
  } else {
    reply = { text: d.reply, options: null };
    step = { ...base, count: true, end: play.turns + 1 >= play.max_turns ? 'turns' : null };
  }

  if (step.end === 'her' || step.end === 'turns') {
    const played = play.turns + (step.count ? 1 : 0);
    let feedback: RoleplayFeedback | null = null;
    if (played > 0) {
      try {
        // Her words of this turn are hers to be quoted, when they were a line in the scene.
        feedback = await writeFeedback(
          deps,
          learner.id,
          today,
          play,
          learner,
          rows.filter((r) => step.count || r.id !== message.id),
          learner.locale,
          step.count ? learnerWords : [],
        );
      } catch (err) {
        const code = turnErrorCode(err);
        await record('failed', [`feedback:${code}`]);
        return { kind: 'outcome', outcome: await failTurn(deps, message, code) };
      }
    }
    step = {
      ...step,
      feedback,
      closing: feedback
        ? feedbackText(learner.locale, feedback)
        : t(learner.locale, 'roleplay.ended'),
    };
  }

  const result = await applyDecision(deps.db, {
    learnerId: learner.id,
    locale: learner.locale,
    contextVersion: at.contextVersion,
    // A scene has no tools, so it resolves no aliases.
    aliases: {
      goals: new Map(),
      steps: new Map(),
      memories: new Map(),
      subjects: new Map(),
      materials: new Map(),
    },
    now: at.now,
    reference: at.now,
    learnerWords,
    concern: d.concern,
    triggerMessageId: message.id,
    messageClaim: { id: message.id, token: message.claim_token },
    actions: [],
    reply,
    outreach: null,
    roleplay: step,
    meta,
  });
  if (result.status === 'applied')
    return { kind: 'outcome', outcome: { status: 'done', errorCode: null } };
  if (result.status === 'superseded')
    return { kind: 'outcome', outcome: await currentOutcome(deps, message.id) };
  if (result.status === 'rejected') return { kind: 'repair', errors: result.errors };
  return { kind: 'stale' };
}

function turnErrorCode(err: unknown): string {
  return isAppError(err)
    ? err.code
    : err instanceof LlmError
      ? err.kind === 'invalid_output'
        ? 'model_invalid'
        : 'model_unavailable'
      : 'internal';
}

/**
 * What the model sees of the conversation, and the learner's words this turn answers.
 *   - A message the safety filter held back is replaced by a neutral placeholder, so one
 *     block can never mute Buddy for the rest of the conversation (audit H-32).
 *   - Her unanswered run (several quick messages) all count as her words (audit M-49).
 *   - Buddy's messages posted after her message (a reminder that arrived meanwhile) are
 *     placed before her run, so the dialogue always ends with her (audit M-50).
 */
export function turnDialogue(
  messages: ReadonlyArray<
    Pick<MessageRow, 'id' | 'role' | 'text' | 'status' | 'failure_code' | 'recall_block'>
  >,
  triggerId: string,
  locale: string,
): {
  dialogue: Array<{ role: 'learner' | 'buddy'; text: string }>;
  learnerWords: string[];
} {
  // One rule for what a model may be told about a past message (modules/buddy/recall.ts,
  // issue #149). This path had its own version of it and the summariser had none, which is
  // how a blocked message reached the summary model after all.
  const shown = messages
    .map((m) => ({ ...m, text: recallText(m, locale, true) }))
    .filter((m): m is typeof m & { text: string } => m.text !== null);
  const at = shown.findIndex((m) => m.id === triggerId);
  if (at < 0) {
    return { dialogue: shown.map((m) => ({ role: m.role, text: m.text })), learnerWords: [] };
  }
  let runStart = at;
  while (runStart > 0 && shown[runStart - 1]!.role === 'learner') runStart--;
  const run = shown.slice(runStart, at + 1);
  const ordered = [...shown.slice(0, runStart), ...shown.slice(at + 1), ...run];
  return {
    dialogue: ordered.map((m) => ({ role: m.role, text: m.text })),
    learnerWords: run
      .filter((m) => m.role === 'learner' && (m.recall_block ?? null) === null)
      .map((m) => m.text),
  };
}

/**
 * While she has homework open in a help session, a chat reply that states the solution of
 * an open task is refused — unless she wrote that solution herself (then Buddy may confirm).
 */
async function homeworkLeak(
  deps: Deps,
  learnerId: string,
  reply: string,
  learnerWords: readonly string[],
): Promise<string[]> {
  const open = await deps.db.query<{
    prompt: string;
    answer: string;
    accepted_answers: string[];
    unit: string | null;
    tolerance: number | null;
  }>(
    `select i.prompt, i.answer, i.accepted_answers, i.unit, i.tolerance
       from practice_sessions ps
       join session_items si on si.session_id = ps.id and si.status = 'open'
       join items i on i.id = si.item_id
      where ps.learner_id = $1 and ps.mode = 'help' and ps.status = 'active'`,
    [learnerId],
  );
  const hers = learnerWords.join('\n');
  // Every key of the task, not only the first (#227 B7): an accepted answer given away is the
  // solution given away.
  return open.some(
    (i) =>
      !homeworkSolved(i, hers) &&
      [i.answer, ...i.accepted_answers].some((k) => mentionsSolution(reply, k, i.prompt)),
  )
    ? [
        'reply: it gives away the solution of her open homework task. Help her find it herself (a question, a first step) — never the result.',
      ]
    : [];
}

function safeguardingText(learner: TurnLearner, kind: SafeguardingKind): string {
  return sharedSafeguardingText(learner.locale, learner.isMinor, kind);
}

/**
 * The fixed answer to a disclosure — and, when that same message also carried a question
 * about learning (`also_asked`), one further fixed sentence saying it is not forgotten
 * (issue #110). A child rarely says only one thing: in `life-090` the abuse is the *reason*
 * why she wants to pass the test, and replacing her whole message with the helpline alone
 * lets her question disappear without a sign that Buddy even read it.
 *
 * Both sentences are code's own words, per language and age (i18n `safeguarding.*`): the
 * model's text is never shown. The added sentence promises nothing beyond "not forgotten" —
 * the request is not carried out here, and nothing of the message is remembered (the memory
 * tools are refused in this turn, `refuseDuringConcern` in tools.ts). The helpline text
 * itself is untouched; it is the reason this path holds.
 */
function concernText(learner: TurnLearner, alsoAsked: boolean): string {
  const fixed = safeguardingText(learner, 'concern');
  return alsoAsked ? `${fixed} ${safeguardingText(learner, 'also_asked')}` : fixed;
}

/**
 * The safety filter held back the turn: Buddy answers with the fixed reply for the
 * learner's language and age, her message is answered (no "send again") and marked so
 * it is never sent to the model again. Depends on nothing Buddy decided, so no fence.
 */
async function answerWithSafeguarding(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  kind: 'blocked',
): Promise<TurnOutcome> {
  const now = deps.now();
  const answered = await deps.db.tx(async (tx) => {
    // Lock order: the learner's settings row first, like every fenced write (docs §Turns).
    await tx.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learner.id]);
    const owned = await tx.query(
      `update buddy_messages set status = 'done', failure_code = 'blocked', recall_block = 'blocked'
        where id = $1 and status = 'processing' and claim_token = $2 returning id`,
      [message.id, message.claim_token],
    );
    if (owned.length !== 1) return false;
    await tx.query(
      `insert into buddy_messages (learner_id, role, text, reply_to_id, created_at)
       values ($1, 'buddy', $2, $3, $4)`,
      [learner.id, safeguardingText(learner, kind), message.id, now],
    );
    // A scene does not go on over a held-back message (issue #244): it ends, without feedback.
    await endForConcern(tx, learner.id, now);
    await bumpContext(tx, learner.id);
    return true;
  });
  return answered ? { status: 'done', errorCode: null } : currentOutcome(deps, message.id);
}

async function failTurn(deps: Deps, message: ClaimedMessage, code: string): Promise<TurnOutcome> {
  // Only the current owner may mark it failed — together with the earlier messages it
  // superseded (released, waiting for this answer).
  const rows = await deps.db.tx(async (tx) => {
    const mine = await tx.query(
      `update buddy_messages set status = 'failed', failure_code = $3
        where id = $1 and status = 'processing' and claim_token = $2 returning id`,
      [message.id, message.claim_token, FAILURE_CODE[code] ?? 'internal'],
    );
    if (mine.length === 1)
      await tx.query(
        `update buddy_messages b set status = 'failed', failure_code = $2
           from buddy_messages me
          where me.id = $1 and b.learner_id = me.learner_id and b.role = 'learner'
            and b.status = 'processing' and b.claim_token is null and b.seq < me.seq`,
        [message.id, FAILURE_CODE[code] ?? 'internal'],
      );
    return mine;
  });
  return rows.length === 1
    ? { status: 'failed', errorCode: code }
    : currentOutcome(deps, message.id);
}

/** The turn is no longer this runner's (stopped, or taken over): it ends without a word. */
class ClaimLost extends Error {}

/**
 * She stopped Buddy's reply (POST /buddy/messages/:id/stop). Her message and the unanswered
 * ones before it that wait for the same answer become "stopped": nothing of the reply is
 * stored, and the running turn can no longer apply its answer (its claim is gone; apply.ts
 * checks it under the same row lock). A turn that already finished stays as it is — then the
 * reply is there, and that is what she sees. Null: no such message (yet).
 */
export async function stopTurn(
  deps: Deps,
  learnerId: string,
  clientMessageId: string,
): Promise<TurnOutcome | null> {
  return deps.db.tx(async (tx) => {
    // Lock order: the learner's settings row first, like every fenced write (docs §Turns).
    await tx.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learnerId]);
    const msg = await tx.maybeOne<{
      id: string;
      status: TurnOutcome['status'];
      failure_code: string | null;
    }>(
      `select id, status, failure_code from buddy_messages
        where learner_id = $1 and client_message_id = $2 and role = 'learner' for update`,
      [learnerId, clientMessageId],
    );
    if (!msg) return null;
    if (msg.status !== 'processing') return { status: msg.status, errorCode: msg.failure_code };
    await tx.query(
      `update buddy_messages b set status = 'failed', failure_code = 'stopped', claim_token = null
         from buddy_messages me
        where me.id = $1 and b.learner_id = me.learner_id and b.role = 'learner'
          and b.status = 'processing' and (b.id = me.id or (b.claim_token is null and b.seq < me.seq))`,
      [msg.id],
    );
    // What Buddy's next decision sees has changed (her message is no longer waiting).
    await bumpContext(tx, learnerId);
    return { status: 'failed', errorCode: 'stopped' };
  });
}

async function currentOutcome(deps: Deps, messageId: string): Promise<TurnOutcome> {
  const row = await deps.db.one<{ status: TurnOutcome['status'] }>(
    `select status from buddy_messages where id = $1`,
    [messageId],
  );
  return { status: row.status, errorCode: null };
}

export async function pushAvailable(deps: Deps, learnerId: string): Promise<boolean> {
  if (!deps.push.enabled) return false;
  const row = await deps.db.maybeOne(
    `select 1 from push_tokens where learner_id = $1 and status = 'active' limit 1`,
    [learnerId],
  );
  return row !== null;
}

/**
 * A turn decision's record, filled in while the call runs, and how it is kept when it is not
 * applied (failed or rejected) — the same for an ordinary turn and an in-role one (#244).
 */
function turnRecord(
  deps: Deps,
  learnerId: string,
  messageId: string,
  at: {
    contextVersion: number;
    attempt: number;
    promptVersion: string;
    triggers: DecisionMeta['triggers'];
  },
) {
  const meta = {
    mode: 'turn' as const,
    attempt: at.attempt,
    model: null as string | null,
    promptVersion: at.promptVersion,
    output: undefined as unknown,
    triggers: at.triggers,
    reason: null,
    topicKey: null,
  };
  const record = (disposition: 'failed' | 'rejected', errors: string[]) =>
    recordUnapplied(
      deps.db,
      {
        learnerId,
        triggerMessageId: messageId,
        contextVersion: at.contextVersion,
        meta,
        now: deps.now(),
      },
      disposition,
      errors,
    );
  return { meta, record };
}
