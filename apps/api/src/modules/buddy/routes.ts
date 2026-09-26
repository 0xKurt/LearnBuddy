// Buddy HTTP surface. docs/architecture.md §API.
// Explicit taps in the app (start, skip, undo, "how did it go", settings)
// are direct, validated state changes — no model involved. Only free text
// goes through the model (POST /buddy/messages).

import {
  type BuddySettingsView,
  MemoryList,
  OutreachOpenedRequest,
  RegisterPushTokenRequest,
  SendMessageRequest,
  UpdateBuddySettingsRequest,
  UpdateMemoryRequest,
  Uuid,
  type ReplyStreamEvent,
  type SendMessageResponse,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import {
  actorOf,
  assertAccountHolder,
  depsOf,
  hasAccountHolderRights,
  requireAccount,
  requireLearner,
  requireUser,
  type AppContext,
  type AppEnv,
} from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { inWindow } from '../../lib/time.js';
import { startFromStep } from '../practice/service.js';
import { buildHome } from './home.js';
import { bumpContext, cancelGoalWakeups } from './plan.js';
import { loadSettings, type SettingsRow } from './state.js';
import { runUndo, type UndoSpec } from './tools.js';
import { receiveLearnerMessage, type OnReply, type TurnOutcome } from './turn.js';

export const buddyRoutes = new Hono<AppEnv>();
buddyRoutes.use('*', requireUser, requireAccount, requireLearner);

const home = (c: AppContext) => {
  const l = c.get('learner');
  return buildHome(depsOf(c), { id: l.id, display_name: l.display_name, isMinor: l.isMinor });
};

buddyRoutes.get('/', async (c) => c.json(await home(c)));

buddyRoutes.get('/thread', async (c) => {
  const before = check(Uuid.optional(), c.req.query('before'));
  const l = c.get('learner');
  const h = await buildHome(
    depsOf(c),
    { id: l.id, display_name: l.display_name, isMinor: l.isMinor },
    before,
  );
  return c.json({ messages: h.thread, has_more: h.thread_has_more });
});

buddyRoutes.post('/messages', async (c) => {
  const input = await readBody(c, SendMessageRequest);
  const learner = c.get('learner');
  const run = (onReply?: OnReply) =>
    receiveLearnerMessage(
      depsOf(c),
      learner,
      {
        clientMessageId: input.client_message_id,
        text: input.text,
        replyToId: input.reply_to_id ?? null,
      },
      onReply,
    );
  const result = async (outcome: TurnOutcome): Promise<SendMessageResponse> => ({
    status: outcome.status,
    error_code: outcome.errorCode,
    home: await home(c),
  });

  if (!(c.req.header('accept') ?? '').includes('text/event-stream')) {
    const outcome = await run();
    return c.json(await result(outcome), outcome.status === 'processing' ? 202 : 200);
  }
  // Streamed: Buddy's reply while it is written, then the same result as above.
  return streamSSE(
    c,
    async (stream) => {
      let sent = Promise.resolve();
      const outcome = await run((round, p) => {
        const event: ReplyStreamEvent = { round, ...p };
        sent = sent.then(() => stream.writeSSE({ event: 'reply', data: JSON.stringify(event) }));
      });
      await sent;
      await stream.writeSSE({ event: 'done', data: JSON.stringify(await result(outcome)) });
    },
    async (err, stream) => {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ code: isAppError(err) ? err.code : 'internal' }),
      });
    },
  );
});

// ─────────────── explicit taps ───────────────

buddyRoutes.post('/steps/:id/start', async (c) => {
  const stepId = check(Uuid, c.req.param('id'));
  const sessionId = await startFromStep(depsOf(c), c.get('learner').id, stepId);
  return c.json({ session_id: sessionId });
});

