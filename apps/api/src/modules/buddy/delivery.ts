// Outreach: from a proposal to honest delivery evidence. docs/architecture.md §Delivery.
//
//   planOutreach      policy decides schedule/suppress; row records why
//   sendDueOutreach   runs the whole contact policy again at send time, then pushes; the
//                     text also appears in the Buddy thread so it is never lost
//   checkReceipts     turns Expo tickets into provider receipts (15 min–24 h)
//
// Status never claims more than the provider confirmed: `accepted` means
// Expo took it, `provider_accepted` means Apple/Google took it, and only the
// app can mark it opened. An unknown send outcome is `send_uncertain` and is
// never retried automatically.
//
// Promises that hold on every path (audit I-10, N-3):
//   - A reminder the learner agreed to always reaches the thread — also when contact is
//     off or paused, quiet hours moved over it, or the scheduler ran late ("late" copy).
//   - Buddy's answer to her own action (origin 'learner') always reaches the thread.
//   - Messages in the app are never limited or counted (ADR 0006). Whatever cannot go to the
//     phone (contact off, paused, no allowed time) waits in the app; only a low relevance or a
//     topic Buddy already raised drops Buddy's own message.
//   - The lock screen shows a fixed text per kind, never a title, a count or a score (S-6);
//     the words about her are only in the app.
//   - Words that depend on the day ("Morgen ist …") are rendered when they are delivered.
//   - Every status write of a claimed row is fenced by its claim, so a slow worker can never
//     overwrite (or send) a row another run already settled.

import { PUSH_CATEGORY } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { consentCurrentSql } from '../scheduler/jobs.js';
import type { Db } from '../../lib/db.js';
import { daysBetween, localParts, weekdayOf } from '../../lib/time.js';
import { DEFAULT_TIMEZONE, learnerZoneSql } from '../../lib/zone.js';
import { dayLabel, t, type MessageKey } from '../../i18n/index.js';
import {
  PushRejectedError,
  PushUncertainError,
  type PushMessage,
  type PushTicket,
} from '../../push/transport.js';
import { inAppNow } from './inApp.js';
import { bumpContext } from './plan.js';
import { decideContact, IN_APP_REASONS, type PastContact } from './policy.js';
import type { SettingsRow } from './state.js';

type OutreachOrigin = 'agreed' | 'buddy' | 'learner';

/**
 * A text rendered when it is shown, not when it is planned: `key` with `params` (and the
 * relative day of `due_date` as {{day}}), and for an agreed reminder the time it was agreed
 * for (`agreed_at`), so a late one says so.
 */
export type BodyTemplate = {
  key?: MessageKey;
  params?: Record<string, string | number>;
  due_date?: string;
  agreed_at?: string;
};

export type OutreachPlanInput = {
  learnerId: string;
  settings: SettingsRow;
  now: Date;
  decisionId: string | null;
  origin: OutreachOrigin;
  kind: 'idea' | 'reminder' | 'checkin' | 'result';
  topicKey: string;
  dedupeKey: string;
  title: string;
  body: string;
  why: string | null;
  relevance: number | null;
  earliest: Date;
  expiresAt: Date;
  goalId: string | null;
  stepId: string | null;
  template?: BodyTemplate | null;
};

export type OutreachPlan = {
  id: string | null;
  status: 'scheduled' | 'suppressed' | 'in_app';
  reason: string | null;
  sendAt: Date | null;
};

/**
 * Statuses of a message Buddy said (or will say), in the app too: the same topic is not
 * raised again within 72 hours (policy.ts). Nothing is counted against a limit.
 */
const SAID = ['scheduled', 'sending', 'accepted', 'provider_accepted', 'send_uncertain', 'in_app'];

/** A late agreed reminder says so when it is more than this late. */
const LATE_MS = 15 * 60_000;

export async function contactHistory(db: Db, learnerId: string, now: Date): Promise<PastContact[]> {
  const rows = await db.query<{ id: string; topic_key: string; at: Date }>(
    `select id, topic_key, coalesce(sent_at, send_at, created_at) as at
       from buddy_outreach
      where learner_id = $1 and status = any($2::text[])
        -- Her own action's result is not an initiative (policy.ts).
        and origin <> 'learner'
        and coalesce(sent_at, send_at, created_at) > $3::timestamptz - interval '8 days'`,
    [learnerId, SAID, now],
  );
  return rows.map((r) => ({ id: r.id, at: r.at, topicKey: r.topic_key }));
}

