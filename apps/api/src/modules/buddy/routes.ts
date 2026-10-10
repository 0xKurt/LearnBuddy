// Buddy HTTP surface. docs/architecture.md §API.
// Explicit taps in the app (start, skip, undo, "how did it go", settings)
// are direct, validated state changes — no model involved. Only free text
// goes through the model (POST /buddy/messages).

import {
  type EndRoleplayResponse,
  AnswerConfirmationRequest,
  type BuddySettingsView,
  MemoryList,
  OutreachActionRequest,
  type OutreachActionResponse,
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
import { z } from 'zod';

import {
  actorOf,
  assertAccountHolder,
  depsOf,
  hasAccountHolderRights,
  requireAccount,
  requireAccountAnyConsent,
  requireLearner,
  requireUser,
  type AppContext,
  type AppEnv,
} from '../../http/context.js';
import { streamed, wantsStream } from '../../http/stream.js';
import { check, readBody } from '../../http/validate.js';
import type { Db } from '../../lib/db.js';
import { AppError, isAppError } from '../../lib/errors.js';
import { t } from '../../i18n/index.js';
import { readsIn } from '../../speech/gateway.js';
import { archiveMaterial, archiveMaterialItem } from '../materials/archive.js';
import { startFromStep } from '../practice/service.js';
import { sessionView } from '../practice/sessionView.js';
import { registerPushToken } from '../devices/service.js';
import { buildHome } from './home.js';
import { endRoleplayByTap } from './roleplay.js';
import { addDays, localParts, zonedToInstant } from '../../lib/time.js';
import { bumpContext, cancelGoalWakeups, lockContext, scheduleStepReminder } from './plan.js';
import { loosens } from './policy.js';
import { loadSettings, type SettingsRow } from './state.js';
import type { UndoSpec } from './toolKit.js';
import { runUndo, undoLoosensContact } from './undo.js';
import { receiveLearnerMessage, stopTurn, type OnReply, type TurnOutcome } from './turn.js';

export const buddyRoutes = new Hono<AppEnv>();
buddyRoutes.use(
  '*',
  requireUser,
  // Unregistering a phone only ever reduces contact: it works while a new privacy text
  // waits for consent (a sign-out from the consent screen); everything else needs it.
  (c, next) =>
    c.req.method === 'DELETE' && c.req.path.endsWith('/push-tokens')
      ? requireAccountAnyConsent(c, next)
      : requireAccount(c, next),
  requireLearner,
);

const home = (c: AppContext) => {
  const l = c.get('learner');
  return buildHome(depsOf(c), { id: l.id, display_name: l.display_name, isMinor: l.isMinor });
};

/**
 * A change under the learner's context lock (one lock order everywhere, CLAUDE.md rule 4): the
 * transaction, her id and the app clock's now, read once before it starts.
 */
function underContext<T>(
  c: AppContext,
  work: (tx: Db, learnerId: string, now: Date) => Promise<T>,
): Promise<T> {
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const now = deps.now();
  return deps.db.tx(async (tx) => {
    await lockContext(tx, learnerId);
    return work(tx, learnerId, now);
  });
}

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

  if (!wantsStream(c)) {
    const outcome = await run();
    return c.json(await result(outcome), outcome.status === 'processing' ? 202 : 200);
  }
  // Streamed: Buddy's reply while it is written, then the same result as above.
  return streamed(c, 'reply', async (emit) =>
    result(
      await run((round, p) => {
        const event: ReplyStreamEvent = { round, ...p };
        emit(event);
      }),
    ),
  );
});

// "Stopp": she ends Buddy's reply while it is written (docs/architecture.md §Turns). The
// answer says where the turn stands: stopped, or already answered (then the reply is there).
buddyRoutes.post('/messages/:clientMessageId/stop', async (c) => {
  const clientMessageId = check(Uuid, c.req.param('clientMessageId'));
  const outcome = await stopTurn(depsOf(c), c.get('learner').id, clientMessageId);
  if (!outcome) throw new AppError('not_found', 'Message not found');
  const body: SendMessageResponse = {
    status: outcome.status,
    error_code: outcome.errorCode,
    home: await home(c),
  };
  return c.json(body);
});

