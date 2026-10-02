// Background checks: Buddy acts without being asked. docs/architecture.md §Proactivity.
//
// Triggered by durable wake-ups (jobs): an exam approaching, the day after an
// exam, material that finished processing, a finished practice session, an
// agreed reminder, a check Buddy scheduled itself, a daily routine check.
//
// Order of gates (cheap and deterministic first, model last):
//   1. one worker per learner (lease on buddy_settings);
//   2. agreed reminders → deterministic template, no model;
//   3. learner is in the app right now → look again in 20 minutes;
//   4. nothing to work with (no goals, no material) → silence, no model call;
//   5. model decides (prepare / propose a message / wait) within budget;
//   6. apply atomically with the context fence; the contact policy decides
//      whether and when a proposed message is sent;
//   7. if the model is unavailable, fixed fallbacks keep time-critical help
//      working (prepared practice before an exam, "how did it go").

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { Deps } from '../../deps.js';
import { isAppError } from '../../lib/errors.js';
import { addDays, daysBetween, localParts, weekdayOf, zonedToInstant } from '../../lib/time.js';
import { dayLabel, t } from '../../i18n/index.js';
import { callModel } from '../../llm/call.js';
import { LlmError } from '../../llm/gateway.js';
import { toJsonSchema } from '../../llm/json-schema.js';
import { isMinor, type LearnerRow } from '../identity/model.js';
import { questionCountFor, selectPracticeItems } from '../practice/selection.js';
import { claimJobs, enqueueJob, finishJob, retryJob, type JobRow } from '../scheduler/jobs.js';
import { applyDecision, recordUnapplied } from './apply.js';
import { buildContents, buildContext, canonicalTopicKey } from './context.js';
import { CheckDecision } from './registry.js';
import { planOutreach, type BodyTemplate } from './delivery.js';
import { markHandled } from './events.js';
import { lookupsField, withLookups } from './lookups.js';
import {
  describeLookBack,
  findLookBack,
  LOOK_BACK_TRIGGERS,
  lookBackErrors,
  type LookBackFact,
} from './lookback.js';
import { bumpContext, rollRepeatingStep } from './plan.js';
import { BUDDY_PROMPT_VERSION, CHECK_SYSTEM, repairMessage } from './prompts.js';
import { loadBuddyState, type BuddyState, type SettingsRow } from './state.js';
import { claimMessage, processTurn, pushAvailable, TURN_STALL_MS } from './turn.js';

const CHECK_SCHEMA = toJsonSchema(CheckDecision);
/** A step that may still ask for lookups first (ADR 0005 §The agent loop). */
// Lookups first, as in a turn: the model chooses what to read before it writes a decision
// (p2-check-step-schema-lookups-last).
// Exported only so the prompt test can scan the exact bytes this module sends (issue #213):
// `CheckDecision` and `lookupsField` are each scanned on their own, but the COMPOSITION is what
// goes out, and a description can only hide in what no test holds.
export const CHECK_STEP_SCHEMA = toJsonSchema(
  z.object({ lookups: lookupsField }).extend(CheckDecision.shape),
);
const LEASE_SECONDS = 150;
const IN_APP_DEFER_MS = 20 * 60_000;
const IN_APP_WINDOW_MS = 3 * 60_000;
/** Wake-ups that follow directly from something the learner did. */
const LEARNER_TRIGGERED = new Set(['material_ready', 'session_finished']);

type Trigger = {
  job: JobRow;
  reason: string;
  goalId: string | null;
  stepId: string | null;
  materialId: string | null;
  sessionId: string | null;
  /** The event that woke Buddy (ADR 0005 stage 4); null for schedules. */
  eventId: string | null;
};

function triggerOf(job: JobRow): Trigger {
  const p = job.payload;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  return {
    job,
    reason: str('reason') ?? 'routine',
    goalId: str('goal_id'),
    stepId: str('step_id'),
    materialId: str('material_id'),
    sessionId: str('session_id'),
    eventId: str('event_id'),
  };
}

async function acquireLease(deps: Deps, learnerId: string, now: Date): Promise<string | null> {
  const token = randomUUID();
  const row = await deps.db.maybeOne(
    `update buddy_settings set check_lease_token = $2, check_lease_until = $3::timestamptz + make_interval(secs => $4)
      where learner_id = $1 and (check_lease_until is null or check_lease_until < $3)
      returning learner_id`,
    [learnerId, token, now, LEASE_SECONDS],
  );
  return row ? token : null;
}

