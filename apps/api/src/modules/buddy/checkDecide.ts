// The background check's model decision: what is due, what Buddy may do about it.
// Split from check.ts (#311); docs/architecture.md §Proactivity.

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
import {
  BUDDY_PROMPT_VERSION,
  CHECK_SCHEMA,
  CHECK_STEP_SCHEMA,
  CHECK_SYSTEM,
  repairMessage,
} from './prompts.js';
import { CheckDecision } from './registry.js';
import { type BuddyState, loadBuddyState } from './state.js';
import { pushAvailable } from './turn.js';

/** Wake-ups that follow directly from something the learner did. */
const LEARNER_TRIGGERED = new Set(['material_ready', 'session_finished']);

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
      case 'material_ready': {
        const m = state.materials.find((x) => x.id === t.materialId);
        lines.push(
          `- new material is ready: "${m?.title ?? 'worksheet'}" with ${m?.item_count ?? 0} questions.`,
        );
        break;
      }
      case 'session_finished': {
        const s = state.sessions.find((x) => x.id === t.sessionId);
        lines.push(
          s
            ? `- the learner just finished practice: ${s.answered}/${s.total} answered, ${s.first_try} right first try${s.shaky_topics.length ? `, shaky: ${s.shaky_topics.join(', ')}` : ''}.`
            : '- the learner just finished practice.',
        );
        break;
      }
      case 'checkin_requested':
        lines.push(`- you planned to look again: ${String(t.job.payload.note ?? '')}`);
        break;
      default:
        lines.push('- routine check.');
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
  const answersLearner = triggers.some((t) => LEARNER_TRIGGERED.has(t.reason));
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
  // With contact to the phone off, a routine look still speaks in the app (ADR 0006).
  if (state.totals.activeGoals === 0 && state.totals.items === 0 && state.totals.openSteps === 0) {
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
          promptVersion: BUDDY_PROMPT_VERSION,
          output: null,
          triggers: triggers.map((t) => t.reason),
          reason: 'nothing to work with',
          topicKey: null,
        },
      },
      'wait',
      null,
    );
    await finishAll({
      outcome: 'wait',
      reason: 'nothing_to_work_with',
    });
    return 'wait';
  }

  // No model configured at all: retrying later cannot help, the fixed fallbacks act now.
  if (!deps.llm.available) {
    await fallback(deps, learner, triggers, 'model_disabled', lease);
    return 'fallback:model_disabled';
  }

  let repair: string[] | null = null;
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
      mode: 'check' as const,
      attempt,
      model: null as string | null,
      promptVersion: BUDDY_PROMPT_VERSION,
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
            promptVersion: BUDDY_PROMPT_VERSION,
            system: CHECK_SYSTEM,
            contents: messages,
            schema: final ? CHECK_SCHEMA : CHECK_STEP_SCHEMA,
            maxOutputTokens: 2048,
            temperature: 0.3,
            timeoutMs: 40_000,
            thinkingBudget: 768,
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

    const parsed = CheckDecision.safeParse(raw);
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
      const errors = parsed.success
        ? semantic
        : parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`);
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
  // She kept chatting while Buddy tried three times: what she is waiting for (her photos,
  // her practice) still gets its fixed answer (audit p2-check-stale-exhaustion-drops-reaction).
  if (answersLearner) {
    await fallback(deps, learner, triggers, 'stale', lease);
    return 'fallback:stale';
  }
  await finishAll({ outcome: 'stale' });
  return 'stale';
}