buddyRoutes.post('/steps/:id/skip', async (c) => {
  const stepId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  await deps.db.tx(async (tx) => {
    const step = await tx.maybeOne<{ state: string }>(
      `select state from buddy_steps where id = $1 and learner_id = $2 for update`,
      [stepId, learnerId],
    );
    if (!step) throw new AppError('not_found', 'Step not found');
    if (!['planned', 'prepared'].includes(step.state))
      throw new AppError('conflict', 'This step is no longer open');
    await tx.query(
      `update buddy_steps set state = 'skipped', finished_at = $2, version = version + 1 where id = $1`,
      [stepId, deps.now()],
    );
    await tx.query(
      `update jobs set status = 'cancelled'
        where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
      [learnerId, stepId],
    );
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

buddyRoutes.post('/actions/:id/undo', async (c) => {
  const actionId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    // Same lock as decisions: an undo never interleaves with applying a decision.
    await tx.query(`select 1 from buddy_settings where learner_id = $1 for update`, [learnerId]);
    const action = await tx.maybeOne<{
      id: string;
      status: string;
      undo: UndoSpec | null;
      created_at: Date;
    }>(
      `select id, status, undo, created_at from buddy_actions where id = $1 and learner_id = $2 for update`,
      [actionId, learnerId],
    );
    if (!action) throw new AppError('not_found', 'Action not found');
    if (action.status !== 'applied' || !action.undo)
      throw new AppError('conflict', 'This cannot be undone');
    if (now.getTime() - action.created_at.getTime() > 7 * 86_400_000) {
      throw new AppError('conflict', 'Too old to undo');
    }
    if (!(await runUndo(tx, learnerId, action.undo, now))) {
      throw new AppError('conflict', 'This changed since — undo it by hand', {
        reason: 'changed_since',
      });
    }
    await tx.query(`update buddy_actions set status = 'undone', undone_at = $2 where id = $1`, [
      actionId,
      now,
    ]);
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

buddyRoutes.post('/goals/:id/outcome', async (c) => {
  const goalId = check(Uuid, c.req.param('id'));
  const { outcome } = await readBody(c, z.object({ outcome: z.enum(['good', 'ok', 'hard']) }));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  await deps.db.tx(async (tx) => {
    const goal = await tx.maybeOne<{ status: string }>(
      `select status from buddy_goals where id = $1 and learner_id = $2 for update`,
      [goalId, learnerId],
    );
    if (!goal) throw new AppError('not_found', 'Goal not found');
    if (goal.status !== 'active') throw new AppError('conflict', 'This goal is not open');
    await tx.query(
      `update buddy_goals set status = 'done', outcome = $2, closed_at = $3, version = version + 1 where id = $1`,
      [goalId, outcome, deps.now()],
    );
    await tx.query(
      `update buddy_steps set state = 'cancelled', finished_at = $2, version = version + 1
        where goal_id = $1 and state in ('planned','prepared')`,
      [goalId, deps.now()],
    );
    await cancelGoalWakeups(tx, learnerId, goalId);
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

buddyRoutes.post('/contact/opt-in', async (c) => {
  const { enable } = await readBody(c, z.object({ enable: z.boolean() }));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const now = deps.now();
  if (enable) {
    const by = assertAccountHolder(c);
    await deps.db.tx(async (tx) => {
      await tx.query(
        `update buddy_settings set contact_enabled = true, contact_changed_by = $2, contact_changed_at = $3,
                                   version = version + 1
          where learner_id = $1`,
        [learnerId, by, now],
      );
      await bumpContext(tx, learnerId);
    });
  } else {
    await deps.db.query(
      `update buddy_settings set opt_in_prompt_hidden_until = $2 where learner_id = $1`,
      [learnerId, new Date(now.getTime() + 14 * 86_400_000)],
    );
  }
  return c.json(await home(c));
});

buddyRoutes.post('/outreach/:id/opened', async (c) => {
  const outreachId = check(Uuid, c.req.param('id'));
  const { response } = await readBody(c, OutreachOpenedRequest);
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const r = await tx.query(
      `update buddy_outreach
          set opened_at = coalesce(opened_at, $3),
              response = coalesce($4, response),
              responded_at = case when $4::text is null then responded_at else coalesce(responded_at, $3) end
        where id = $1 and learner_id = $2 returning id`,
      [outreachId, learnerId, now, response],
    );
    if (r.length === 0) throw new AppError('not_found', 'Message not found');
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

// ─────────────── memory ───────────────

buddyRoutes.get('/memory', async (c) => {
  const deps = depsOf(c);
  const rows = await deps.db.query<{
    id: string;
    kind: 'fact' | 'preference' | 'goal' | 'constraint';
    statement: string;
    source: 'learner_stated' | 'learner_edited' | 'account_holder';
    quote: string | null;
    valid_until: Date | null;
    created_at: Date;
    version: number;
  }>(
    `select id, kind, statement, source, quote, valid_until, created_at, version from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)
      order by created_at desc`,
    [c.get('learner').id, deps.now()],
  );
  return c.json(
    MemoryList.parse({
      memories: rows.map((r) => ({
        ...r,
        valid_until: r.valid_until ? r.valid_until.toISOString() : null,
        created_at: r.created_at.toISOString(),
      })),
    }),
  );
});

buddyRoutes.patch('/memory/:id', async (c) => {
  const memoryId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, UpdateMemoryRequest);
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const editor = actorOf(c) === 'account_holder' ? 'account_holder' : 'learner_edited';
  const now = deps.now();
  await deps.db.tx(async (tx) => {
    const current = await tx.maybeOne<{
      id: string;
      kind: string;
      valid_until: Date | null;
      version: number;
    }>(
      `select id, kind, valid_until, version from buddy_memories
        where id = $1 and learner_id = $2 and status = 'active' for update`,
      [memoryId, learnerId],
    );
    if (!current) throw new AppError('not_found', 'Memory not found');
    if (current.version !== input.version)
      throw new AppError('stale', 'This changed meanwhile; reload');
    if ('retract' in input) {
      await tx.query(
        `update buddy_memories set status = 'retracted', version = version + 1 where id = $1`,
        [memoryId],
      );
    } else {
      await tx.query(
        `update buddy_memories set status = 'superseded', version = version + 1 where id = $1`,
        [memoryId],
      );
      await tx.query(
        `insert into buddy_memories (learner_id, kind, statement, source, valid_until, supersedes_id, created_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [learnerId, current.kind, input.statement, editor, current.valid_until, memoryId, now],
      );
    }
    await bumpContext(tx, learnerId);
  });
  return c.json({ ok: true });
});

