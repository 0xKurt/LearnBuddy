// Outreach: from a proposal to honest delivery evidence. docs/architecture.md §Delivery.
//
//   planOutreach      policy decides schedule/suppress; row records why
//   sendDueOutreach   re-checks the rules at send time, then pushes; the text
//                     also appears in the Buddy thread so it is never lost
//   checkReceipts     turns Expo tickets into provider receipts (15 min–24 h)
//
// Status never claims more than the provider confirmed: `accepted` means
// Expo took it, `provider_accepted` means Apple/Google took it, and only the
// app can mark it opened. An unknown send outcome is `send_uncertain` and is
// never retried automatically.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { inWindow, localParts, minutesOf } from '../../lib/time.js';
import {
  PushRejectedError,
  PushUncertainError,
  type PushMessage,
  type PushTicket,
} from '../../push/transport.js';
import { decideContact, type PastContact } from './policy.js';
import type { SettingsRow } from './state.js';

export type OutreachPlanInput = {
  learnerId: string;
  settings: SettingsRow;
  now: Date;
  decisionId: string | null;
  origin: 'agreed' | 'buddy';
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
  /**
   * Agreed reminders at their due time: when contact outside the app is off
   * or paused, the reminder still waits in the app (as Buddy promised).
   */
  inAppWhenOff?: boolean;
};

export type OutreachPlan = {
  id: string | null;
  status: 'scheduled' | 'suppressed' | 'in_app';
  reason: string | null;
  sendAt: Date | null;
};

/** Statuses that count as "Buddy contacted the learner" for caps and dedupe. */
const COUNTED = ['scheduled', 'sending', 'accepted', 'provider_accepted', 'send_uncertain'];

