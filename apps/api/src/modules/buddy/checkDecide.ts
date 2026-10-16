// The background check's model decision: what is due, what Buddy may do about it.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

import { randomUUID } from 'node:crypto';

import type { Deps } from '../../deps.js';
import { isAppError } from '../../lib/errors.js';
import { daysBetween, localParts } from '../../lib/time.js';
import { callModel } from '../../llm/call.js';
import { LlmError } from '../../llm/gateway.js';
import type { LearnerRow } from '../identity/model.js';
import { finishJob, retryJob } from '../scheduler/jobs.js';
import { applyDecision, recordUnapplied } from './apply.js';
import { fallback } from './checkFallback.js';
import { type CheckLease, extendLease, LeaseLost } from './checkLease.js';
import type { Trigger } from './checkTrigger.js';
import { buildContents, buildContext, canonicalTopicKey } from './context.js';
import { deferredWhileInApp } from './inApp.js';
import {
  describeLookBack,
  findLookBack,
  LOOK_BACK_TRIGGERS,
  lookBackErrors,
  type LookBackFact,
} from './lookback.js';
import { withLookups } from './lookups.js';
import { buddyPrompt, repairMessage, schemaErrors } from './prompts.js';
import { contextProvider } from './provider.js';
import { checkDecisionSchema } from './registry.js';
import { type BuddyState, loadBuddyState } from './state.js';
import { pushAvailable } from './turn.js';

function describeTriggers(state: BuddyState, triggers: Trigger[], today: string): string {
  const lines = ['TRIGGERS (why you are checking now):'];
  for (const t of triggers) {
    const goal = t.goalId ? state.goals.find((g) => g.id === t.goalId) : undefined;
    switch (t.reason) {
      case 'exam_countdown':
        lines.push(
          goal?.due_date
            ? `- "${goal.title}" is in ${daysBetween(today, goal.due_date)} day(s).`
            : '- an exam is approaching (details in STATE).',
        );
        break;
      case 'exam_followup':
        lines.push(
          goal
            ? `- "${goal.title}" was yesterday; the outcome is unknown.`
            : '- an exam just happened.',
        );
        break;
      case 'checkin_requested':
        lines.push(`- you planned to look again: ${String(t.job.payload.note ?? '')}`);
        break;
      default:
        // A domain's reason says itself (a sheet read, a practice finished: provider.ts).
        lines.push(contextProvider().check.describe(state, t) ?? '- routine check.');
    }
  }
  // Wake-ups that piled up (e.g. after a scheduler outage) say the same thing once.
  return [...new Set(lines)].join('\n');
}

/** What a look back is about: the session just finished, or the subject of the test ahead. */
function lookBackFocus(
  state: BuddyState,
  triggers: Trigger[],
): { sessionId: string | null; subjectId: string | null } {
  const sessionId = triggers.find((t) => t.sessionId)?.sessionId ?? null;
  const examGoal = triggers.find((t) => t.reason === 'exam_countdown' && t.goalId)?.goalId;
  const subjectId = examGoal
    ? (state.goals.find((g) => g.id === examGoal)?.subject_id ?? null)
    : null;
  return { sessionId, subjectId };
}

/** How long a model's look at an unchanged state stands for a routine look (F4-d, #656). */
const SAME_STATE_MS = 48 * 3_600_000;

/**
 * Did the model already decide about exactly this state, recently? Its last background decision
 * (not a fallback, not one code made) within `SAME_STATE_MS`, and `context_version` exactly where
 * that decision left it. A wait leaves it as it was. An applied decision moved it by one only when
 * it wrote something (`applyDecision` bumps for an action, a look back, or a message that is not
 * suppressed) — read back from what it wrote, so a decision whose only message was suppressed
 * is not credited with a bump it never made. Anything she or Buddy did since — a message, a
 * sheet, a practice, a goal — moved it further, and then the model is asked again.
 */
async function lookedAtThisState(
  deps: Deps,
  learnerId: string,
  contextVersion: number,
  now: Date,
): Promise<boolean> {
  const last = await deps.db.maybeOne<{ context_version: number; wrote: boolean }>(
    `select d.context_version,
            d.disposition = 'applied' and (
                 exists (select 1 from buddy_actions a where a.decision_id = d.id)
              or exists (select 1 from buddy_lookbacks b where b.decision_id = d.id)
              or exists (select 1 from buddy_outreach o
                          where o.decision_id = d.id and o.status <> 'suppressed')) as wrote
       from buddy_decisions d
      where d.learner_id = $1 and d.mode = 'check' and d.model is not null
        and d.disposition in ('wait', 'applied') and d.created_at > $2
      order by d.created_at desc, d.id desc limit 1`,
    [learnerId, new Date(now.getTime() - SAME_STATE_MS)],
  );
  return last !== null && contextVersion === last.context_version + (last.wrote ? 1 : 0);
}

