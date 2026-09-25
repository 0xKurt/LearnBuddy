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
import { planOutreach, type OutreachPlan } from './delivery.js';
import { loadSettings, type SettingsRow } from './state.js';
import { runTool, ToolRejection, type ToolOutcome } from './tools.js';

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
  latestLearnerText: string | null;
  triggerMessageId: string | null;
  /** Turn processing claim: only the current owner of the message may publish. */
  messageClaim: { id: string; token: string } | null;
  actions: AnyAction[];
  reply: { text: string; options: string[] | null } | null;
  outreach: Outreach | null;
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
      if (settings.context_version !== input.contextVersion) throw new StaleDecision();

      const outcomes: Array<{ action: AnyAction; outcome: ToolOutcome }> = [];
      const created = { goalId: null as string | null, stepId: null as string | null };
      for (const [i, action] of input.actions.entries()) {
        try {
          // Settings may be changed by an earlier action of the same decision.
          const current = i === 0 ? settings : await loadSettings(tx, input.learnerId);
          outcomes.push({
            action,
            outcome: await runTool(action, {
              db: tx,
              learnerId: input.learnerId,
              settings: current,
              aliases: input.aliases,
              now: input.now,
              reference: input.reference,
              mode: input.meta.mode,
              latestLearnerText: input.latestLearnerText,
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
          input.meta.mode === 'check' && input.actions.length === 0 && !input.outreach
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
      if (input.triggerMessageId) {
        // The answer covers this message and earlier ones that failed on their own.
        await tx.query(
          `update buddy_messages set status = 'done'
            where learner_id = $2 and role = 'learner'
              and (id = $1 or (status = 'failed' and seq < (select seq from buddy_messages where id = $1)))`,
          [input.triggerMessageId, input.learnerId],
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
          origin: 'buddy',
          kind: input.outreach.kind,
          topicKey,
          dedupeKey: `buddy:${decision.id}`,
          title: input.outreach.title,
          body: input.outreach.body,
          why: input.outreach.why,
          relevance: input.outreach.relevance,
          earliest: input.now,
          expiresAt: new Date(input.now.getTime() + input.outreach.expires_in_hours * 3_600_000),
          goalId: input.outreach.goal
            ? (input.aliases.goals.get(input.outreach.goal)?.id ?? null)
            : null,
          stepId:
            input.outreach.step === 'new'
              ? created.stepId
              : input.outreach.step
                ? (input.aliases.steps.get(input.outreach.step)?.id ?? null)
                : null,
        });
      }

      if (outcomes.length > 0 || input.reply || (outreach && outreach.status !== 'suppressed')) {
        await tx.query(
          `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
          [input.learnerId],
        );
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
    if (err instanceof StaleDecision) {
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
