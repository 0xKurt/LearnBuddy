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

import type { Deps } from '../../deps.js';
import type { LearnerContext } from '../../http/context.js';
import { isUniqueViolation } from '../../lib/db.js';
import { isAppError } from '../../lib/errors.js';
import { localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import { LlmError, type LlmMessage } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { applyDecision, recordUnapplied } from './apply.js';
import { buildContents, buildContext } from './context.js';
import { TurnDecision } from './decision.js';
import { bumpContext } from './plan.js';
import { BUDDY_PROMPT_VERSION, TURN_SYSTEM, repairMessage } from './prompts.js';
import { lookupsField, withLookups } from './lookups.js';
import { loadBuddyState } from './state.js';

const TURN_SCHEMA = toJsonSchema(TurnDecision);
/** A step that may still ask for lookups first (ADR 0005 §The agent loop). */
const TURN_STEP_SCHEMA = toJsonSchema(TurnDecision.extend({ lookups: lookupsField }));
const MAX_ROUNDS = 4;
/** A turn still "processing" after this long is considered interrupted. */
export const TURN_STALL_MS = 3 * 60_000;

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

/** Entry point for POST /buddy/messages. */
export async function receiveLearnerMessage(
  deps: Deps,
  learner: TurnLearner,
  input: { clientMessageId: string; text: string; replyToId: string | null },
): Promise<TurnOutcome> {
  const now = deps.now();
  const token = randomUUID();
  let message: ClaimedMessage;
  try {
    message = await deps.db.tx(async (tx) => {
      const row = await tx.one<{ id: string; text: string; created_at: Date }>(
        `insert into buddy_messages (learner_id, role, text, client_message_id, status, reply_to_id,
                                     claim_token, claimed_at, created_at)
         values ($1, 'learner', $2, $3, 'processing', $4, $5, $6, $6)
         returning id, text, created_at`,
        [learner.id, input.text, input.clientMessageId, input.replyToId, token, now],
      );
      await bumpContext(tx, learner.id);
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
  return processTurn(deps, learner, message);
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
    `update buddy_messages set status = 'processing', claim_token = $3, claimed_at = $4
      where id = $1 and learner_id = $2 and role = 'learner' and status <> 'done'
        and claim_token is not distinct from $5
      returning id, text, created_at, claim_token`,
    [messageId, learnerId, token, deps.now(), previousToken],
  );
}

/** Runs the decision loop for one claimed learner message. */
export async function processTurn(
  deps: Deps,
  learner: TurnLearner,
  message: ClaimedMessage,
): Promise<TurnOutcome> {
  let repairErrors: string[] | null = null;
  for (let attempt = 1; attempt <= MAX_ROUNDS; attempt++) {
    const now = deps.now();
    const state = await loadBuddyState(deps.db, learner.id, now);

    // A newer learner message supersedes this one: its turn answers both.
    const latestLearner = [...state.messages].reverse().find((m) => m.role === 'learner');
    if (latestLearner && latestLearner.id !== message.id) {
      await deps.db.query(
        `update buddy_messages set status = 'done' where id = $1 and status = 'processing' and claim_token = $2`,
        [message.id, message.claim_token],
      );
      return { status: 'done', errorCode: null };
    }

    const ctx = buildContext(learner, state, now, {
      pushAvailable: await pushAvailable(deps, learner.id),
    });
    // Everything the learner wrote counts, also messages whose own turn is
    // still running or failed: this answer covers them.
    const dialogue = state.messages.map((m) => ({ role: m.role, text: m.text }));
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
        ctx: { deps, learnerId: learner.id, timezone: state.settings.timezone },
        surface: 'turn',
        contents,
        call: async (messages, final) => {
          const result = await callModel(
            deps,
            learner.id,
            localParts(now, state.settings.timezone).date,
            {
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
            },
          );
          meta.model = result.usage.model;
          return result.json;
        },
      });
      raw = looked.raw;
      // The audit keeps what was looked up (tools and whether they worked), not the results.
      if (looked.steps.length > 0) meta.output = { lookups: looked.steps, final: raw };
    } catch (err) {
      const code = isAppError(err)
        ? err.code
        : err instanceof LlmError
          ? err.kind === 'invalid_output' || err.kind === 'blocked'
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

    const result = await applyDecision(deps.db, {
      learnerId: learner.id,
      locale: learner.locale,
      contextVersion: ctx.contextVersion,
      aliases: ctx.aliases,
      now,
      reference: message.created_at,
      latestLearnerText: message.text,
      triggerMessageId: message.id,
      messageClaim: { id: message.id, token: message.claim_token },
      actions: parsed.data.actions,
      reply: { text: parsed.data.reply, options: parsed.data.options },
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

async function failTurn(deps: Deps, message: ClaimedMessage, code: string): Promise<TurnOutcome> {
  // Only the current owner may mark it failed.
  const rows = await deps.db.query(
    `update buddy_messages set status = 'failed'
      where id = $1 and status = 'processing' and claim_token = $2 returning id`,
    [message.id, message.claim_token],
  );
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
