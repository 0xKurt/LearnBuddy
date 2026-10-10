// Looking back: visible progress without pressure (gaps.md #7; docs/architecture.md
// §Proactivity, "Looking back"). Buddy sometimes names in the chat what now sits that
// was still shaky some days ago ("Vor einer Woche war Brüche erweitern noch wacklig –
// jetzt sitzt es.").
//
// Code decides WHEN and ABOUT WHAT, from real data; the model only phrases it (and may
// leave it out). Rules:
//   * only after a finished practice or before a test (the check triggers
//     session_finished / exam_countdown), never in an ordinary chat turn;
//   * rare: at most one look-back per GAP_DAYS;
//   * honest: what sits now and was shaky some days ago is the domain's to find, from its own
//     rows (its context provider's `lookBack`, issue #107; LearnBuddy: learning/lookback.ts);
//   * only what was reached: never what is still open, never numbers, never missed days
//     (CLAUDE.md rule 6). It stays in the app — never on the lock screen.

import type { Db } from '../../lib/db.js';
import { daysBetween, localParts } from '../../lib/time.js';
import { contextProvider } from './provider.js';

/** At most one look-back in this many days. */
const GAP_DAYS = 7;

/** The alias the model uses for the one look-back it is offered. */
const LOOK_BACK_ALIAS = 'p1';

/** The triggers after which Buddy may look back. */
export const LOOK_BACK_TRIGGERS: ReadonlySet<string> = new Set([
  'session_finished',
  'exam_countdown',
]);

export type LookBackFact = {
  subjectId: string | null;
  subjectName: string | null;
  topic: string;
  topicKey: string;
  /** The last time the topic was shaky. */
  shakyAt: Date;
  /** Whole days between then and today, in the learner's zone. */
  shakyDaysAgo: number;
};

/** A topic that sits now, as the domain found it. */
export type LookBackCandidate = {
  subject_id: string | null;
  subject_name: string | null;
  topic: string;
  topic_key: string;
  /** The last time the topic was shaky. */
  shaky_at: Date;
};

export type LookBackFocus = {
  /** The session that was just finished: its topics come first. */
  sessionId: string | null;
  /** The subject of the test ahead: only its topics (when it has one). */
  subjectId: string | null;
};

const DAY_MS = 86_400_000;

/**
 * The one topic Buddy may look back on now, or null: none within GAP_DAYS of the last one,
 * else the one the domain finds (deterministically, from its own rows).
 */
export async function findLookBack(
  db: Db,
  learnerId: string,
  now: Date,
  timezone: string,
  focus: LookBackFocus,
): Promise<LookBackFact | null> {
  const recent = await db.maybeOne(
    `select 1 from buddy_lookbacks where learner_id = $1 and said_at > $2`,
    [learnerId, new Date(now.getTime() - GAP_DAYS * DAY_MS)],
  );
  if (recent) return null;

  const row = await contextProvider().lookBack(db, learnerId, now, focus);
  if (!row) return null;
  return {
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    topic: row.topic,
    topicKey: row.topic_key,
    shakyAt: row.shaky_at,
    shakyDaysAgo: daysBetween(
      localParts(row.shaky_at, timezone).date,
      localParts(now, timezone).date,
    ),
  };
}

/** The fact as the model sees it (after the triggers). */
export function describeLookBack(fact: LookBackFact): string {
  const subject = fact.subjectName ? ` (${fact.subjectName})` : '';
  return [
    `LOOK BACK (optional, shown only in the app): ${LOOK_BACK_ALIAS} = the topic "${fact.topic}"${subject} was still shaky in a practice ${fact.shakyDaysAgo} days ago; now every question of it she practised was right at once.`,
    `If it fits this moment, name this progress in "look_back" (fact "${LOOK_BACK_ALIAS}"): one short, warm sentence in the learner's language that says roughly when it was shaky and that it sits now — no numbers of questions, no scores, nothing still open, no pressure. Otherwise look_back null.`,
  ].join('\n');
}

/**
 * Code-enforced: a look-back only about the fact offered, and only with disposition
 * "act" (it is a message in the app). Returns the reasons to repair.
 */
export function lookBackErrors(
  d: { disposition: 'act' | 'wait'; look_back?: { fact: string } | null },
  offered: LookBackFact | null,
): string[] {
  if (!d.look_back) return [];
  if (!offered) return ['look_back: there is nothing to look back on now; set look_back to null'];
  if (d.look_back.fact !== LOOK_BACK_ALIAS)
    return [`look_back.fact: the only fact offered is "${LOOK_BACK_ALIAS}"`];
  if (d.disposition === 'wait') return ['disposition "wait" must have no look_back'];
  return [];
}
