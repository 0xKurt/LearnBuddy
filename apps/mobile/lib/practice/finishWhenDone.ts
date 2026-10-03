// A run ends by itself once nothing is open (docs/architecture.md §Practice): the screen asks the
// server to finish it — once, while she may still be reading the last solution. Not while more
// questions are still being written (issue #220): she was faster than the generator, and ending
// the run would throw away the questions on their way (the server refuses it too; this only saves
// the call). Not a Kopfrechnen round: the server finishes it with its last answer (issue #243).

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';

import { toast } from '../../components/lb/Toast.js';
import { finishSession } from '../api/endpoints.js';
import { keys, queryClient } from '../api/queries.js';
import { messageFor } from '../errors.js';

export function useFinishWhenDone(
  id: string,
  session: SessionView | undefined,
  store: (next: SessionView) => Promise<void>,
): { finish: () => Promise<void>; finishFailed: boolean } {
  const [finishFailed, setFinishFailed] = useState(false);
  const started = useRef(false);
  const nothingOpen =
    session?.status === 'active' &&
    !session.preparing &&
    !session.drill &&
    session.items.every((i) => i.status !== 'open');

  async function finish(): Promise<void> {
    setFinishFailed(false);
    try {
      await store(await finishSession(id));
      void queryClient.invalidateQueries({ queryKey: keys.home });
    } catch (err) {
      toast.show(messageFor(err), 'error');
      setFinishFailed(true);
    }
  }

  useEffect(() => {
    if (!nothingOpen || started.current) return;
    started.current = true;
    void finish();
  }, [nothingOpen]);

  return { finish, finishFailed };
}
