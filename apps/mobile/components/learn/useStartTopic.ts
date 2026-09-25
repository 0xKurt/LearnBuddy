// Starting a session from something the learner named (POST /practice/topic):
// the topic sheet and Buddy's offers in the chat share this. The model
// prepares the session, which takes a few seconds; the state says what to
// show meanwhile and afterwards.
//
// Idempotency: one client_request_id per attempt. Trying the same text again
// (after a failure) reuses it, so a request that did get through only its
// answer was lost is never prepared twice. A caller with a stable id of its
// own (an offer's action id) passes it: then the same offer always opens the
// same session.

import type { SessionView, StartTopicRequest } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';

import { ApiError, newId } from '../../lib/api/client.js';
import { startTopic } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';

export type TopicKind = StartTopicRequest['kind'];

export type StartState =
  | { status: 'idle' }
  | { status: 'preparing' }
  /** 422 not_usable: nothing to learn from this text. */
  | { status: 'not_usable' }
  | { status: 'failed'; message: string };

type Attempt = { kind: TopicKind; text: string; id: string };

export function useStartTopic() {
  const [state, setState] = useState<StartState>({ status: 'idle' });
  const last = useRef<Attempt | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Resolves with the session, or null when it could not be started (the state says why). */
  async function start(
    kind: TopicKind,
    rawText: string,
    requestId?: string,
  ): Promise<SessionView | null> {
    const text = rawText.trim();
    if (running.current || text.length < 2) return null;
    running.current = true;
    const prev = last.current;
    const id = requestId ?? (prev && prev.kind === kind && prev.text === text ? prev.id : newId());
    last.current = { kind, text, id };
    setState({ status: 'preparing' });
    try {
      const session = await startTopic({ client_request_id: id, kind, text });
      last.current = null;
      // The home shows the new session (to resume it) from now on.
      void queryClient.invalidateQueries({ queryKey: keys.home });
      queryClient.setQueryData(keys.session(session.id), session);
      if (mounted.current) setState({ status: 'idle' });
      return session;
    } catch (err) {
      if (mounted.current) {
        setState(
          err instanceof ApiError && err.reason === 'not_usable'
            ? { status: 'not_usable' }
            : { status: 'failed', message: messageFor(err) },
        );
      }
      return null;
    } finally {
      running.current = false;
    }
  }

  /** Clears a shown failure (the learner changed the text or closed the sheet). */
  function reset(): void {
    if (!running.current) setState({ status: 'idle' });
  }

  return { state, start, reset };
}
