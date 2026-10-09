// One way to answer a call either at once or as a stream (docs/architecture.md §API): with
// `Accept: text/event-stream` the work's steps go out as they happen — progress of a recording
// being heard, Buddy's reply while it is written — then the result as `done`; without it the same
// call answers with plain JSON. Speaking, transcribing and the chat all stream through here
// (#311: three copies of this block before).

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { isAppError } from '../lib/errors.js';
import type { AppContext } from './context.js';

/** Did the caller ask for the stream? */
export function wantsStream(c: Context): boolean {
  return (c.req.header('accept') ?? '').includes('text/event-stream');
}

/**
 * Streams `run`: every event it emits goes out as `event` in the order it was emitted, then what
 * it returns as `done`. An error is answered here, as a code only: nothing internal reaches the
 * app. When the stream ends, one `[timing]` line says when the work started, when the first
 * event and when the result went out (http/timing.ts, issue #447).
 */
export function streamed(
  c: AppContext,
  event: string,
  run: (emit: (data: unknown) => void) => Promise<unknown>,
): Response {
  // Read while the route still runs: the pattern, never the path with its ids.
  const route = `${c.req.method} ${c.req.routePath}`;
  const timeline = c.get('timeline');
  return streamSSE(c, async (stream) => {
    timeline.mark('start');
    try {
      let sent = Promise.resolve();
      const result = await run((data) => {
        sent = sent
          .then(() => stream.writeSSE({ event, data: JSON.stringify(data) }))
          .then(() => timeline.mark('first'));
      });
      await sent;
      await stream.writeSSE({ event: 'done', data: JSON.stringify(result) });
      timeline.mark('done');
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ code: isAppError(err) ? err.code : 'internal' }),
      });
      timeline.mark('error');
    }
    console.info(timeline.line(route));
  });
}
