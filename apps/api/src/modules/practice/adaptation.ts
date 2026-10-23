// Product heuristic, not a calibrated learning optimum (#872, docs/architecture.md §Practice).
// FSRS memory difficulty and the item's task difficulty (1–5) are separate quantities.

export type TopicResult = {
  subject_id: string | null;
  subject: string | null;
  topic: string;
  difficulty: number;
  correct: boolean;
  closed_at: Date;
};

export type TopicTarget = Pick<TopicResult, 'subject_id' | 'subject' | 'topic' | 'difficulty'>;

type Topic = { subject_id: string | null; topic: string | null };

/** Exact structured labels within one subject, never substring/word matching. */
function topicKey(row: Topic): string {
  return JSON.stringify([row.subject_id, row.topic?.trim().toLowerCase()]);
}

/** Newest distinct questions first, from the shared measured-result reader (#871). */
export function topicTargets(rows: readonly TopicResult[], now: Date): TopicTarget[] {
  const topics = new Map<string, TopicResult[]>();
  const since = now.getTime() - 30 * 86_400_000;
  for (const row of rows) {
    if (row.closed_at.getTime() < since || row.closed_at > now) continue;
    const key = topicKey(row);
    const group = topics.get(key) ?? [];
    if (group.length < 10) group.push(row);
    topics.set(key, group);
  }
  return [...topics.values()].flatMap((group) => {
    if (group.length < 5) return [];
    const hits = group.filter((r) => r.correct).length / group.length;
    const step = hits < 0.6 ? -1 : hits >= 0.9 ? 1 : 0;
    if (step === 0) return [];
    const levels = group.map((r) => r.difficulty).sort((a, b) => a - b);
    const mid = Math.floor(levels.length / 2);
    const median = (levels[mid]! + levels[Math.ceil(levels.length / 2) - 1]!) / 2;
    return [{ ...group[0]!, difficulty: Math.max(1, Math.min(5, Math.round(median) + step)) }];
  });
}

type Candidate = Topic & {
  difficulty: number;
  due: Date | null;
  reviewed: boolean;
  task: string | null;
};

/** Input has already been grouped by wholeTasksFirst; move tasks only as whole blocks. */
export function adaptPractice<C extends Candidate>(
  pool: readonly C[],
  targets: readonly TopicTarget[],
  now: Date,
): C[] {
  const blocks: C[][] = [];
  for (const row of pool) {
    const last = blocks.at(-1);
    if (row.task !== null && last?.[0]?.task === row.task) last.push(row);
    else blocks.push([row]);
  }
  const topic = (block: C[]) => {
    const head = block[0]!;
    return head.topic?.trim() && block.every((r) => topicKey(r) === topicKey(head))
      ? topicKey(head)
      : null;
  };
  const tier = (row: C) => (row.due && row.due <= now ? 0 : row.reviewed ? 2 : 1);
  const levels = new Map(targets.map((t) => [topicKey(t), t.difficulty]));
  // Keep topic/priority slots: a strong topic cannot displace another topic's due review.
  const groups = new Map<string, C[][]>();
  const groupKey = (block: C[]) => JSON.stringify([topic(block), tier(block[0]!)]);
  for (const block of blocks) {
    if (!levels.has(topic(block) ?? '')) continue;
    const key = groupKey(block);
    const group = groups.get(key) ?? [];
    group.push(block);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const target = levels.get(topic(group[0]!)!)!;
    const distance = (block: C[]) =>
      block.reduce((sum, row) => sum + Math.abs(row.difficulty - target), 0) / block.length;
    group.sort((a, b) => distance(a) - distance(b));
  }
  const ranked = blocks.map((block) => groups.get(groupKey(block))?.shift() ?? block);
  // Only due, known-topic blocks alternate; new/unknown questions keep their slots.
  const reviews = ranked.filter((block) => tier(block[0]!) === 0 && topic(block) !== null);
  let previous: string | null = null;
  return ranked.flatMap((block) => {
    if (tier(block[0]!) !== 0 || topic(block) === null) return block;
    const index = reviews.findIndex((candidate) => topic(candidate) !== previous);
    const next = reviews.splice(Math.max(0, index), 1)[0]!;
    previous = topic(next);
    return next;
  });
}
