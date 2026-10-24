// Older messages join the same chat, including after returning from talk (#937).
import { useRef, useState } from 'react';
import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { getThread } from '../api/endpoints.js';
import { keys, queryClient } from '../api/queries.js';
import { currentSession } from '../auth/session.js';
import { mergeThread } from '../threadMerge.js';
import { toast } from '../../components/lb/Toast.js';
import { messageFor } from '../errors.js';

export function useEarlierMessages(onPrepend: () => void) {
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  async function load() {
    const first = queryClient.getQueryData<BuddyHome>(keys.home)?.thread[0];
    if (!first || pending.current) return;
    const session = currentSession();
    pending.current = true;
    setLoading(true);
    try {
      const page = await getThread(first.id);
      if (currentSession() !== session) return;
      onPrepend();
      queryClient.setQueryData<BuddyHome>(
        keys.home,
        (held) =>
          held && {
            ...held,
            thread: mergeThread(page.messages, held.thread),
            thread_has_more: page.has_more,
          },
      );
    } catch (error) {
      toast.show(messageFor(error), 'error');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return { loading, load: () => void load() };
}
