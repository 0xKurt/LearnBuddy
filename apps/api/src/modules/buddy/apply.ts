// Applies one validated model decision atomically. docs/architecture.md §Buddy decisions.
//
// All or nothing, in one transaction:
//   1. fence: the learner's context_version must still be the one the model
//      saw — otherwise the decision is stale (the learner wrote again,
//      practised, changed a setting…) and nothing is applied;
//   2. run every tool against current data; the first rejection rolls back;
//   3. record the decision, the actions (with undo data), the reply / the
//      outreach (through the contact policy), and bump context_version once.
// The reply is only ever published together with the changes it talks about.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { canonicalTopicKey, type Aliases } from './context.js';
import type { AnyAction, Outreach } from './decision.js';
import type { LookBackFact } from './lookback.js';
import { planOutreach, type OutreachPlan } from './delivery.js';
import { bumpContext } from './plan.js';
import { LIMITS, loadSettings, TURN_STALL_MS, type SettingsRow } from './state.js';
import { runAct } from './registry.js';
import { ToolRejection, type ToolOutcome } from './tools.js';

export type DecisionMeta = {
  mode: 'turn' | 'check';
  attempt: number;
  model: string | null;
  promptVersion: string;
  output: unknown;
  triggers: unknown[];
  reason: string | null;
  topicKey: string | null;
};

export type ApplyInput = {
  learnerId: string;
  /** Learner's app language (titles the server writes itself). */
  locale: string;
  contextVersion: number;
  aliases: Aliases;
  now: Date;
  reference: Date;
  /** What the learner wrote that this decision answers; null for background checks. */
  learnerWords: readonly string[] | null;
  /** A safeguarding answer (TurnDecision.concern). */
  concern?: boolean;
  triggerMessageId: string | null;
  /** Turn processing claim: only the current owner of the message may publish. */
  messageClaim: { id: string; token: string } | null;
  /** Background check: only the worker still holding the learner's check lease may apply. */
  checkLease?: string;
  actions: AnyAction[];
  reply: { text: string; options: string[] | null } | null;
  outreach: Outreach | null;
  /** A look-back Buddy says in the app (lookback.ts): the model's sentence and the fact. */
  lookBack?: { text: string; fact: LookBackFact } | null;
  /** 'learner' when the outreach answers something she just did (policy.ts). */
  outreachOrigin?: 'buddy' | 'learner';
  meta: DecisionMeta;
};

export type ApplyResult =
  | {
      status: 'applied';
      decisionId: string;
      replyMessageId: string | null;
      actions: Array<{ id: string; summary: ActionSummary }>;
      outreach: OutreachPlan | null;
    }
  | { status: 'stale' }
  | { status: 'superseded' }
  | { status: 'rejected'; errors: string[] };

class StaleDecision extends Error {}
class SupersededClaim extends Error {}

/**
 * Postgres gave up this transaction to break a lock cycle (40P01) or a serialization
 * conflict (40001). Nothing was applied; for the decision that is the same as a stale
 * context — rebuild and ask again — never a failed turn after its reply was streamed.
 */
function lostLockRace(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === '40P01' || code === '40001';
}