// ─────────────── contact settings ───────────────

function settingsView(s: SettingsRow, canLoosen: boolean): BuddySettingsView {
  return {
    contact_enabled: s.contact_enabled,
    quiet_start: s.quiet_start,
    quiet_end: s.quiet_end,
    preferred_start: s.preferred_start,
    preferred_end: s.preferred_end,
    avoid_weekdays: s.avoid_weekdays,
    max_per_day: s.max_per_day,
    max_per_week: s.max_per_week,
    paused_until: s.paused_until ? s.paused_until.toISOString() : null,
    timezone: s.timezone,
    version: s.version,
    can_loosen: canLoosen,
  };
}

/** True when the change allows more contact than before (needs the account holder for minors). */
export function loosens(before: SettingsRow, after: SettingsRow, now: Date): boolean {
  if (!before.contact_enabled && after.contact_enabled) return true;
  if (after.max_per_day > before.max_per_day || after.max_per_week > before.max_per_week)
    return true;
  if (before.avoid_weekdays.some((d) => !after.avoid_weekdays.includes(d))) return true;
  const pausedBefore =
    before.paused_until && before.paused_until > now ? before.paused_until.getTime() : 0;
  const pausedAfter =
    after.paused_until && after.paused_until > now ? after.paused_until.getTime() : 0;
  if (pausedAfter < pausedBefore) return true;
  for (let m = 0; m < 1440; m += 5) {
    const wasQuiet = inWindow(m, before.quiet_start, before.quiet_end);
    const isQuiet = inWindow(m, after.quiet_start, after.quiet_end);
    if (wasQuiet && !isQuiet) return true;
  }
  return false;
}