/** This worker's hold on one learner's checks, and on the jobs it claimed for them. */
type CheckLease = { learnerId: string; token: string; jobs: JobRow[] };

/** Another worker took over (our lease ran out): stop without writing anything. */
class LeaseLost extends Error {}

/**
 * Heartbeat (audit M-47 check-lease-shorter-than-runtime): before every model call the
 * learner lease and the claimed jobs' leases are extended by a full lease, so a check that
 * runs longer than one lease (several lookup and repair rounds on a slow provider day) is
 * never taken over — and run twice — while it is still alive. If the lease is already gone,
 * another worker owns the learner now: this one stops.
 */
async function extendLease(deps: Deps, lease: CheckLease): Promise<void> {
  const now = deps.now();
  const held = await deps.db.maybeOne(
    `update buddy_settings set check_lease_until = $3::timestamptz + make_interval(secs => $4)
      where learner_id = $1 and check_lease_token = $2
      returning learner_id`,
    [lease.learnerId, lease.token, now, LEASE_SECONDS],
  );
  if (!held) throw new LeaseLost();
  await deps.db.query(
    `update jobs j set lease_until = $3::timestamptz + make_interval(secs => $4)
       from unnest($1::uuid[], $2::uuid[]) as mine(id, token)
      where j.id = mine.id and j.lease_token = mine.token and j.status = 'running'`,
    [lease.jobs.map((j) => j.id), lease.jobs.map((j) => j.lease_token), now, LEASE_SECONDS],
  );
}

async function releaseLease(deps: Deps, learnerId: string, token: string): Promise<void> {
  await deps.db.query(
    `update buddy_settings set check_lease_token = null, check_lease_until = null
      where learner_id = $1 and check_lease_token = $2`,
    [learnerId, token],
  );
}

export type CheckStats = { jobs: number; outcome: string };

/** Process all due Buddy jobs of one learner. Safe to call concurrently. */
export async function runLearnerJobs(deps: Deps, learnerId: string): Promise<CheckStats> {
  const now = deps.now();
  const token = await acquireLease(deps, learnerId, now);
  if (!token) return { jobs: 0, outcome: 'locked' };
  try {
    const jobs = await claimJobs(deps.db, {
      now,
      kinds: ['buddy_check', 'buddy_turn'],
      limit: 10,
      leaseSeconds: LEASE_SECONDS,
      learnerId,
    });
    if (jobs.length === 0) return { jobs: 0, outcome: 'none' };
    const learnerRow = await deps.db.maybeOne<LearnerRow>(`select * from learners where id = $1`, [
      learnerId,
    ]);
    if (!learnerRow) {
      for (const j of jobs)
        await finishJob(deps.db, j, now, { status: 'done', result: { outcome: 'no_learner' } });
      return { jobs: jobs.length, outcome: 'no_learner' };
    }
    const learner = { ...learnerRow, isMinor: isMinor(learnerRow, now) };

    // Interrupted conversation turns: take over with a new claim, run again.
    for (const job of jobs.filter((j) => j.kind === 'buddy_turn')) {
      const messageId = typeof job.payload.message_id === 'string' ? job.payload.message_id : null;
      const msg = messageId
        ? await deps.db.maybeOne<{
            id: string;
            status: string;
            claim_token: string | null;
            claimed_at: Date | null;
          }>(
            `select id, status, claim_token, claimed_at from buddy_messages where id = $1 and learner_id = $2`,
            [messageId, learnerId],
          )
        : null;
      const stalled =
        msg?.status === 'processing' &&
        (!msg.claimed_at || now.getTime() - msg.claimed_at.getTime() > TURN_STALL_MS);
      const claimed =
        msg && stalled ? await claimMessage(deps, learnerId, msg.id, msg.claim_token) : null;
      if (claimed) {
        const r = await processTurn(deps, learner, claimed);
        await finishJob(deps.db, job, deps.now(), {
          status: 'done',
          result: { outcome: r.status },
        });
      } else {
        await finishJob(deps.db, job, now, {
          status: 'done',
          result: { outcome: 'nothing_to_resume' },
        });
      }
    }

    const triggers = jobs.filter((j) => j.kind === 'buddy_check').map(triggerOf);
    const agreed = triggers.filter((t) => t.reason === 'step_due');
    // A check whose worker failed all its attempts comes back once, model-free (terminal.ts).
    const parked = triggers.filter((t) => t.reason !== 'step_due' && t.job.payload.fallback_only);
    const others = triggers.filter((t) => t.reason !== 'step_due' && !t.job.payload.fallback_only);

    for (const trig of agreed) await sendAgreedReminder(deps, learner, trig);
    if (parked.length > 0) {
      try {
        await fallback(deps, learner, parked, 'parked', { learnerId, token, jobs });
      } catch (err) {
        if (!(err instanceof LeaseLost)) throw err;
        return { jobs: jobs.length, outcome: 'lease_lost' };
      }
    }

    let outcome = 'done';
    if (others.length > 0) {
      try {
        outcome = await decide(deps, learner, others, { learnerId, token, jobs });
      } catch (err) {
        if (!(err instanceof LeaseLost)) throw err;
        return { jobs: jobs.length, outcome: 'lease_lost' };
      }
    }
    await markHandled(
      deps.db,
      learnerId,
      others.flatMap((t) => (t.eventId ? [t.eventId] : [])),
      deps.now(),
    );
    await ensureRoutine(deps, learnerId);
    return { jobs: jobs.length, outcome };
  } finally {
    await releaseLease(deps, learnerId, token);
  }
}

