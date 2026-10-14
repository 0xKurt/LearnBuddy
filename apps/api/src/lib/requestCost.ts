// Where one request's time went: database round trips and model calls (issue #626).
//
// The `[timing]` line (http/timing.ts, #447) says when a request reached its milestones. It did
// not say what the server waited for in between, and only streamed calls wrote it — so a slow
// "Prüfen" on the phone could not be split into the way there, the database and the model. Every
// request now carries one meter for its lifetime (AsyncLocalStorage: the code it runs needs no
// extra parameter), the database seam and the model seam add to it, and the line and the
// `Server-Timing` header read it at the end.
//
// A stopwatch, not the app clock (rule 7): nothing is decided by it and nothing is stored.
// Work a request starts in the background and that outlives it adds to a meter nobody reads.

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestCost = { dbQueries: number; dbMs: number; modelCalls: number; modelMs: number };

const store = new AsyncLocalStorage<RequestCost>();

/** Runs `fn` with a fresh meter that the database and model seams below add to. */
export function withRequestCost<T>(fn: () => Promise<T>): { cost: RequestCost; done: Promise<T> } {
  const cost: RequestCost = { dbQueries: 0, dbMs: 0, modelCalls: 0, modelMs: 0 };
  return { cost, done: store.run(cost, fn) };
}

/** Times `run` and adds it to the current request's meter under `kind`; outside a request, runs it. */
async function timed<T>(kind: 'db' | 'model', run: () => Promise<T>): Promise<T> {
  const m = store.getStore();
  if (!m) return run();
  const t0 = performance.now();
  try {
    return await run();
  } finally {
    const ms = performance.now() - t0;
    if (kind === 'db') {
      m.dbQueries++;
      m.dbMs += ms;
    } else {
      m.modelCalls++;
      m.modelMs += ms;
    }
  }
}

/** Times `run` as a database round trip of the current request. */
export const timedQuery = <T>(run: () => Promise<T>): Promise<T> => timed('db', run);

/** Times `run` as a model (or embedding) call of the current request, retries included. */
export const timedModel = <T>(run: () => Promise<T>): Promise<T> => timed('model', run);

/** "db=12/38ms model=1/1187ms" — counts and milliseconds, nothing else (logs carry no details). */
export function costLine(c: RequestCost): string {
  return `db=${c.dbQueries}/${Math.round(c.dbMs)}ms model=${c.modelCalls}/${Math.round(c.modelMs)}ms`;
}
