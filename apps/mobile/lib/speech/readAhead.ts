// Which audio a practice run will need next (issue #59), so it can be fetched while she is still
// busy with this question (lib/speech/listen.ts `prepareReading`). Pure, unit-tested.

type Run = {
  status: string;
  mode: string;
  current_item_id: string | null;
  items: ReadonlyArray<{ item: { id: string }; status: string }>;
};

/**
 * The question most likely read after the one on screen: the next open one after it in the run,
 * else the first open one before it (a question she set aside comes back at the end). Null when
 * nothing else is open — then there is nothing to fetch.
 */
export function followingQuestion<R extends Run>(
  run: R,
  onScreenId: string | null,
): R['items'][number] | null {
  if (run.status !== 'active') return null;
  const at = onScreenId ? run.items.findIndex((i) => i.item.id === onScreenId) : -1;
  const open = (i: R['items'][number]) => i.status === 'open' && i.item.id !== onScreenId;
  return (
    run.items.slice(at + 1).find(open) ?? run.items.slice(0, Math.max(at, 0)).find(open) ?? null
  );
}

/**
 * The verdicts whose word opens Buddy's feedback (practice:verdict.*) and is worth having ready:
 * the three an answer usually gets. None in a running test — it says no verdict.
 */
export function verdictsToHaveReady(run: Run): readonly string[] {
  if (run.status !== 'active' || run.mode === 'test') return [];
  return ['correct', 'partially_correct', 'incorrect'];
}
