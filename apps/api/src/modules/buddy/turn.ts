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

import { z } from 'zod';

import type { Deps } from '../../deps.js';
import type { LearnerContext } from '../../http/context.js';
import { isUniqueViolation } from '../../lib/db.js';
import { isAppError } from '../../lib/errors.js';
import { localParts, weekdayName } from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmMessage } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { homeworkSolved, mentionsSolution } from '../practice/tutor.js';
import { applyDecision, recordUnapplied } from './apply.js';
import { buildContents, buildContext } from './context.js';
import { askedButActed, TurnDecision, TurnDecisionForModel } from './registry.js';
import { bumpContext } from './plan.js';
import { replyProgress, type ReplyProgress } from './stream.js';
import { BUDDY_PROMPT_VERSION, TURN_SYSTEM, repairMessage } from './prompts.js';
import { lookupsField, withLookups } from './lookups.js';
import { loadBuddyState, type MessageRow, TURN_STALL_MS } from './state.js';

const TURN_SCHEMA = toJsonSchema(TurnDecisionForModel);
/** A step that may still ask for lookups first (ADR 0005 §The agent loop). */
const TURN_STEP_SCHEMA = toJsonSchema(
  z.object({ lookups: lookupsField }).extend(TurnDecisionForModel.shape),
);
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
      // answered, so the "previous message unanswered" gate does not hold back the next idea
      // because of an in-app message she simply chatted past (D-12 counts those).
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
  try {
    return await decideTurn(deps, learner, message, onReply);
  } catch (err) {
    return failTurn(deps, message, isAppError(err) ? err.code : 'internal');
  }
}

async function decideTurn(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
  onReply?: OnReply,
): Promise<TurnOutcome> {
  let repairErrors: string[] | null = null;
  let round = 0;
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
    const contents: LlmMessage[] = buildContents(
      ctx.state,
      dialogue,
      repairErrors ? repairMessage(repairErrors) : undefined,
    );
    const meta = {
      mode: 'turn' as const,
      attempt,
      model: null as string | null,
      promptVersion: BUDDY_PROMPT_VERSION,
      output: undefined as unknown,
      triggers: [{ message_id: message.id }],
      reason: null,
      topicKey: null,
    };
    const record = (disposition: 'failed' | 'rejected', errors: string[]) =>
      recordUnapplied(
        deps.db,
        {
          learnerId: learner.id,
          triggerMessageId: message.id,
          contextVersion: ctx.contextVersion,
          meta,
          now: deps.now(),
        },
        disposition,
        errors,
      );

    let raw: unknown;
    try {
      const looked = await withLookups({
        ctx: { deps, learnerId: learner.id, timezone: tz },
        surface: 'turn',
        contents,
        call: async (messages, final) => {
          const thisRound = ++round;
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
    const contradictions = askedButActed(parsed.data);
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
      ? { text: safeguardingText(learner, 'concern'), options: null }
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
    if (result.status === 'applied') return { status: 'done', errorCode: null };
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

/**
 * What the model sees of the conversation, and the learner's words this turn answers.
 *   - A message the safety filter held back is replaced by a neutral placeholder, so one
 *     block can never mute Buddy for the rest of the conversation (audit H-32).
 *   - Her unanswered run (several quick messages) all count as her words (audit M-49).
 *   - Buddy's messages posted after her message (a reminder that arrived meanwhile) are
 *     placed before her run, so the dialogue always ends with her (audit M-50).
 */
export function turnDialogue(
  messages: ReadonlyArray<Pick<MessageRow, 'id' | 'role' | 'text' | 'status' | 'failure_code'>>,
  triggerId: string,
  locale: string,
): {
  dialogue: Array<{ role: 'learner' | 'buddy'; text: string }>;
  learnerWords: string[];
} {
  const heldBack = t(locale, 'safeguarding.held_back');
  const shown = messages.map((m) => ({
    ...m,
    text: m.role === 'learner' && m.failure_code === 'blocked' ? heldBack : m.text,
  }));
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
      .filter((m) => m.role === 'learner' && m.failure_code !== 'blocked')
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
  const open = await deps.db.query<{ prompt: string; answer: string }>(
    `select i.prompt, i.answer
       from practice_sessions ps
       join session_items si on si.session_id = ps.id and si.status = 'open'
       join items i on i.id = si.item_id
      where ps.learner_id = $1 and ps.mode = 'help' and ps.status = 'active'`,
    [learnerId],
  );
  const hers = learnerWords.join('\n');
  return open.some(
    (i) => !homeworkSolved(hers, i.answer) && mentionsSolution(reply, i.answer, i.prompt),
  )
    ? [
        'reply: it gives away the solution of her open homework task. Help her find it herself (a question, a first step) — never the result.',
      ]
    : [];
}

function safeguardingText(learner: TurnLearner, kind: 'blocked' | 'concern'): string {
  return t(learner.locale, learner.isMinor ? `safeguarding.${kind}` : `safeguarding.${kind}_adult`);
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
      `update buddy_messages set status = 'done', failure_code = 'blocked'
        where id = $1 and status = 'processing' and claim_token = $2 returning id`,
      [message.id, message.claim_token],
    );
    if (owned.length !== 1) return false;
    await tx.query(
      `insert into buddy_messages (learner_id, role, text, reply_to_id, created_at)
       values ($1, 'buddy', $2, $3, $4)`,
      [learner.id, safeguardingText(learner, kind), message.id, now],
    );
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