// ─────────────── explicit taps ───────────────

// She ends the roleplay with the card's button (issue #244): with turns played, the checked
// feedback lands in the thread; another learner's id is 404, an ended one 409.
buddyRoutes.post('/roleplays/:id/end', async (c) => {
  const id = check(Uuid, c.req.param('id'));
  const l = c.get('learner');
  await endRoleplayByTap(depsOf(c), l, id);
  const body: EndRoleplayResponse = { home: await home(c) };
  return c.json(body);
});

buddyRoutes.post('/steps/:id/start', async (c) => {
  const stepId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const sessionId = await startFromStep(deps, learnerId, stepId);
  // The session comes along: the app shows its first question at once (gaps.md #2).
  return c.json({
    session_id: sessionId,
    session: await sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now()),
  });
});

/**
 * "Heute nicht": the step steps aside until tomorrow — not skipped for good (audit M-57).
 * An agreed reminder moves with it to the same time tomorrow. Throws 404 / 409.
 */
async function stepAsideUntilTomorrow(
  tx: Db,
  learnerId: string,
  stepId: string,
  settings: SettingsRow,
  now: Date,
): Promise<void> {
  const step = await tx.maybeOne<{
    state: string;
    agreed: boolean;
    planned_date: string | null;
    planned_time: string | null;
  }>(
    `select state, agreed, planned_date, planned_time from buddy_steps
      where id = $1 and learner_id = $2 for update`,
    [stepId, learnerId],
  );
  if (!step) throw new AppError('not_found', 'Step not found');
  if (!['planned', 'prepared'].includes(step.state))
    throw new AppError('conflict', 'This step is no longer open');
  const today = localParts(now, settings.timezone).date;
  const tomorrow = addDays(today, 1);
  const moved = await tx.one<{ id: string; version: number }>(
    `update buddy_steps set planned_date = greatest(coalesce(planned_date, $2::date), $2::date),
                            version = version + 1
      where id = $1 returning id, version`,
    [stepId, tomorrow],
  );
  await tx.query(
    `update jobs set status = 'cancelled'
      where learner_id = $1 and kind = 'buddy_check' and status = 'queued' and payload ->> 'step_id' = $2`,
    [learnerId, stepId],
  );
  if (step.agreed) {
    const at = zonedToInstant(
      tomorrow,
      step.planned_time ?? settings.preferred_start,
      settings.timezone,
    );
    await scheduleStepReminder(tx, learnerId, moved, at);
  }
}

