// One guarded material action; caller's ref also owns deletion serialization (#548).
import { useRef, useState, type MutableRefObject } from 'react';
import { toast } from '../../components/lb/Toast.js';
import { ApiError } from './client.js';
import { keys, queryClient } from './queries.js';
import { messageFor } from '../errors.js';

export function useMaterialAct(shared?: MutableRefObject<boolean>) {
  const own = useRef(false);
  const acting = shared ?? own;
  const [busyId, setBusyId] = useState<string | null>(null);
  async function act(id: string, run: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    setBusyId(id);
    try {
      await run();
    } catch (err) {
      toast.show(messageFor(err), 'error');
      if (err instanceof ApiError && (err.code === 'conflict' || err.code === 'not_found')) {
        void queryClient.invalidateQueries({ queryKey: keys.library });
        void queryClient.invalidateQueries({ queryKey: keys.home });
      }
    } finally {
      acting.current = false;
      setBusyId(null);
    }
  }
  return { busyId, act };
}
