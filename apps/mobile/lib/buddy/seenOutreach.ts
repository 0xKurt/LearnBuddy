// Whether a message Buddy reached out with was really seen in her thread (#805): only what stood
// on screen counts, never that it was fetched (CLAUDE.md rule 5). The app reports each one once;
// the API keeps the first time (POST /buddy/outreach/:id/opened).

/** A box on the screen, in window coordinates. */
export type Box = { top: number; height: number };

/**
 * Shown: at least half of it inside the room the thread can be read in. A message taller than
 * that room counts once it fills half of it.
 */
export function shownEnough(row: Box, view: Box): boolean {
  if (row.height <= 0 || view.height <= 0) return false;
  const overlap =
    Math.min(row.top + row.height, view.top + view.height) - Math.max(row.top, view.top);
  return overlap >= Math.min(row.height, view.height) / 2;
}

/** Each message once per app run; one that could not be reported is tried again later. */
export function seenTracker(report: (id: string) => Promise<unknown>) {
  const done = new Set<string>();
  return {
    /** The messages that stand shown in `view` now are reported, each once. */
    check(view: Box, rows: ReadonlyArray<{ id: string; box: Box }>): void {
      for (const { id, box } of rows) {
        if (done.has(id) || !shownEnough(box, view)) continue;
        done.add(id);
        void report(id).catch(() => done.delete(id));
      }
    },
  };
}