export async function decide(
  deps: Deps,
  learner: LearnerRow & { isMinor: boolean },
  triggers: Trigger[],
  lease: CheckLease,
): Promise<string> {
  const now = deps.now();

  // The learner is using the app: don't start something unasked, look again
  // later. What follows from their own action (the photos they just sent, the
  // practice they just finished) is what they are waiting for: do it now.
  const answersLearner = triggers.some((t) =>
    contextProvider().check.learnerTriggered.has(t.reason),
  );
  if (
    !answersLearner &&
    (await deferredWhileInApp(
      deps,
      learner.id,
      triggers.map((t) => t.job),
    ))
  )
    return 'deferred_in_app';

  const finishAll = async (result: Record<string, unknown>) => {
    for (const trig of triggers)
      await finishJob(deps.db, trig.job, deps.now(), { status: 'done', result });
  };

  let state = await loadBuddyState(deps.db, learner.id, now);
  /** Decided by code before any model call: recorded as a wait, every job finished. */
  const waitByCode = async (reason: string, outcome: string) => {
    await recordUnapplied(
      deps.db,
      {
        learnerId: learner.id,
        triggerMessageId: null,
        contextVersion: state.settings.context_version,
        now,
        meta: {
          mode: 'check',
          attempt: 1,
          model: null,
          promptVersion: buddyPrompt().version,
          output: null,
          triggers: triggers.map((t) => t.reason),
          reason,
          topicKey: null,
        },
      },
      'wait',
      null,
    );
    await finishAll({ outcome: 'wait', reason: outcome });
    return 'wait';
  };
  // With contact to the phone off, a routine look still speaks in the app (ADR 0006).
  if (
    state.totals.activeGoals === 0 &&
    !contextProvider().check.somethingToWorkWith(state) &&
    state.totals.openSteps === 0
  )
    return waitByCode('nothing to work with', 'nothing_to_work_with');

  // A routine look with nothing new since Buddy's last look (F4-d, #656): the model was asked
  // about this very state within 48 hours, and what it answered then stands. Measured: 5 of 9 of
  // Buddy's own messages were never shown — cancelled, or suppressed as a topic he had just
  // raised, which the contact policy only finds out after the call.
  if (
    triggers.every((t) => t.reason === 'routine') &&
    (await lookedAtThisState(deps, learner.id, state.settings.context_version, now))
  )
    return waitByCode('nothing new since the last look', 'nothing_new');

  // No model configured at all: retrying later cannot help, the fixed fallbacks act now.
  if (!deps.llm.available) {
    await fallback(deps, learner, triggers, 'model_disabled', lease);
    return 'fallback:model_disabled';
  }

  let repair: string[] | null = null;
  /** The model rounds of this check so far, over every attempt (`llm_calls.round`, #652). */
  let rounds = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const at = deps.now();
    if (attempt > 1) state = await loadBuddyState(deps.db, learner.id, at);
    const today = localParts(at, state.settings.timezone).date;
    const ctx = buildContext(learner, state, at, {
      pushAvailable: await pushAvailable(deps, learner.id),
    });
    const dialogue = state.messages
      // A message the safety filter held back never goes to the model again (audit H-32).
      .filter((m) => m.status === 'done' && m.failure_code !== 'blocked')
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));
    // After practice or before a test, code may offer one look back (lookback.ts).
    const lookBack: LookBackFact | null = triggers.some((t) => LOOK_BACK_TRIGGERS.has(t.reason))
      ? await findLookBack(
          deps.db,
          learner.id,
          at,
          state.settings.timezone,
          lookBackFocus(state, triggers),
        )
      : null;
    const tail = `${describeTriggers(state, triggers, today)}${lookBack ? `\n\n${describeLookBack(lookBack)}` : ''}${repair ? `\n\n${repairMessage(repair)}` : ''}`;
    const meta = {
      // Chosen now, so every model round of this attempt names it in `llm_calls` (#652).
      id: randomUUID(),
      mode: 'check' as const,
      attempt,
      model: null as string | null,
      promptVersion: buddyPrompt().version,
      output: undefined as unknown,
      triggers: triggers.map((t) => ({
        reason: t.reason,
        goal_id: t.goalId,
        material_id: t.materialId,
      })),
      reason: null as string | null,
      topicKey: null as string | null,
    };

    let raw: unknown;
    try {
      const looked = await withLookups({
        ctx: {
          deps,
          learnerId: learner.id,
          timezone: state.settings.timezone,
          aliases: ctx.aliases,
        },
        surface: 'check',
        contents: buildContents(ctx.state, dialogue, tail),
        call: async (messages, final) => {
          await extendLease(deps, lease);
          const res = await callModel(deps, learner.id, today, {
            purpose: 'buddy_check',
            tier: 'smart',
            promptVersion: buddyPrompt().version,
            system: buddyPrompt().checkSystem,
            contents: messages,
            schema: final ? buddyPrompt().checkSchema : buddyPrompt().checkStepSchema,
            maxOutputTokens: 2048,
            temperature: 0.3,
            timeoutMs: 40_000,
            thinking: 'medium',
            trace: {
              decisionId: meta.id,
              round: ++rounds,
              schemaVariant: final ? 'final' : 'step',
            },
          });
          meta.model = res.usage.model;
          return res.json;
        },
      });
      raw = looked.raw;
      meta.output = looked.output;
    } catch (err) {
      if (err instanceof LeaseLost) throw err;
      const why = isAppError(err) ? err.code : err instanceof LlmError ? err.kind : 'error';
      await recordUnapplied(
        deps.db,
        {
          learnerId: learner.id,
          triggerMessageId: null,
          contextVersion: ctx.contextVersion,
          meta,
          now: deps.now(),
        },
        'failed',
        [why],
      );
      // Retry later only when nobody is waiting: after their own photos or practice the
      // learner gets the fixed fallback now instead of nothing for ten minutes.
      if (err instanceof LlmError && err.retryable && !answersLearner) {
        const retriable = triggers.filter((t) => t.job.attempts < t.job.max_attempts);
        if (retriable.length === triggers.length) {
          for (const trig of triggers) {
            await retryJob(deps.db, trig.job, {
              runAt: new Date(at.getTime() + 10 * 60_000),
              error: why,
              countAttempt: true,
              now: at,
            });
          }
          return 'retry_later';
        }
      }
      await fallback(deps, learner, triggers, why, lease);
      return `fallback:${why}`;
    }

    const parsed = checkDecisionSchema().safeParse(raw);
    const semantic = parsed.success
      ? [
          ...(parsed.data.disposition === 'wait' &&
          (parsed.data.actions.length > 0 || parsed.data.outreach)
            ? ['disposition "wait" must have no actions and no outreach']
            : []),
          ...lookBackErrors(parsed.data, lookBack),
        ]
      : [];
    if (!parsed.success || semantic.length > 0) {
      const errors = parsed.success ? semantic : schemaErrors(parsed.error);
      await recordUnapplied(
        deps.db,
        {
          learnerId: learner.id,
          triggerMessageId: null,
          contextVersion: ctx.contextVersion,
          meta,
          now: deps.now(),
        },
        'rejected',
        errors,
      );
      if (repair) {
        await fallback(deps, learner, triggers, 'invalid_output', lease);
        return 'fallback:invalid_output';
      }
      repair = errors;
      continue;
    }
    const d = parsed.data;
    meta.reason = d.reason;
    meta.topicKey = d.outreach ? canonicalTopicKey(d.outreach.topic_key, ctx.aliases) : null;
    if (d.disposition === 'wait') {
      await recordUnapplied(
        deps.db,
        {
          learnerId: learner.id,
          triggerMessageId: null,
          contextVersion: ctx.contextVersion,
          meta,
          now: deps.now(),
        },
        'wait',
        null,
      );
      await finishAll({ outcome: 'wait', reason: d.reason });
      return 'wait';
    }
    const applied = await applyDecision(deps.db, {
      learnerId: learner.id,
      locale: learner.locale,
      contextVersion: ctx.contextVersion,
      aliases: ctx.aliases,
      now: at,
      reference: at,
      learnerWords: null,
      triggerMessageId: null,
      messageClaim: null,
      // Applied only while this worker still holds the learner (never twice).
      checkLease: lease.token,
      actions: d.actions,
      reply: null,
      outreach: d.outreach,
      lookBack: d.look_back && lookBack ? { text: d.look_back.text, fact: lookBack } : null,
      // Her own photos or practice: the answer is not an initiative (policy.ts).
      outreachOrigin: answersLearner ? 'learner' : 'buddy',
      meta,
    });
    if (applied.status === 'applied') {
      await finishAll({
        outcome: 'act',
        actions: applied.actions.map((a) => a.summary.tool),
        look_back: Boolean(d.look_back && lookBack),
        outreach: applied.outreach
          ? { status: applied.outreach.status, reason: applied.outreach.reason }
          : null,
      });
      return 'act';
    }
    if (applied.status === 'superseded') throw new LeaseLost();
    if (applied.status === 'rejected') {
      if (repair) {
        await fallback(deps, learner, triggers, 'rejected', lease);
        return 'fallback:rejected';
      }
      repair = applied.errors;
      continue;
    }
    // stale → loop with fresh state
  }
  // She kept chatting while Buddy tried three times: what she is waiting for still gets its
  // fixed answer where there is one — her photos (audit p2-check-stale-exhaustion-drops-reaction).
  // A finished practice has none: its result card and the greeting say it already (#850).
  if (triggers.some((t) => contextProvider().check.fixedAnswer.has(t.reason))) {
    await fallback(deps, learner, triggers, 'stale', lease);
    return 'fallback:stale';
  }
  await finishAll({ outcome: 'stale' });
  return 'stale';
}
