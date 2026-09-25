// Where the outbox lives in the browser: localStorage (may be unavailable, e.g. private mode).
const KEY = 'lb.outbox.v1';

export async function readOutbox(): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export async function writeOutbox(value: string | null): Promise<void> {
  try {
    if (value === null) globalThis.localStorage?.removeItem(KEY);
    else globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // Unavailable: the answer is still being sent right now.
  }
}
