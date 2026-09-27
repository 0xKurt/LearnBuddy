// The summary of a practice session: what the result screen and Buddy's home card both
// show (user feedback #3: one computation, so "Sitzt" and "Nochmal" never contradict).
// docs/architecture.md §Practice.

import type { PracticeSummary } from '@learnbuddy/shared-types/contracts';

/** One closed or open question of a session, as far as the summary needs it. */
export type SummaryRow = {
  topic: string | null;
  status: 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';
  first_try_correct: boolean | null;
  flagged_at?: Date | null;
};

/**
 * The one summary of a session, used by the result screen and by Buddy's home card alike
 * (user feedback #3): a topic "sits" only when every closed question of it was right at once;
 * one that needed help, was shown or missed makes it shaky. A topic is never in both lists
 * (topics are compared without case and outer spaces; the first spelling is shown).
 */
export function summarize(items: readonly SummaryRow[]): PracticeSummary {
  // A question she took out as not fitting was neither answered nor shaky.
  const closed = items.filter((i) => i.status !== 'open' && !i.flagged_at);
  const byTopic = new Map<string, { name: string; shaky: boolean }>();
  for (const i of closed) {
    const name = i.topic?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const t = byTopic.get(key) ?? { name, shaky: false };
    if (!(i.status === 'correct' && i.first_try_correct)) t.shaky = true;
    byTopic.set(key, t);
  }
  const topics = [...byTopic.values()];
  return {
    answered: closed.length,
    first_try: closed.filter((i) => i.status === 'correct' && i.first_try_correct).length,
    secure_topics: topics.filter((v) => !v.shaky).map((v) => v.name),
    shaky_topics: topics.filter((v) => v.shaky).map((v) => v.name),
  };
}