// ─────────────── agreed reminders (deterministic) ───────────────

async function sendAgreedReminder(deps: Deps, learner: LearnerRow, trig: Trigger): Promise<void> {
  const now = deps.now();
  const result = await deps.db.tx(async (tx) => {
    const settings = await tx.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1 for update`,
      [learner.id],
    );
    const step = trig.stepId
      ? await tx.maybeOne<{
          id: string;
          kind: 'practice' | 'capture';
          title: string;
          state: string;
          agreed: boolean;
          goal_id: string | null;
          version: number;
          planned_date: string | null;
          planned_time: string | null;
          repeat: 'daily' | 'weekdays' | 'weekly' | null;
          repeat_until: string | null;
          payload: {
            item_ids?: string[];
            est_minutes?: number;
            subject_id?: string | null;
            focus_topics?: string[];
          };
        }>(`select * from buddy_steps where id = $1 and learner_id = $2 for update`, [
          trig.stepId,
          learner.id,
        ])
      : null;
    if (!step || !step.agreed || !['planned', 'prepared'].includes(step.state)) {
      return { outcome: 'obsolete' };
    }
    let count = step.payload.item_ids?.length ?? 0;
    let minutes = step.payload.est_minutes ?? 0;
    // Practice for what she named — the test's material or the subject — and nothing else:
    // without either, the reminder only reminds (audit H-30), never "6 Aufgaben" from any subject.
    const subjectId = step.payload.subject_id ?? null;
    if (step.kind === 'practice' && count === 0 && (step.goal_id || subjectId)) {
      const items = await selectPracticeItems(
        tx,
        learner.id,
        { goalId: step.goal_id, subjectId },
        step.payload.focus_topics ?? [],
        questionCountFor(10),
        now,
      );
      if (items.length > 0) {
        count = items.length;
        minutes = Math.max(5, Math.round(count / 1.2));
        await tx.query(
          `update buddy_steps set state = 'prepared', prepared_at = $2, payload = payload || $3, version = version + 1
            where id = $1`,
          [step.id, now, { item_ids: items, est_minutes: minutes }],
        );
      }
    }
    const key =
      step.kind === 'capture'
        ? ('reminder.capture' as const)
        : count > 0
          ? ('reminder.practice_ready' as const)
          : ('reminder.practice' as const);
    const params = { title: step.title, count, minutes };
    const body = t(learner.locale, key, params);
    const plan = await planOutreach(tx, {
      learnerId: learner.id,
      settings,
      now,
      decisionId: null,
      origin: 'agreed',
      kind: 'reminder',
      topicKey: `step:${step.id}`,
      // Keyed by the reminder job (step and version when it was planned), not by the version
      // this handler bumps itself: a re-run never sends it twice (agreed-reminder-duplicate-on-rerun).
      dedupeKey: trig.job.dedupe_key.startsWith('step:')
        ? trig.job.dedupe_key
        : `step:${step.id}:v${step.version}`,
      title: t(learner.locale, 'title.buddy'),
      body,
      why: null,
      relevance: null,
      earliest: trig.job.run_at,
      expiresAt: new Date(trig.job.run_at.getTime() + 6 * 3_600_000),
      goalId: step.goal_id,
      stepId: step.id,
      // Rendered when shown: a reminder that arrives late says so (D-13).
      template: { key, params, agreed_at: trig.job.run_at.toISOString() },
    });
    // A standing arrangement moves on the moment its reminder has gone out, not when she
    // reacts (issue #112) — a day she ignores must not end the repetition silently.
    const nextDate = await rollRepeatingStep(tx, learner.id, step, settings, now);
    await bumpContext(tx, learner.id);
    return { outcome: plan.status, reason: plan.reason, next: nextDate };
  });
  await finishJob(deps.db, trig.job, now, { status: 'done', result: result });
}

// ─────────────── model decision ───────────────

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

async function decide(
  deps: Deps,
  learner: LearnerRow & { isMinor: boolean },
  triggers: Trigger[],
  lease: CheckLease,
): Promise<string> {
  const now = deps.now();
  const settings = await deps.db.one<SettingsRow>(
    `select * from buddy_settings where learner_id = $1`,
    [learner.id],
  );

  // The learner is using the app: don't start something unasked, look again
  // later. What follows from their own action (the photos they just sent, the
  // practice they just finished) is what they are waiting for: do it now.
  const answersLearner = triggers.some((t) => LEARNER_TRIGGERED.has(t.reason));
  const inApp =
    settings.last_seen_at !== null &&
    now.getTime() - settings.last_seen_at.getTime() < IN_APP_WINDOW_MS;
  if (inApp && !answersLearner) {
    for (const trig of triggers) {
      await retryJob(deps.db, trig.job, {
        runAt: new Date(now.getTime() + IN_APP_DEFER_MS),
        error: 'learner_in_app',
        countAttempt: false,
        now,
      });
    }
    return 'deferred_in_app';
  }

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
      if (looked.steps.length > 0) meta.output = { lookups: looked.steps, final: raw };
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
    if (meta.output === undefined) meta.output = raw;

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

// ─────────────── fallbacks without a model ───────────────

async function fallback(
  deps: Deps,
  learner: LearnerRow,
  triggers: Trigger[],
  why: string,
  lease: CheckLease,
): Promise<void> {
  const now = deps.now();
  for (const trig of triggers) {
    const result = await deps.db.tx(async (tx) => {
      const settings = await tx.one<SettingsRow>(
        `select * from buddy_settings where learner_id = $1 for update`,
        [learner.id],
      );
      // Only while this worker still holds the learner: never a second fallback message.
      if (settings.check_lease_token !== lease.token) throw new LeaseLost();
      const tz = settings.timezone;
      const today = localParts(now, tz).date;
      const goal = trig.goalId
        ? await tx.maybeOne<{
            id: string;
            title: string;
            status: string;
            due_date: string | null;
            subject_id: string | null;
          }>(
            `select id, title, status, due_date, subject_id from buddy_goals where id = $1 and learner_id = $2`,
            [trig.goalId, learner.id],
          )
        : null;

      const prepared = async (goalId: string | null, subjectId: string | null, title: string) => {
        const existing = await tx.maybeOne<{
          id: string;
          payload: { item_ids?: string[]; est_minutes?: number };
        }>(
          `select id, payload from buddy_steps
            where learner_id = $1 and kind = 'practice' and state = 'prepared'
              and goal_id is not distinct from $2
            order by created_at desc, seq desc limit 1`,
          [learner.id, goalId],
        );
        if (existing?.payload.item_ids?.length) {
          return {
            stepId: existing.id,
            count: existing.payload.item_ids.length,
            minutes: existing.payload.est_minutes ?? 10,
          };
        }
        const items = await selectPracticeItems(
          tx,
          learner.id,
          { goalId, subjectId },
          [],
          questionCountFor(10),
          now,
        );
        if (items.length === 0) return null;
        const minutes = Math.max(5, Math.round(items.length / 1.2));
        const step = await tx.one<{ id: string }>(
          `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
           values ($1, $2, 'practice', $3, 'prepared', $4, $5, $6) returning id`,
          [
            learner.id,
            goalId,
            title,
            today,
            { item_ids: items, est_minutes: minutes, focus_topics: [], subject_id: subjectId },
            now,
          ],
        );
        return { stepId: step.id, count: items.length, minutes };
      };

      let proposal: {
        kind: 'idea' | 'checkin' | 'result';
        origin: 'buddy' | 'learner';
        topic: string;
        body: string;
        template: BodyTemplate | null;
        relevance: number;
        goalId: string | null;
        stepId: string | null;
      } | null = null;
      if (trig.reason === 'exam_countdown' && goal?.status === 'active' && goal.due_date) {
        const inDays = daysBetween(today, goal.due_date);
        const day = dayLabel(learner.locale, weekdayOf(goal.due_date), inDays);
        const p = await prepared(goal.id, goal.subject_id, goal.title);
        if (p) {
          const params = { exam: goal.title, count: p.count, minutes: p.minutes };
          proposal = {
            kind: 'idea',
            origin: 'buddy',
            topic: `exam:${goal.id}:prep`,
            body: t(learner.locale, 'exam.prepared', { day, ...params }),
            // "Morgen" is rendered on the day it is read (audit M-60).
            template: { key: 'exam.prepared', params, due_date: goal.due_date },
            relevance: inDays <= 1 ? 0.85 : 0.7,
            goalId: goal.id,
            stepId: p.stepId,
          };
        } else {
          const open = await tx.maybeOne(
            `select 1 from buddy_steps where learner_id = $1 and kind = 'capture' and state = 'planned' and goal_id = $2`,
            [learner.id, goal.id],
          );
          if (!open) {
            await tx.query(
              `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date)
               values ($1, $2, 'capture', $3, 'planned', $4)`,
              [learner.id, goal.id, goal.title, today],
            );
          }
          proposal = {
            kind: 'idea',
            origin: 'buddy',
            topic: `exam:${goal.id}:material`,
            body: t(learner.locale, 'exam.need_material', { day, exam: goal.title }),
            template: {
              key: 'exam.need_material',
              params: { exam: goal.title },
              due_date: goal.due_date,
            },
            relevance: 0.7,
            goalId: goal.id,
            stepId: null,
          };
        }
      } else if (trig.reason === 'exam_followup' && goal?.status === 'active') {
        proposal = {
          kind: 'checkin',
          origin: 'buddy',
          topic: `exam:${goal.id}:followup`,
          body: t(learner.locale, 'exam.followup', { exam: goal.title }),
          template: null,
          relevance: 0.7,
          goalId: goal.id,
          stepId: null,
        };
      } else if (trig.reason === 'material_ready' && trig.materialId) {
        const m = await tx.maybeOne<{
          id: string;
          title: string | null;
          goal_id: string | null;
          subject_id: string | null;
          n: number;
        }>(
          `select m.id, m.title, m.goal_id, m.subject_id,
                  (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as n
             from materials m where m.id = $1 and m.learner_id = $2 and m.status = 'ready'
              and m.archived_at is null`,
          [trig.materialId, learner.id],
        );
        if (m && m.n > 0) {
          const p = await prepared(
            m.goal_id,
            m.subject_id,
            m.title ?? t(learner.locale, 'practice.untitled'),
          );
          proposal = {
            kind: 'result',
            // Her photos: the result always reaches her, like any answer (audit M-61).
            origin: 'learner',
            template: null,
            topic: `material:${m.id}`,
            body: m.title
              ? t(learner.locale, 'material.ready', { title: m.title, count: m.n })
              : t(learner.locale, 'material.ready_untitled', { count: m.n }),
            relevance: 0.7,
            goalId: m.goal_id,
            stepId: p?.stepId ?? null,
          };
        }
      } else if (trig.reason === 'checkin_requested') {
        // Buddy said "ich schaue nochmal vorbei": without the model it still keeps its word,
        // honestly (audit p2-F-journey-checkin-promise-dropped).
        proposal = {
          kind: 'checkin',
          origin: 'buddy',
          topic: `checkin:${trig.job.id}`,
          body: t(learner.locale, 'reminder.checkin_unavailable'),
          template: null,
          relevance: 0.7,
          goalId: null,
          stepId: null,
        };
      }

      let outreach = null;
      if (proposal) {
        outreach = await planOutreach(tx, {
          learnerId: learner.id,
          settings,
          now,
          decisionId: null,
          origin: proposal.origin,
          kind: proposal.kind,
          topicKey: proposal.topic,
          dedupeKey: `fallback:${proposal.topic}:${trig.job.id}`,
          title: t(learner.locale, 'title.buddy'),
          body: proposal.body,
          why: null,
          relevance: proposal.relevance,
          earliest: now,
          expiresAt: new Date(now.getTime() + 24 * 3_600_000),
          goalId: proposal.goalId,
          stepId: proposal.stepId,
          template: proposal.template,
        });
      }
      await tx.query(
        `insert into buddy_decisions (learner_id, mode, triggers, context_version, disposition, reason,
                                      prompt_version, created_at)
         values ($1, 'check', $2, $3, $4, $5, 'fallback.1', $6)`,
        [
          learner.id,
          JSON.stringify([{ reason: trig.reason, goal_id: trig.goalId }]),
          settings.context_version,
          proposal ? 'applied' : 'wait',
          `fallback (${why})`,
          now,
        ],
      );
      await bumpContext(tx, learner.id);
      return {
        outcome: proposal ? 'fallback_act' : 'fallback_wait',
        outreach: outreach?.status ?? null,
      };
    });
    await finishJob(deps.db, trig.job, deps.now(), { status: 'done', result: result });
  }
}

// ─────────────── routine ───────────────

/** One quiet daily look while something is coming up; nothing when there is nothing to do. */
async function ensureRoutine(deps: Deps, learnerId: string): Promise<void> {
  const now = deps.now();
  const s = await deps.db.one<SettingsRow>(`select * from buddy_settings where learner_id = $1`, [
    learnerId,
  ]);
  const tz = s.timezone;
  const today = localParts(now, tz).date;
  const soon = await deps.db.maybeOne(
    `select 1 from buddy_goals
      where learner_id = $1 and status = 'active' and due_date between $2::date and $2::date + 14
      limit 1`,
    [learnerId, today],
  );
  if (!soon) return;
  const next = addDays(today, 1);
  await enqueueJob(deps.db, {
    learnerId,
    kind: 'buddy_check',
    runAt: zonedToInstant(next, s.preferred_start, tz),
    dedupeKey: `routine:${learnerId}:${next}`,
    payload: { reason: 'routine' },
  });
}

/** Interrupted turns: queue a recovery job for messages stuck in "processing". */
const MAX_TURN_RECOVERIES = 3;

export async function queueStalledTurns(deps: Deps): Promise<number> {
  const now = deps.now();
  const stalled = await deps.db.query<{
    id: string;
    learner_id: string;
    claim_token: string | null;
  }>(
    `select id, learner_id, claim_token from buddy_messages
      where role = 'learner' and status = 'processing' and (claimed_at is null or claimed_at < $1)
      limit 50`,
    [new Date(now.getTime() - TURN_STALL_MS)],
  );
  for (const m of stalled) {
    // A turn that keeps dying (a crash, not a model error) is taken over at most
    // MAX_TURN_RECOVERIES times, then it fails honestly instead of being re-billed every
    // few minutes (p2-J-stall-recovery-loop-drains-budget).
    const tried = await deps.db.one<{ n: number }>(
      `select count(*)::int as n from jobs
        where learner_id = $1 and kind = 'buddy_turn' and payload ->> 'message_id' = $2`,
      [m.learner_id, m.id],
    );
    if (tried.n >= MAX_TURN_RECOVERIES) {
      await deps.db.query(
        `update buddy_messages set status = 'failed', failure_code = 'internal'
          where id = $1 and status = 'processing' and claim_token is not distinct from $2`,
        [m.id, m.claim_token],
      );
      continue;
    }
    await enqueueJob(deps.db, {
      learnerId: m.learner_id,
      kind: 'buddy_turn',
      runAt: now,
      // One recovery per claim: a later takeover that stalls again gets its own.
      dedupeKey: `turn:${m.id}:${m.claim_token ?? 'unclaimed'}`,
      payload: { message_id: m.id },
      maxAttempts: 2,
    });
  }
  return stalled.length;
}