export async function contactHistory(db: Db, learnerId: string, now: Date): Promise<PastContact[]> {
  const rows = await db.query<{
    topic_key: string;
    origin: 'agreed' | 'buddy';
    at: Date;
    answered: boolean;
  }>(
    `select topic_key, origin, coalesce(sent_at, send_at) as at,
            (opened_at is not null or responded_at is not null) as answered
       from buddy_outreach
      where learner_id = $1 and status = any($2::text[])
        and coalesce(sent_at, send_at) > $3::timestamptz - interval '8 days'`,
    [learnerId, COUNTED, now],
  );
  return rows.map((r) => ({
    at: r.at,
    topicKey: r.topic_key,
    origin: r.origin,
    answered: r.answered,
  }));
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
  const inApp =
    decision.kind === 'suppress' &&
    input.inAppWhenOff === true &&
    (decision.reason === 'contact_disabled' || decision.reason === 'paused');
  const status = decision.kind === 'schedule' ? 'scheduled' : inApp ? 'in_app' : 'suppressed';
  const row = await db.maybeOne<{ id: string }>(
    `insert into buddy_outreach (learner_id, kind, origin, decision_id, goal_id, step_id, topic_key, dedupe_key,
                                 title, body, why, relevance, status, status_reason, send_at, expires_at,
                                 created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
      decision.kind === 'suppress' ? decision.reason : null,
      decision.kind === 'schedule' ? decision.sendAt : null,
      input.expiresAt,
      input.now,
    ],
  );
  if (row && status === 'in_app') {
    await postToThread(
      db,
      { id: row.id, learner_id: input.learnerId, body: input.body.slice(0, 240) },
      input.now,
    );
  }
  return {
    id: row?.id ?? null,
    status,
    reason: decision.kind === 'suppress' ? decision.reason : null,
    sendAt: decision.kind === 'schedule' ? decision.sendAt : null,
  };
}

type ClaimedOutreach = {
  id: string;
  learner_id: string;
  origin: 'agreed' | 'buddy';
  kind: string;
  title: string;
  body: string;
  topic_key: string;
  send_at: Date;
  expires_at: Date;
  step_id: string | null;
  goal_id: string | null;
};

/** The message shows up in the Buddy thread when it becomes visible (sent or in-app). */
async function postToThread(
  db: Db,
  o: Pick<ClaimedOutreach, 'id' | 'learner_id' | 'body'>,
  now: Date,
): Promise<void> {
  await db.query(
    `insert into buddy_messages (learner_id, role, text, outreach_id, created_at)
     select $1, 'buddy', $2, $3, $4
      where not exists (select 1 from buddy_messages where outreach_id = $3)`,
    [o.learner_id, o.body, o.id, now],
  );
  await db.query(
    `update buddy_settings set context_version = context_version + 1 where learner_id = $1`,
    [o.learner_id],
  );
}

async function setStatus(
  db: Db,
  id: string,
  status: string,
  fields: {
    reason?: string | null;
    ticketId?: string | null;
    sentAt?: Date | null;
    tokenId?: string | null;
    sendAt?: Date | null;
  } = {},
): Promise<void> {
  await db.query(
    `update buddy_outreach
        set status = $2,
            status_reason = coalesce($3, status_reason),
            ticket_id = coalesce($4, ticket_id),
            sent_at = coalesce($5, sent_at),
            push_token_id = coalesce($6, push_token_id),
            send_at = coalesce($7, send_at),
            lease_until = null
      where id = $1`,
    [
      id,
      status,
      fields.reason ?? null,
      fields.ticketId ?? null,
      fields.sentAt ?? null,
      fields.tokenId ?? null,
      fields.sendAt ?? null,
    ],
  );
}

const IN_APP_WINDOW_MS = 3 * 60_000;

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
    // A crashed send may or may not have reached the provider: never resend.
    await tx.query(
      `update buddy_outreach set status = 'send_uncertain', status_reason = 'lease_expired', lease_until = null
        where status = 'sending' and lease_until < $1`,
      [now],
    );
    // Stale proposals expire instead of piling up (e.g. after a pause).
    await tx.query(
      `update buddy_outreach set status = 'expired' where status = 'scheduled' and expires_at <= $1`,
      [now],
    );
    return tx.query<ClaimedOutreach>(
      `with due as (
         select id from buddy_outreach
          where status = 'scheduled' and send_at <= $1
          order by send_at limit $2
          for update skip locked
       )
       update buddy_outreach o set status = 'sending', lease_until = $1 + interval '2 minutes'
         from due where o.id = due.id
       returning o.id, o.learner_id, o.origin, o.kind, o.title, o.body, o.topic_key, o.send_at,
                 o.expires_at, o.step_id, o.goal_id`,
      [now, limit],
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
      await setStatus(deps.db, o.id, 'cancelled', { reason: 'obsolete' });
      stats.suppressed++;
      continue;
    }
    const settings = await deps.db.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1`,
      [o.learner_id],
    );
    // Rules may have changed since scheduling: re-check at send time.
    if (!settings.contact_enabled || (settings.paused_until && settings.paused_until > now)) {
      await setStatus(deps.db, o.id, 'suppressed', {
        reason: settings.contact_enabled ? 'paused' : 'contact_disabled',
      });
      stats.suppressed++;
      continue;
    }
    if (
      inWindow(
        minutesOf(localParts(now, settings.timezone).time),
        settings.quiet_start,
        settings.quiet_end,
      )
    ) {
      const history = await contactHistory(deps.db, o.learner_id, now);
      const again = decideContact(
        settings,
        {
          origin: o.origin,
          topicKey: `${o.topic_key}#resched`,
          relevance: 1,
          earliest: now,
          expiresAt: o.expires_at,
        },
        history.filter((h) => h.topicKey !== o.topic_key),
        now,
      );
      if (again.kind === 'schedule') {
        await setStatus(deps.db, o.id, 'scheduled', { sendAt: again.sendAt });
        stats.deferred++;
      } else {
        await setStatus(deps.db, o.id, 'expired', { reason: 'quiet_hours' });
        stats.suppressed++;
      }
      continue;
    }
    // The learner is in the app right now: show it there instead of pushing.
    if (
      settings.last_seen_at &&
      now.getTime() - settings.last_seen_at.getTime() < IN_APP_WINDOW_MS
    ) {
      await deps.db.tx(async (tx) => {
        await setStatus(tx, o.id, 'in_app', { reason: 'learner_in_app' });
        await postToThread(tx, o, now);
      });
      stats.inApp++;
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
      await deps.db.tx(async (tx) => {
        await setStatus(tx, o.id, 'in_app', {
          reason: deps.push.enabled ? 'no_device' : 'push_disabled',
        });
        await postToThread(tx, o, now);
      });
      stats.inApp++;
      continue;
    }

    const message: PushMessage = {
      to: token.token,
      title: o.title,
      body: o.body,
      data: { type: 'buddy_outreach', outreach_id: o.id },
      collapseId: o.topic_key.slice(0, 64),
    };
    let ticket: PushTicket | undefined;
    try {
      [ticket] = await deps.push.send([message]);
    } catch (err) {
      if (err instanceof PushRejectedError && err.retryAfterSeconds !== null) {
        const retryAt = new Date(now.getTime() + err.retryAfterSeconds * 1000);
        if (retryAt < o.expires_at) {
          await setStatus(deps.db, o.id, 'scheduled', { sendAt: retryAt, reason: 'provider_busy' });
          stats.deferred++;
          continue;
        }
      }
      const uncertain = err instanceof PushUncertainError;
      await deps.db.tx(async (tx) => {
        await setStatus(tx, o.id, uncertain ? 'send_uncertain' : 'send_failed', {
          reason: uncertain ? 'no_answer' : 'rejected',
          tokenId: token.id,
          sentAt: uncertain ? now : null,
        });
        await postToThread(tx, o, now);
      });
      if (uncertain) stats.uncertain++;
      else stats.failed++;
      continue;
    }
    await deps.db.tx(async (tx) => {
      if (ticket?.status === 'ok') {
        await setStatus(tx, o.id, 'accepted', {
          ticketId: ticket.id,
          sentAt: now,
          tokenId: token.id,
        });
        stats.sent++;
      } else {
        const error = ticket?.status === 'error' ? ticket.error : 'no_ticket';
        if (error === 'DeviceNotRegistered') {
          await tx.query(
            `update push_tokens set status = 'invalid', invalid_reason = 'DeviceNotRegistered' where id = $1`,
            [token.id],
          );
        }
        await setStatus(tx, o.id, 'send_failed', { reason: error, tokenId: token.id });
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
          `update buddy_outreach set status = 'provider_accepted', receipt_checked_at = $2 where id = $1`,
          [d.id, now],
        );
      } else {
        rejected++;
        await tx.query(
          `update buddy_outreach set status = 'provider_rejected', status_reason = $3, receipt_checked_at = $2
            where id = $1`,
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
