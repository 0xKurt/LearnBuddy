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

/** Any other small value the app keeps on the device (install id, push reports). */
export async function readItem(key: string): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function writeItem(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Unavailable: kept for this run only.
  }
}
