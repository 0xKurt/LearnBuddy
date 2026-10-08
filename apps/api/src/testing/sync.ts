// Synchronisation for tests that run work concurrently. A test waits for a
// state it can observe, never for a fixed time: under load a sleep is too
// short and the test deadlocks or races (issue #465, Engineering-Regel 7).
// requires live verification in Claude Code session (holds scripted model calls)

/**
 * Holds a scripted model call until the test lets it go, and tells the test when
 * the call has arrived: the handler calls `markCalled()` then awaits `wait`; the
 * test awaits `called` before it starts what must overlap, then calls `release()`.
 */
export type Gate = {
  release: () => void;
  wait: Promise<void>;
  called: Promise<void>;
  markCalled: () => void;
};

export function gate(): Gate {
  const g = {} as Gate;
  g.wait = new Promise<void>((r) => (g.release = r));
  g.called = new Promise<void>((r) => (g.markCalled = r));
  return g;
}