export async function planOutreach(db: Db, input: OutreachPlanInput): Promise<OutreachPlan> {
  const history = await contactHistory(db, input.learnerId, input.now);
  const decision = decideContact(
    input.settings,
    {
      origin: input.origin,
      topicKey: input.topicKey,
      relevance: input.relevance,
      earliest: input.earliest,
      expiresAt: input.expiresAt,
    },
    history,
    input.now,
  );
  // Not to the phone is not "not at all": it waits in the app (ADR 0006).
  const inApp = decision.kind === 'suppress' && IN_APP_REASONS.includes(decision.reason);
  // Due now while she is in the app: shown there at once, with the change it is about (the
  // card of a practice it prepared), not a delivery run later — the same rule the delivery
  // applies (sendDueOutreach), so her answer never trails the card it belongs to.
  const hereNow =
    decision.kind === 'schedule' &&
    decision.sendAt.getTime() - input.now.getTime() < 60_000 &&
    inAppNow(input.settings.last_seen_at, input.now);
  const status = hereNow
    ? 'in_app'
    : decision.kind === 'schedule'
      ? 'scheduled'
      : inApp
        ? 'in_app'
        : 'suppressed';
  const reason = hereNow ? 'learner_in_app' : decision.kind === 'suppress' ? decision.reason : null;
  const row = await db.maybeOne<{ id: string }>(
    `insert into buddy_outreach (learner_id, kind, origin, decision_id, goal_id, step_id, topic_key, dedupe_key,
                                 title, body, why, relevance, status, status_reason, send_at, expires_at,
                                 body_template, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     on conflict (learner_id, dedupe_key) do nothing
     returning id`,
    [
      input.learnerId,
      input.kind,
      input.origin,
      input.decisionId,
      input.goalId,
      input.stepId,
      input.topicKey,
      input.dedupeKey,
      input.title.slice(0, 80),
      input.body.slice(0, 240),
      input.why,
      input.relevance,
      status,
      reason,
      decision.kind === 'schedule' ? decision.sendAt : null,
      input.expiresAt,
      input.template ? JSON.stringify(input.template) : null,
      input.now,
    ],
  );
  if (row && status === 'in_app') {
    await postToThread(
      db,
      {
        id: row.id,
        learner_id: input.learnerId,
        body: input.body.slice(0, 240),
        body_template: input.template ?? null,
        decision_id: input.decisionId,
      },
      input.now,
    );
  }
  return {
    id: row?.id ?? null,
    status,
    reason,
    sendAt: decision.kind === 'schedule' && !hereNow ? decision.sendAt : null,
  };
}

type ClaimedOutreach = {
  id: string;
  learner_id: string;
  origin: OutreachOrigin;
  kind: 'idea' | 'reminder' | 'checkin' | 'result';
  title: string;
  body: string;
  body_template: BodyTemplate | null;
  topic_key: string;
  relevance: string | null;
  send_at: Date;
  expires_at: Date;
  step_id: string | null;
  goal_id: string | null;
  decision_id: string | null;
  locale: string;
  /** The claim: every later write of this run is conditioned on it. */
  lease_until: Date;
};

type ThreadCopy = Pick<ClaimedOutreach, 'id' | 'learner_id' | 'body' | 'decision_id'> & {
  body_template: BodyTemplate | null;
};

/** The words for the thread, rendered now (relative days, late agreed reminders). */
function renderBody(
  o: Pick<ThreadCopy, 'body' | 'body_template'>,
  locale: string,
  tz: string,
  now: Date,
): string {
  const tpl = o.body_template;
  if (!tpl) return o.body;
  const today = localParts(now, tz).date;
  let text = o.body;
  if (tpl.key) {
    const params: Record<string, string | number> = { ...(tpl.params ?? {}) };
    if (tpl.due_date) {
      params.day = dayLabel(locale, weekdayOf(tpl.due_date), daysBetween(today, tpl.due_date));
    }
    text = t(locale, tpl.key, params);
  }
  if (tpl.agreed_at) {
    const agreed = new Date(tpl.agreed_at);
    if (now.getTime() - agreed.getTime() > LATE_MS) {
      text = t(locale, 'reminder.late', { time: localParts(agreed, tz).time, text });
    }
  }
  return text;
}