buddyRoutes.post('/steps/:id/skip', async (c) => {
  const stepId = check(Uuid, c.req.param('id'));
  await underContext(c, async (tx, learnerId, now) => {
    const settings = await loadSettings(tx, learnerId);
    await stepAsideUntilTomorrow(tx, learnerId, stepId, settings, now);
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

buddyRoutes.post('/actions/:id/undo', async (c) => {
  const actionId = check(Uuid, c.req.param('id'));
  // Same lock as decisions: an undo never interleaves with applying a decision.
  await underContext(c, async (tx, learnerId, now) => {
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
    // Undoing a pause or earlier quiet hours means more contact again: under 16 that needs
    // the adult's PIN, exactly like the same change in the settings (CLAUDE.md rule 6, ADR 0006).
    if (await undoLoosensContact(tx, learnerId, action.undo, now)) assertAccountHolder(c);
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

/**
 * Her answer to a proposed deletion (issue #151). The tap is the consent — the model only
 * ever proposed, and nothing was deleted while this card waited.
 *
 * Bound to exactly this proposal: one answer, within its window, on an object that has not
 * changed underneath it. A second tap answers nothing (the row is no longer open), and a
 * card left over from last week has expired.
 */
buddyRoutes.post('/confirmations/:id', async (c) => {
  const pendingId = check(Uuid, c.req.param('id'));
  const input = check(AnswerConfirmationRequest, await c.req.json());
  await underContext(c, async (tx, learnerId, now) => {
    const pending = await tx.maybeOne<{
      id: string;
      operation: 'delete_material' | 'delete_item';
      material_id: string;
      item_id: string | null;
      status: string;
      expires_at: Date;
    }>(
      `select id, operation, material_id, item_id, status, expires_at
         from buddy_pending_actions where id = $1 and learner_id = $2 for update`,
      [pendingId, learnerId],
    );
    if (!pending) throw new AppError('not_found', 'Nothing to answer');
    if (pending.status !== 'open')
      throw new AppError('conflict', 'This was answered already', { reason: 'already_answered' });
    if (pending.expires_at.getTime() <= now.getTime()) {
      await tx.query(
        `update buddy_pending_actions set status = 'expired', decided_at = $2 where id = $1`,
        [pendingId, now],
      );
      throw new AppError('conflict', 'This question is too old to answer now', {
        reason: 'expired',
      });
    }
    if (!input.confirm) {
      await tx.query(
        `update buddy_pending_actions set status = 'declined', decided_at = $2 where id = $1`,
        [pendingId, now],
      );
      return;
    }
    // The same erasure the library button plans, not a second half-done path.
    const inTx = { db: tx, now: () => now };
    if (pending.operation === 'delete_material') {
      await archiveMaterial(inTx, learnerId, pending.material_id);
    } else if (pending.item_id) {
      await archiveMaterialItem(inTx, learnerId, pending.material_id, pending.item_id);
    }
    await tx.query(
      `update buddy_pending_actions set status = 'confirmed', decided_at = $2 where id = $1`,
      [pendingId, now],
    );
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});

buddyRoutes.post('/goals/:id/outcome', async (c) => {
  const goalId = check(Uuid, c.req.param('id'));
  const { outcome } = await readBody(c, z.object({ outcome: z.enum(['good', 'ok', 'hard']) }));
  const deps = depsOf(c);
  await underContext(c, async (tx, learnerId) => {
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
  await underContext(c, async (tx, learnerId, now) => {
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

// A button on one of Buddy's notifications (gaps #16; docs/architecture.md §Delivery). Code
// decides what each does; the app only reports which was pressed (rule 5). Repeating one is
// harmless. "Seltener schreiben" only reduces contact, so it needs no PIN (rule 6).
buddyRoutes.post('/outreach/:id/act', async (c) => {
  const outreachId = check(Uuid, c.req.param('id'));
  const { action } = await readBody(c, OutreachActionRequest);
  const deps = depsOf(c);
  const learner = c.get('learner');
  const now = deps.now();
  const outreach = await deps.db.tx(async (tx) => {
    await lockContext(tx, learner.id);
    const settings = await loadSettings(tx, learner.id);
    const o = await tx.maybeOne<{ id: string; step_id: string | null }>(
      `update buddy_outreach
          set response = $3,
              responded_at = coalesce(responded_at, $4),
              -- Only "Jetzt üben" opens the app: the other buttons are answered from the lock screen.
              opened_at = case when $5 then coalesce(opened_at, $4) else opened_at end
        where id = $1 and learner_id = $2 returning id, step_id`,
      [
        outreachId,
        learner.id,
        { practice_now: 'start', not_today: 'not_now', less_often: 'less' }[action],
        now,
        action === 'practice_now',
      ],
    );
    if (!o) throw new AppError('not_found', 'Message not found');
    if (action === 'not_today') {
      // Its practice moves to tomorrow (when still open), and Buddy's own messages planned
      // for the rest of her day are not sent. Agreed reminders stay.
      const open = o.step_id
        ? await tx.maybeOne(
            `select 1 from buddy_steps where id = $1 and state in ('planned','prepared')`,
            [o.step_id],
          )
        : null;
      if (open && o.step_id) await stepAsideUntilTomorrow(tx, learner.id, o.step_id, settings, now);
      const tomorrow = addDays(localParts(now, settings.timezone).date, 1);
      await tx.query(
        `update buddy_outreach set status = 'cancelled', status_reason = 'not_today'
          where learner_id = $1 and status = 'scheduled' and origin = 'buddy' and send_at < $2`,
        [learner.id, zonedToInstant(tomorrow, '00:00', settings.timezone)],
      );
    }
    if (action === 'less_often' && !settings.phone_only_important) {
      await tx.query(
        `update buddy_settings set phone_only_important = true, version = version + 1
          where learner_id = $1`,
        [learner.id],
      );
      // Said in the thread, so she sees what changed and where to change it back.
      await tx.query(
        `insert into buddy_messages (learner_id, role, text, created_at) values ($1, 'buddy', $2, $3)`,
        [learner.id, t(learner.locale, 'contact.less_often'), now],
      );
    }
    await bumpContext(tx, learner.id);
    return o;
  });
  let sessionId: string | null = null;
  if (action === 'practice_now' && outreach.step_id) {
    try {
      sessionId = await startFromStep(deps, learner.id, outreach.step_id);
    } catch (err) {
      // Done or gone meanwhile: the app opens Buddy instead.
      if (!isAppError(err)) throw err;
    }
  }
  const body: OutreachActionResponse = { session_id: sessionId };
  return c.json(body);
});

// ─────────────── memory ───────────────

/**
 * How long "Rückgängig" still works after a note was removed (issue #133 position 12).
 * Long enough to read the message and change your mind, short enough that removing a
 * note is still removing it.
 */
const UNRETRACT_WINDOW_MINUTES = 5;

buddyRoutes.get('/memory', async (c) => {
  const deps = depsOf(c);
  const rows = await deps.db.query<{
    id: string;
    kind: 'fact' | 'preference' | 'goal' | 'constraint';
    statement: string;
    source: 'learner_stated' | 'learner_edited' | 'account_holder' | 'consolidated';
    quote: string | null;
    valid_until: Date | null;
    created_at: Date;
    version: number;
  }>(
    `select id, kind, statement, source, quote, valid_until, created_at, version from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)
      order by created_at desc, seq desc`,
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
  const editor = actorOf(c) === 'account_holder' ? 'account_holder' : 'learner_edited';
  await underContext(c, async (tx, learnerId, now) => {
    // The undo reaches for the entry it just removed, every other change for a live one.
    const wanted = 'unretract' in input ? 'retracted' : 'active';
    const current = await tx.maybeOne<{
      id: string;
      kind: string;
      valid_until: Date | null;
      version: number;
      closed_at: Date | null;
    }>(
      `select id, kind, valid_until, version, closed_at from buddy_memories
        where id = $1 and learner_id = $2 and status = $3 for update`,
      [memoryId, learnerId, wanted],
    );
    if (!current) throw new AppError('not_found', 'Memory not found');
    if (current.version !== input.version)
      throw new AppError('stale', 'This changed meanwhile; reload');
    if ('unretract' in input) {
      // An undo is a second thought, not a way back into something removed last week.
      const closed = current.closed_at?.getTime() ?? 0;
      if (now.getTime() - closed > UNRETRACT_WINDOW_MINUTES * 60_000)
        throw new AppError('not_found', 'That removal can no longer be taken back');
      await tx.query(
        `update buddy_memories set status = 'active', closed_at = null, version = version + 1
          where id = $1`,
        [memoryId],
      );
    } else if ('retract' in input) {
      await tx.query(
        `update buddy_memories set status = 'retracted', closed_at = $2, version = version + 1
          where id = $1`,
        [memoryId, now],
      );
    } else {
      await tx.query(
        `update buddy_memories set status = 'superseded', closed_at = $2, version = version + 1
          where id = $1`,
        [memoryId, now],
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

// ─────────────── settings: contact and Buddy's voice ───────────────

/** Her settings as the app sees them, and what this device and this server can do with them. */
function settingsView(c: AppContext, s: SettingsRow): BuddySettingsView {
  return {
    contact_enabled: s.contact_enabled,
    quiet_start: s.quiet_start,
    quiet_end: s.quiet_end,
    preferred_start: s.preferred_start,
    preferred_end: s.preferred_end,
    avoid_weekdays: s.avoid_weekdays,
    paused_until: s.paused_until ? s.paused_until.toISOString() : null,
    only_important: s.phone_only_important,
    timezone: s.timezone,
    voice: s.voice,
    natural_voice: readsIn(depsOf(c).speech, c.get('learner').locale),
    version: s.version,
    can_loosen: hasAccountHolderRights(c),
  };
}

buddyRoutes.get('/settings', async (c) => {
  const s = await loadSettings(depsOf(c).db, c.get('learner').id);
  return c.json(settingsView(c, s));
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
      paused_until:
        input.paused_until === undefined
          ? before.paused_until
          : input.paused_until
            ? new Date(input.paused_until)
            : null,
      phone_only_important: input.only_important ?? before.phone_only_important,
      // Buddy's voice, picked with a tap (ADR 0008 §Amendment). Buddy's context names it, so
      // the change moves the context on like every setting here (rule 4).
      voice: input.voice ?? before.voice,
    };
    if (after.preferred_start >= after.preferred_end) {
      throw new AppError('invalid_input', 'The preferred window must start before it ends');
    }
    const by = loosens(before, after, now) ? assertAccountHolder(c) : actorOf(c);
    // Every setting here is part of Buddy's context (rule 4); the row is locked above, and
    // `returning *` below carries the new context version.
    await bumpContext(tx, learnerId);
    const row = await tx.one<SettingsRow>(
      `update buddy_settings
          set contact_enabled = $2, quiet_start = $3, quiet_end = $4, preferred_start = $5, preferred_end = $6,
              avoid_weekdays = $7, paused_until = $8, phone_only_important = $11, voice = $12,
              contact_changed_by = case when contact_enabled <> $2 then $9::text else contact_changed_by end,
              contact_changed_at = case when contact_enabled <> $2 then $10::timestamptz else contact_changed_at end,
              version = version + 1
        where learner_id = $1 returning *`,
      [
        learnerId,
        after.contact_enabled,
        after.quiet_start,
        after.quiet_end,
        after.preferred_start,
        after.preferred_end,
        after.avoid_weekdays,
        after.paused_until,
        by,
        now,
        after.phone_only_important,
        after.voice,
      ],
    );
    if (!row.contact_enabled || (row.paused_until && row.paused_until > now)) {
      // Nothing Buddy queued on its own is sent later in bulk. A reminder she agreed to (and
      // the answer to her own action) stays: at its time it waits in the app (D-13, H-37 1B).
      await tx.query(
        `update buddy_outreach set status = 'cancelled', status_reason = $2
          where learner_id = $1 and status = 'scheduled' and origin = 'buddy'`,
        [learnerId, row.contact_enabled ? 'paused' : 'contact_disabled'],
      );
    }
    if (before.contact_enabled && !row.contact_enabled) {
      // A "no" is at least a "not now": the home does not ask again right away (audit M-62).
      await tx.query(
        `update buddy_settings set opt_in_prompt_hidden_until = $2 where learner_id = $1`,
        [learnerId, new Date(now.getTime() + 14 * 86_400_000)],
      );
    }
    return row;
  });
  return c.json(settingsView(c, result));
});

// ─────────────── push devices ───────────────

buddyRoutes.post('/push-tokens', async (c) => {
  const input = await readBody(c, RegisterPushTokenRequest);
  await registerPushToken(depsOf(c), c.get('learner').id, input);
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
