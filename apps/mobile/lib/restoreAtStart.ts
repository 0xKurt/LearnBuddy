// What the app reads from the phone before its first screen (#716, Codex audit #10): her
// session, the language she chose with the welcome flags and the palette she picked (issue #29).
// None depends on another, so they are read side by side, not one after the other; a language or
// a palette that cannot be read leaves the default, never the start.

type Steps<S> = {
  loadSession: () => Promise<S>;
  restoreChosenLocale: () => Promise<void>;
  restoreTheme: () => Promise<void>;
};

/** Her session, once the language and the palette are applied too. */
export async function restoreAtStart<S>(steps: Steps<S>): Promise<S> {
  const [session] = await Promise.all([
    steps.loadSession(),
    steps.restoreChosenLocale().catch(() => undefined),
    steps.restoreTheme().catch(() => undefined),
  ]);
  return session;
}

type Hers = {
  restoreCache: (userId: string) => Promise<void>;
  adoptLocalWork: (userId: string) => Promise<void>;
};

/**
 * Signed in: her last conversation from the phone and whose answers and drafts are on it, side by
 * side (#716) — the cache is kept per person and the local work is the outbox and the drafts, so
 * neither waits for the other. Both finish before the first screen: no one else's drafts flash.
 * Resolves whether the local work is now proven hers: only then is it sent (#822 review).
 */
export async function restoreHers(userId: string, steps: Hers): Promise<boolean> {
  const [, adopted] = await Promise.all([
    steps.restoreCache(userId).catch(() => undefined),
    steps.adoptLocalWork(userId).then(
      () => true,
      () => false,
    ),
  ]);
  return adopted;
}