/**
 * The message shows up in the Buddy thread when it becomes visible (sent or in-app), linked
 * to the decision that made it, so what Buddy did in the background is shown with its cards
 * and can be undone (audit M-55).
 */
async function postToThread(db: Db, o: ThreadCopy, now: Date): Promise<void> {
  const where = await db.one<{ locale: string; timezone: string }>(
    `select l.locale, ${learnerZoneSql('l.id', 2)} as timezone
       from learners l where l.id = $1`,
    [o.learner_id, DEFAULT_TIMEZONE],
  );
  await db.query(
    `insert into buddy_messages (learner_id, role, text, outreach_id, decision_id, created_at)
     select $1, 'buddy', $2, $3, $4, $5
      where not exists (select 1 from buddy_messages where outreach_id = $3)`,
    [o.learner_id, renderBody(o, where.locale, where.timezone, now), o.id, o.decision_id, now],
  );
  // What Buddy said is now part of what the next decision sees (CLAUDE.md rule 4).
  await bumpContext(db, o.learner_id);
}

type StatusFields = {
  reason?: string | null;
  ticketId?: string | null;
  sentAt?: Date | null;
  tokenId?: string | null;
  sendAt?: Date | null;
};

/**
 * Settles a claimed row — only while this run's claim still holds (status 'sending' with
 * the lease it set). Returns false when another run settled it meanwhile (audit
 * p2-delivery-status-writes-unfenced): then nothing is written and nothing is posted.
 */
async function settle(
  db: Db,
  o: Pick<ClaimedOutreach, 'id' | 'lease_until'>,
  status: string,
  fields: StatusFields = {},
): Promise<boolean> {
  const rows = await db.query(
    `update buddy_outreach
        set status = $2,
            status_reason = coalesce($3, status_reason),
            ticket_id = coalesce($4, ticket_id),
            sent_at = coalesce($5, sent_at),
            push_token_id = coalesce($6, push_token_id),
            send_at = coalesce($7, send_at),
            lease_until = null
      where id = $1 and status = 'sending' and lease_until = $8
      returning id`,
    [
      o.id,
      status,
      fields.reason ?? null,
      fields.ticketId ?? null,
      fields.sentAt ?? null,
      fields.tokenId ?? null,
      fields.sendAt ?? null,
      o.lease_until,
    ],
  );
  return rows.length === 1;
}

/** Settle as visible in the app, with its thread copy, in one transaction. */
async function settleInApp(
  deps: Deps,
  o: ClaimedOutreach,
  status: string,
  fields: StatusFields,
  now: Date,
): Promise<boolean> {
  return deps.db.tx(async (tx) => {
    if (!(await settle(tx, o, status, fields))) return false;
    await postToThread(tx, o, now);
    return true;
  });
}

/** The notification's buttons: practice ready (prepared, not done) or any other message. */
async function categoryOf(db: Db, stepId: string | null): Promise<string> {
  const ready = stepId
    ? await db.maybeOne(
        `select 1 from buddy_steps where id = $1 and kind = 'practice' and state = 'prepared'`,
        [stepId],
      )
    : null;
  return ready ? PUSH_CATEGORY.practice : PUSH_CATEGORY.message;
}

export type DeliveryStats = {
  sent: number;
  inApp: number;
  suppressed: number;
  failed: number;
  uncertain: number;
  deferred: number;
};