buddyRoutes.get('/settings', async (c) => {
  const s = await loadSettings(depsOf(c).db, c.get('learner').id);
  return c.json(settingsView(s, hasAccountHolderRights(c)));
});

buddyRoutes.patch('/settings', async (c) => {
  const input = await readBody(c, UpdateBuddySettingsRequest);
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const now = deps.now();
  const result = await deps.db.tx(async (tx) => {
    const before = await tx.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1 for update`,
      [learnerId],
    );
    if (before.version !== input.version)
      throw new AppError('stale', 'Settings changed meanwhile; reload');
    const after: SettingsRow = {
      ...before,
      contact_enabled: input.contact_enabled ?? before.contact_enabled,
      quiet_start: input.quiet_start ?? before.quiet_start,
      quiet_end: input.quiet_end ?? before.quiet_end,
      preferred_start: input.preferred_start ?? before.preferred_start,
      preferred_end: input.preferred_end ?? before.preferred_end,
      avoid_weekdays: input.avoid_weekdays
        ? [...new Set(input.avoid_weekdays)].sort()
        : before.avoid_weekdays,
      max_per_day: input.max_per_day ?? before.max_per_day,
      max_per_week: input.max_per_week ?? before.max_per_week,
      paused_until:
        input.paused_until === undefined
          ? before.paused_until
          : input.paused_until
            ? new Date(input.paused_until)
            : null,
    };
    if (after.preferred_start >= after.preferred_end) {
      throw new AppError('invalid_input', 'The preferred window must start before it ends');
    }
    const by = loosens(before, after, now) ? assertAccountHolder(c) : actorOf(c);
    const row = await tx.one<SettingsRow>(
      `update buddy_settings
          set contact_enabled = $2, quiet_start = $3, quiet_end = $4, preferred_start = $5, preferred_end = $6,
              avoid_weekdays = $7, max_per_day = $8, max_per_week = $9, paused_until = $10,
              contact_changed_by = case when contact_enabled <> $2 then $11::text else contact_changed_by end,
              contact_changed_at = case when contact_enabled <> $2 then $12::timestamptz else contact_changed_at end,
              version = version + 1, context_version = context_version + 1
        where learner_id = $1 returning *`,
      [
        learnerId,
        after.contact_enabled,
        after.quiet_start,
        after.quiet_end,
        after.preferred_start,
        after.preferred_end,
        after.avoid_weekdays,
        after.max_per_day,
        after.max_per_week,
        after.paused_until,
        by,
        now,
      ],
    );
    if (!row.contact_enabled || (row.paused_until && row.paused_until > now)) {
      // Nothing queued is sent later in bulk.
      await tx.query(
        `update buddy_outreach set status = 'cancelled', status_reason = $2
          where learner_id = $1 and status = 'scheduled'`,
        [learnerId, row.contact_enabled ? 'paused' : 'contact_disabled'],
      );
    }
    return row;
  });
  return c.json(settingsView(result, hasAccountHolderRights(c)));
});

// ─────────────── push devices ───────────────

buddyRoutes.post('/push-tokens', async (c) => {
  const input = await readBody(c, RegisterPushTokenRequest);
  const deps = depsOf(c);
  await deps.db.query(
    `insert into push_tokens (learner_id, token, platform, status, registered_at)
     values ($1, $2, $3, 'active', $4)
     on conflict (token) do update
       set learner_id = excluded.learner_id, platform = excluded.platform, status = 'active',
           invalid_reason = null, registered_at = excluded.registered_at`,
    [c.get('learner').id, input.token, input.platform, deps.now()],
  );
  return c.json({ ok: true });
});

buddyRoutes.delete('/push-tokens', async (c) => {
  const { token } = await readBody(c, z.object({ token: z.string().min(10).max(300) }));
  await depsOf(c).db.query(`delete from push_tokens where token = $1 and learner_id = $2`, [
    token,
    c.get('learner').id,
  ]);
  return c.json({ ok: true });
});