export async function applyDecision(db: Db, input: ApplyInput): Promise<ApplyResult> {
  try {
    return await db.tx(async (tx) => {
      const settings = await tx.one<SettingsRow>(
        `select * from buddy_settings where learner_id = $1 for update`,
        [input.learnerId],
      );
      if (input.messageClaim) {
        const msg = await tx.maybeOne<{ status: string; claim_token: string | null }>(
          `select status, claim_token from buddy_messages where id = $1 and learner_id = $2 for update`,
          [input.messageClaim.id, input.learnerId],
        );
        if (!msg || msg.status !== 'processing' || msg.claim_token !== input.messageClaim.token) {
          throw new SupersededClaim();
        }
      }
      if (input.checkLease !== undefined && settings.check_lease_token !== input.checkLease) {
        throw new SupersededClaim();
      }
      if (settings.context_version !== input.contextVersion) throw new StaleDecision();

      const outcomes: Array<{ action: AnyAction; outcome: ToolOutcome }> = [];
      const created = {
        goalId: null as string | null,
        stepId: null as string | null,
        preparedStepId: null as string | null,
      };
      for (const [i, action] of input.actions.entries()) {
        try {
          // Settings may be changed by an earlier action of the same decision.
          const current = i === 0 ? settings : await loadSettings(tx, input.learnerId);
          outcomes.push({
            action,
            outcome: await runAct(action, {
              db: tx,
              learnerId: input.learnerId,
              settings: current,
              aliases: input.aliases,
              now: input.now,
              reference: input.reference,
              mode: input.meta.mode,
              learnerWords: input.learnerWords,
              concern: input.concern ?? false,
              triggerMessageId: input.triggerMessageId,
              locale: input.locale,
              created,
            }),
          });
        } catch (err) {
          if (err instanceof ToolRejection) {
            throw new ToolRejection(`action ${i + 1} (${action.tool}): ${err.message}`);
          }
          throw err;
        }
      }

      const decision = await tx.one<{ id: string }>(
        `insert into buddy_decisions (learner_id, mode, trigger_message_id, triggers, context_version,
                                      attempt, disposition, reason, topic_key, output, model, prompt_version,
                                      created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
        [
          input.learnerId,
          input.meta.mode,
          input.triggerMessageId,
          JSON.stringify(input.meta.triggers),
          input.contextVersion,
          input.meta.attempt,
          input.meta.mode === 'check' &&
          input.actions.length === 0 &&
          !input.outreach &&
          !input.lookBack
            ? 'wait'
            : 'applied',
          input.meta.reason,
          input.meta.topicKey,
          JSON.stringify(input.meta.output),
          input.meta.model,
          input.meta.promptVersion,
          input.now,
        ],
      );

      const actions: Array<{ id: string; summary: ActionSummary }> = [];
      for (const { action, outcome } of outcomes) {
        const row = await tx.one<{ id: string }>(
          `insert into buddy_actions (learner_id, decision_id, tool, args, result, undo, created_at)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [
            input.learnerId,
            decision.id,
            action.tool,
            JSON.stringify(action.args),
            JSON.stringify(outcome.summary),
            outcome.undo ? JSON.stringify(outcome.undo) : null,
            input.now,
          ],
        );
        actions.push({ id: row.id, summary: outcome.summary });
      }

      let replyMessageId: string | null = null;
      if (input.reply) {
        const msg = await tx.one<{ id: string }>(
          `insert into buddy_messages (learner_id, role, text, reply_to_id, ask, decision_id, created_at)
           values ($1, 'buddy', $2, $3, $4, $5, $6) returning id`,
          [
            input.learnerId,
            input.reply.text,
            input.triggerMessageId,
            input.reply.options ? JSON.stringify({ options: input.reply.options }) : null,
            decision.id,
            input.now,
          ],
        );
        replyMessageId = msg.id;
      }
      if (input.lookBack) {
        // Said once, in the app only (never pushed): the row keeps it rare (lookback.ts).
        const f = input.lookBack.fact;
        const msg = await tx.one<{ id: string }>(
          `insert into buddy_messages (learner_id, role, text, decision_id, created_at)
           values ($1, 'buddy', $2, $3, $4) returning id`,
          [input.learnerId, input.lookBack.text, decision.id, input.now],
        );
        await tx.query(
          `insert into buddy_lookbacks (learner_id, subject_id, topic_key, topic, shaky_at,
                                        message_id, decision_id, said_at, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
          [
            input.learnerId,
            f.subjectId,
            f.topicKey,
            f.topic,
            f.shakyAt,
            msg.id,
            decision.id,
            input.now,
          ],
        );
      }
      if (input.triggerMessageId && input.concern === true) {
        // A distress disclosure stays in her conversation and in her export — it is hers
        // (docs/privacy.md). What must never happen is that something is DERIVED from it
        // and kept: a session summary is exactly that, and it would come back as STATE
        // while `buddy_memories` stays empty as promised. The disposition goes on the
        // message itself, so every later model context honours it through one rule
        // (modules/buddy/recall.ts, issue #149) instead of each path remembering.
        await tx.query(
          `update buddy_messages set recall_block = 'concern'
            where id = $1 and learner_id = $2 and recall_block is null`,
          [input.triggerMessageId, input.learnerId],
        );
      }
      if (input.triggerMessageId) {
        // The answer covers this message and earlier ones the model saw in its dialogue
        // window (never older ones it did not see — old-failed-messages-marked-done-unseen)
        // that failed on their own, were superseded by this one (claim released) or are
        // stuck in a crashed turn (p2-J-stuck-processing-not-closed).
        await tx.query(
          `update buddy_messages set status = 'done'
            where learner_id = $2 and role = 'learner'
              and (id = $1
                   or (seq < (select seq from buddy_messages where id = $1)
                       and seq >= (select coalesce(min(w.seq), 0) from (
                                     select seq from buddy_messages
                                      where learner_id = $2
                                        and seq <= (select seq from buddy_messages where id = $1)
                                      order by seq desc limit $4) w)
                       and (status = 'failed'
                            or (status = 'processing'
                                and (claim_token is null or claimed_at < $3)))))`,
          [
            input.triggerMessageId,
            input.learnerId,
            new Date(input.now.getTime() - TURN_STALL_MS),
            LIMITS.messages,
          ],
        );
      }

      let outreach: OutreachPlan | null = null;
      if (input.outreach) {
        const settingsNow = await loadSettings(tx, input.learnerId);
        const topicKey = canonicalTopicKey(input.outreach.topic_key, input.aliases);
        outreach = await planOutreach(tx, {
          learnerId: input.learnerId,
          settings: settingsNow,
          now: input.now,
          decisionId: decision.id,
          origin: input.outreachOrigin ?? 'buddy',
          kind: input.outreach.kind,
          topicKey,
          dedupeKey: `buddy:${decision.id}`,
          title: input.outreach.title,
          body: input.outreach.body,
          why: input.outreach.why,
          relevance: input.outreach.relevance,
          earliest: input.now,
          expiresAt: new Date(input.now.getTime() + input.outreach.expires_in_hours * 3_600_000),
          goalId: outreachLink(input.outreach.goal, (a) => input.aliases.goals.get(a)?.id, 'goal'),
          stepId: outreachLink(
            input.outreach.step,
            (a) => (a === 'new' ? (created.stepId ?? undefined) : input.aliases.steps.get(a)?.id),
            'step',
          ),
        });
      }

      if (
        outcomes.length > 0 ||
        input.reply ||
        input.lookBack ||
        (outreach && outreach.status !== 'suppressed')
      ) {
        await bumpContext(tx, input.learnerId);
      }
      return {
        status: 'applied' as const,
        decisionId: decision.id,
        replyMessageId,
        actions,
        outreach,
      };
    });
  } catch (err) {
    if (err instanceof SupersededClaim) return { status: 'superseded' };
    if (err instanceof StaleDecision || lostLockRace(err)) {
      await recordUnapplied(db, input, 'stale', null);
      return { status: 'stale' };
    }
    if (err instanceof ToolRejection) {
      await recordUnapplied(db, input, 'rejected', [err.message]);
      return { status: 'rejected', errors: [err.message] };
    }
    throw err;
  }
}

/**
 * What an outreach message refers to: a link the model named must resolve — it decides
 * whether the message is obsolete when its step or goal is done — so an unknown one rejects
 * the decision instead of being dropped silently (p2-outreach-links-silently-dropped).
 */
function outreachLink(
  alias: string | null | undefined,
  resolve: (alias: string) => string | undefined,
  what: 'goal' | 'step',
): string | null {
  if (!alias) return null;
  const id = resolve(alias);
  if (!id) throw new ToolRejection(`outreach: unknown ${what} ${alias}`);
  return id;
}

export async function recordUnapplied(
  db: Db,
  input: Pick<ApplyInput, 'learnerId' | 'triggerMessageId' | 'contextVersion' | 'meta' | 'now'>,
  disposition: 'stale' | 'rejected' | 'failed' | 'wait',
  errors: string[] | null,
): Promise<string> {
  const row = await db.one<{ id: string }>(
    `insert into buddy_decisions (learner_id, mode, trigger_message_id, triggers, context_version, attempt,
                                  disposition, reason, topic_key, output, errors, model, prompt_version, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [
      input.learnerId,
      input.meta.mode,
      input.triggerMessageId,
      JSON.stringify(input.meta.triggers),
      input.contextVersion,
      input.meta.attempt,
      disposition,
      input.meta.reason,
      input.meta.topicKey,
      input.meta.output === undefined ? null : JSON.stringify(input.meta.output),
      errors ? JSON.stringify(errors) : null,
      input.meta.model,
      input.meta.promptVersion,
      input.now,
    ],
  );
  return row.id;
}
