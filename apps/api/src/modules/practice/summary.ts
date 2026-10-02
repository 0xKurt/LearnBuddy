// The summary of a practice session: what the result screen and Buddy's home card both
// show (user feedback #3: one computation, so "Sitzt" and "Nochmal" never contradict).
// docs/architecture.md §Practice.

import { isStructuredKind, type PracticeSummary } from '@learnbuddy/shared-types/contracts';

import { noSingleSolution } from './evaluate.js';

/** One closed or open question of a session, as far as the summary needs it. */
export type SummaryRow = {
  topic: string | null;
  status: 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';
  first_try_correct: boolean | null;
  flagged_at?: Date | null;
  /** How the closing answer was given (issue #163); absent in rows written before it. */
  answered_by?: 'typed' | 'tapped' | 'spoken' | null;
  /** What kind of question it was: a free text says nothing about a topic (issue #197). */
  kind?: string | null;
};

/**
 * How many questions of a topic must have gone well before the summary names it as one
 * that went well (issue #155).
 *
 * One is not a topic. The external audit of 30.09. photographed the result screen calling
 * four topics settled after four answers — one question each. FSRS per question is not a
 * statement about "Brüche", and a child and a parent can read that as being ready for the
 * test. What the screen says now is what was observed today ("heute ohne Tipp"), and even
 * that needs more than a single question behind it (CLAUDE.md rule 5).
 */
export const ENOUGH_FOR_A_TOPIC = 2;

/**
 * The one summary of a session, used by the result screen and by Buddy's home card alike
 * (user feedback #3): a topic counts as having gone well when every closed question of it
 * was right at once AND there were at least `ENOUGH_FOR_A_TOPIC` of them; one that needed
 * help, was shown or missed makes it shaky — a single one is enough for that, because
 * saying something still needs work claims less than saying it is done. A topic is never
 * in both lists (topics are compared without case and outer spaces; the first spelling is
 * shown).
 */
export function summarize(items: readonly SummaryRow[]): PracticeSummary {
  // A question she took out as not fitting was neither answered nor shaky.
  const closed = items.filter((i) => i.status !== 'open' && !i.flagged_at);
  const byTopic = new Map<string, { name: string; shaky: boolean; shown: number }>();
  for (const i of closed) {
    const name = i.topic?.trim();
    if (!name) continue;
    // A free text she did not get right says nothing about the topic (issue #197). There was
    // no single right answer to miss, so missing it is not evidence of a gap — and naming a
    // weakness from a judgement nobody measured is exactly what rule 5 forbids. Got right, it
    // counts like any other question.
    const measured = i.status === 'correct' || !noSingleSolution({ kind: i.kind ?? '' });
    if (!measured) continue;
    const key = name.toLocaleLowerCase();
    const t = byTopic.get(key) ?? { name, shaky: false, shown: 0 };
    if (!(i.status === 'correct' && i.first_try_correct)) t.shaky = true;
    // A word she TAPPED from four of her own is recognition, and a class test asks her to
    // produce it (issue #163). It counts as answered and as right; it does not count
    // towards naming the topic as one that went well, or recognising four words would
    // read the same as writing them.
    // A structured item (an order, issue #228) is answered by tapping and by nothing else:
    // there tapping IS producing the answer, so it counts like typing.
    if (i.answered_by !== 'tapped' || isStructuredKind(i.kind ?? '')) t.shown += 1;
    byTopic.set(key, t);
  }
  const topics = [...byTopic.values()];
  // `answered` stays the plain count of questions she worked through: she DID write the free
  // text, and only the JUDGEMENT of it is withheld (issue #197). Leaving it out would
  // understate her work, which is a different kind of untrue.
  return {
    answered: closed.length,
    first_try: closed.filter((i) => i.status === 'correct' && i.first_try_correct).length,
    secure_topics: topics
      .filter((v) => !v.shaky && v.shown >= ENOUGH_FOR_A_TOPIC)
      .map((v) => v.name),
    shaky_topics: topics.filter((v) => v.shaky).map((v) => v.name),
  };
}
