// How a practice run ends on its screen (docs/architecture.md §Practice, decision D-5, audit H-8,
// M-36). The server finishes a run when its last question closes (`useFinishWhenDone`); a test
// she sat with time is handed in once its time is up and no answer is on its way (issue #241).
// "Beenden" with questions still open goes back to Buddy and keeps the run to go on with (home
// card, the sheet); in a test it hands the test in and shows the review right here. On the way
// out Buddy's home is refreshed: it shows this run (questions left, the result). Moved out of
// `app/practice/[id].tsx` (issue #311).

import type { SessionView } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { toast } from '../../components/lb/Toast.js';
import { keys, queryClient } from '../api/queries.js';
import { messageFor } from '../errors.js';
import { handInRun, useFinishWhenDone } from './finishWhenDone.js';

export function backToBuddy(): void {
  // Pops back to Buddy when it is below in the stack, otherwise replaces this
  // screen with it (router.replace would leave a second Buddy on the stack).
  router.dismissTo('/buddy');
}

type Deps = {
  id: string;
  session: SessionView | undefined;
  store: (next: SessionView) => Promise<void>;
  /** An answer is on its way: a test whose time is up waits for it. */
  busy: boolean;
  /** Keeps a question on screen (null: none — the review comes). */
  pin: (itemId: string | null) => void;
};

export function useSessionEnd({ id, session, store, busy, pin }: Deps) {
  const [closing, setClosing] = useState(false);
  /**
   * A test she sat with time has run out on this screen (issue #241). The questions go away at
   * once and the test is handed in as soon as no answer is on its way — an answer she sent at
   * the last second is still graded (the server allows for the network).
   */
  const [timeUp, setTimeUp] = useState(false);
  // The session ran here while the screen was open: its end is a moment (SessionSummary).
  const sawActive = useRef(false);
  if (session?.status === 'active') sawActive.current = true;

  const { finish, finishFailed } = useFinishWhenDone(id, session, store, {
    timeUp,
    busy,
    onHandIn: () => pin(null),
  });

  useEffect(() => () => void queryClient.invalidateQueries({ queryKey: keys.home }), []);

  async function close(): Promise<void> {
    if (closing) return;
    setClosing(true);
    if (session?.mode === 'test' && session.status === 'active') {
      // A test is handed in: the review comes right here, questions she never got to marked
      // as such, with every solution (audit M-36).
      try {
        await handInRun(id, store);
        pin(null);
      } catch (err) {
        toast.show(messageFor(err), 'error');
      } finally {
        setClosing(false);
      }
      return;
    }
    // Anything else is a pause: open questions stay where they are, the answers are stored,
    // and Buddy's home (and the sheet) lead back here. The server finished the session already
    // if nothing is open.
    void queryClient.invalidateQueries({ queryKey: keys.session(id), refetchType: 'none' });
    void queryClient.invalidateQueries({ queryKey: keys.home });
    backToBuddy();
  }

  return {
    closing,
    timeUp,
    onTimeUp: () => setTimeUp(true),
    celebrate: sawActive.current,
    finish,
    finishFailed,
    close,
  };
}
