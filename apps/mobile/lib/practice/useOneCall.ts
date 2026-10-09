// One call to the server at a time, for a practice screen (the question, the card pass): busy
// while it runs, a second tap while one is on its way does nothing, and a failure is said in a
// toast. `onError` adds what one call undoes besides. Moved out of `app/practice/[id].tsx` and
// `CardPass` (issue #311), which each held the same guard.

import { useRef, useState } from 'react';

import { toast } from '../../components/lb/Toast.js';
import { messageFor } from '../errors.js';

/** Runs `work` unless a call is already on its way. */
export type RunOne = (work: () => Promise<void>, onError?: (err: unknown) => void) => Promise<void>;

export function useOneCall(): { busy: boolean; run: RunOne } {
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  async function run(work: () => Promise<void>, onError?: (err: unknown) => void): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await work();
    } catch (err) {
      onError?.(err);
      toast.show(messageFor(err), 'error');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
