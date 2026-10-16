// One way to answer a call either at once or as a stream (docs/architecture.md §API): with
// `Accept: text/event-stream` the work's steps go out as they happen — progress of a recording
// being heard, Buddy's reply while it is written — then the result as `done`; without it the same
// call answers with plain JSON. Speaking, transcribing and the chat all stream through here
// (#311: three copies of this block before).

import { STREAM_KEEPALIVE_MS } from '@learnbuddy/shared-types/contracts';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { isAppError } from '../lib/errors.js';
import type { AppContext } from './context.js';
import type { Milestone } from './timing.js';

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
  run: (emit: (data: unknown, milestone?: Milestone) => void) => Promise<unknown>,
): Response {
  // Read while the route still runs: the pattern, never the path with its ids.
  const route = `${c.req.method} ${c.req.routePath}`;
  const timeline = c.get('timeline');
  return streamSSE(c, async (stream) => {
    timeline.mark('start');
    let sent = Promise.resolve();
    // A comment line while the work runs: the app ends a stream that stays silent for
    // STREAM_IDLE_MS (#662), and a model call may think longer than that before its first word.
    const keepalive = setInterval(() => {
      sent = sent.then(() => stream.write(': keepalive\n\n')).then(() => undefined);
    }, STREAM_KEEPALIVE_MS);
    try {
      // An event may mark a milestone of its own once it is written (#685: `applied`).
      const result = await run((data, milestone) => {
        sent = sent
          .then(() => stream.writeSSE({ event, data: JSON.stringify(data) }))
          .then(() => {
            timeline.mark('first');
            if (milestone) timeline.mark(milestone);
          });
      });
      clearInterval(keepalive);
      await sent;
      await stream.writeSSE({ event: 'done', data: JSON.stringify(result) });
      timeline.mark('done');
    } catch (err) {
      clearInterval(keepalive);
      // Whatever is still being written goes out whole first, so no line is cut in two.
      await sent.catch(() => undefined);
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ code: isAppError(err) ? err.code : 'internal' }),
      });
      timeline.mark('error');
    }
    console.info(timeline.line(route));
  });
}
