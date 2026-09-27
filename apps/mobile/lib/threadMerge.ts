// The conversation as history shows it: older pages loaded on request plus the live window
// of the home (its newest messages, polled). The window slides while Buddy writes, so the
// pages are merged by message id — a newer copy of a message replaces the older one — and
// ordered by time, never concatenated: a message that slid out of the window between two
// polls is kept, not lost (audit M-75, repro-25).

type Keyed = { id: string; created_at: string };

/** Every message of `known` and `incoming` once, oldest first (the incoming copy wins). */
export function mergeThread<M extends Keyed>(known: readonly M[], incoming: readonly M[]): M[] {
  const byId = new Map<string, M>();
  const order: string[] = [];
  for (const m of [...known, ...incoming]) {
    if (!byId.has(m.id)) order.push(m.id);
    byId.set(m.id, m);
  }
  const rank = new Map(order.map((id, n) => [id, n]));
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    return ta !== tb ? ta - tb : (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);
  });
}