export async function sendDueOutreach(deps: Deps, limit = 50): Promise<DeliveryStats> {
  const now = deps.now();
  const stats: DeliveryStats = {
    sent: 0,
    inApp: 0,
    suppressed: 0,
    failed: 0,
    uncertain: 0,
    deferred: 0,
  };

  const claimed = await deps.db.tx(async (tx) => {
    // A crashed send may or may not have reached the provider: never resend — but the text
    // is always also in the thread (audit M-63 send-uncertain-lease-no-thread).
    const uncertain = await tx.query<ThreadCopy>(
      `update buddy_outreach set status = 'send_uncertain', status_reason = 'lease_expired', lease_until = null
        where status = 'sending' and lease_until < $1
        returning id, learner_id, body, body_template, decision_id`,
      [now],
    );
    for (const o of uncertain) await postToThread(tx, o, now);
    // A reminder she agreed to never silently expires: it waits in the app, saying it is
    // late (D-13, audit H-37 path 1C).
    const late = await tx.query<ThreadCopy>(
      `update buddy_outreach set status = 'in_app', status_reason = 'late'
        where status = 'scheduled' and expires_at <= $1 and origin <> 'buddy'
        returning id, learner_id, body, body_template, decision_id`,
      [now],
    );
    for (const o of late) await postToThread(tx, o, now);
    // Buddy's own stale proposals expire instead of piling up (e.g. after a pause).
    await tx.query(
      `update buddy_outreach set status = 'expired'
        where status = 'scheduled' and expires_at <= $1 and origin = 'buddy'`,
      [now],
    );
    return tx.query<ClaimedOutreach>(
      `with due as (
         select id from buddy_outreach
          where status = 'scheduled' and send_at <= $1
            -- No contact for an account that has not agreed to the current privacy text.
            and ${consentCurrentSql('buddy_outreach.learner_id', 3)}
          order by send_at, seq limit $2
          for update skip locked
       )
       update buddy_outreach o set status = 'sending', lease_until = $1 + interval '2 minutes'
         from due where o.id = due.id
       returning o.id, o.learner_id, o.origin, o.kind, o.title, o.body, o.body_template, o.topic_key,
                 o.relevance, o.send_at, o.expires_at, o.step_id, o.goal_id, o.decision_id, o.lease_until,
                 (select locale from learners where id = o.learner_id) as locale`,
      [now, limit, deps.config.CONSENT_VERSION],
    );
  });

  for (const o of claimed) {
    // What it refers to may be done already (practised early, test cancelled).
    const obsolete = await deps.db.maybeOne(
      `select 1
        where exists (select 1 from buddy_steps where id = $1 and state not in ('planned','prepared'))
           or exists (select 1 from buddy_goals where id = $2 and status <> 'active')`,
      [o.step_id, o.goal_id],
    );
    if (obsolete) {
      if (await settle(deps.db, o, 'cancelled', { reason: 'obsolete' })) stats.suppressed++;
      continue;
    }
    const settings = await deps.db.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1`,
      [o.learner_id],
    );
    // The whole policy again, as it is now: tightened rules (avoided days, a new window,
    // a pause, contact off) also hold for what was already queued (audit M-59) — then it
    // waits in the app instead. This row itself is not part of its history.
    const history = (await contactHistory(deps.db, o.learner_id, now)).filter((h) => h.id !== o.id);
    const again = decideContact(
      settings,
      {
        origin: o.origin,
        topicKey: o.topic_key,
        relevance: o.relevance === null ? null : Number(o.relevance),
        earliest: now,
        expiresAt: o.expires_at,
      },
      history,
      now,
    );
    if (again.kind === 'suppress') {
      if (IN_APP_REASONS.includes(again.reason)) {
        // Not to the phone now: it waits in the app (D-13, ADR 0006).
        if (await settleInApp(deps, o, 'in_app', { reason: again.reason }, now)) stats.inApp++;
      } else if (await settle(deps.db, o, 'suppressed', { reason: again.reason })) {
        stats.suppressed++;
      }
      continue;
    }
    if (again.sendAt.getTime() - now.getTime() >= 60_000) {
      if (await settle(deps.db, o, 'scheduled', { sendAt: again.sendAt, reason: 'deferred' }))
        stats.deferred++;
      continue;
    }
    // The learner is in the app right now: show it there instead of pushing.
    if (inAppNow(settings.last_seen_at, now)) {
      if (await settleInApp(deps, o, 'in_app', { reason: 'learner_in_app' }, now)) stats.inApp++;
      continue;
    }
    const token = deps.push.enabled
      ? await deps.db.maybeOne<{ id: string; token: string }>(
          `select id, token from push_tokens where learner_id = $1 and status = 'active'
            order by registered_at desc limit 1`,
          [o.learner_id],
        )
      : null;
    if (!token) {
      const reason = deps.push.enabled ? 'no_device' : 'push_disabled';
      if (await settleInApp(deps, o, 'in_app', { reason }, now)) stats.inApp++;
      continue;
    }

    // Still ours? A slower run must never send a row another run already settled.
    const mine = await deps.db.maybeOne(
      `select 1 from buddy_outreach where id = $1 and status = 'sending' and lease_until = $2`,
      [o.id, o.lease_until],
    );
    if (!mine) continue;
    // The lock screen gets a fixed text per kind: no title, count, score or name (S-6).
    // The buttons under it are chosen by code: "Jetzt üben" only for practice that is ready.
    const message: PushMessage = {
      to: token.token,
      title: t(o.locale, 'title.buddy'),
      body: t(o.locale, `push.${o.kind}`),
      data: { type: 'buddy_outreach', outreach_id: o.id },
      collapseId: o.topic_key.slice(0, 64),
      categoryId: await categoryOf(deps.db, o.step_id),
      expiresAt: o.expires_at,
    };
    let ticket: PushTicket | undefined;
    try {
      [ticket] = await deps.push.send([message]);
    } catch (err) {
      if (err instanceof PushRejectedError && err.retryAfterSeconds !== null) {
        const retryAt = new Date(now.getTime() + err.retryAfterSeconds * 1000);
        if (retryAt < o.expires_at) {
          if (await settle(deps.db, o, 'scheduled', { sendAt: retryAt, reason: 'provider_busy' }))
            stats.deferred++;
          continue;
        }
      }
      const uncertain = err instanceof PushUncertainError;
      const done = await settleInApp(
        deps,
        o,
        uncertain ? 'send_uncertain' : 'send_failed',
        {
          reason: uncertain ? 'no_answer' : 'rejected',
          tokenId: token.id,
          sentAt: uncertain ? now : null,
        },
        now,
      );
      if (done && uncertain) stats.uncertain++;
      else if (done) stats.failed++;
      continue;
    }
    await deps.db.tx(async (tx) => {
      if (ticket?.status === 'ok') {
        if (
          !(await settle(tx, o, 'accepted', {
            ticketId: ticket.id,
            sentAt: now,
            tokenId: token.id,
          }))
        )
          return;
        stats.sent++;
      } else {
        const error = ticket?.status === 'error' ? ticket.error : 'no_ticket';
        if (!(await settle(tx, o, 'send_failed', { reason: error, tokenId: token.id }))) return;
        if (error === 'DeviceNotRegistered') {
          await tx.query(
            `update push_tokens set status = 'invalid', invalid_reason = 'DeviceNotRegistered' where id = $1`,
            [token.id],
          );
        }
        stats.failed++;
      }
      await postToThread(tx, o, now);
    });
  }
  return stats;
}

/** Receipts are available ~15 minutes after sending and deleted after 24 hours (Expo docs). */
export async function checkReceipts(deps: Deps): Promise<{ checked: number; rejected: number }> {
  const now = deps.now();
  const due = await deps.db.query<{ id: string; ticket_id: string; push_token_id: string | null }>(
    `select id, ticket_id, push_token_id from buddy_outreach
      where status = 'accepted' and ticket_id is not null and receipt_checked_at is null
        and sent_at <= $1::timestamptz - interval '15 minutes'
        and sent_at > $1::timestamptz - interval '24 hours'
      limit 500`,
    [now],
  );
  if (due.length === 0) return { checked: 0, rejected: 0 };
  const receipts = await deps.push.receipts(due.map((d) => d.ticket_id));
  let rejected = 0;
  for (const d of due) {
    const r = receipts.get(d.ticket_id);
    if (!r) continue; // not available yet; try again next tick
    await deps.db.tx(async (tx) => {
      if (r.status === 'ok') {
        await tx.query(
          `update buddy_outreach set status = 'provider_accepted', receipt_checked_at = $2
            where id = $1 and status = 'accepted'`,
          [d.id, now],
        );
      } else {
        rejected++;
        await tx.query(
          `update buddy_outreach set status = 'provider_rejected', status_reason = $3, receipt_checked_at = $2
            where id = $1 and status = 'accepted'`,
          [d.id, now, r.error],
        );
        if (r.error === 'DeviceNotRegistered' && d.push_token_id) {
          await tx.query(
            `update push_tokens set status = 'invalid', invalid_reason = 'DeviceNotRegistered' where id = $1`,
            [d.push_token_id],
          );
        }
      }
    });
  }
  // Tickets older than 24 h without a receipt stay 'accepted' (unknown beyond that) — mark as checked.
  await deps.db.query(
    `update buddy_outreach set receipt_checked_at = $1
      where status = 'accepted' and receipt_checked_at is null and sent_at <= $1::timestamptz - interval '24 hours'`,
    [now],
  );
  return { checked: due.length, rejected };
}
