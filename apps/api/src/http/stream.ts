// One way to answer a call either at once or as a stream (docs/architecture.md §API): with
// `Accept: text/event-stream` the work's steps go out as they happen — progress of a recording
// being heard, Buddy's reply while it is written — then the result as `done`; without it the same
// call answers with plain JSON. Speaking, transcribing and the chat all stream through here
// (#311: three copies of this block before).

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { isAppError } from '../lib/errors.js';

/** Did the caller ask for the stream? */
export function wantsStream(c: Context): boolean {
  return (c.req.header('accept') ?? '').includes('text/event-stream');
}

/**
 * Streams `run`: every event it emits goes out as `event` in the order it was emitted, then what
 * it returns as `done`. An error is answered here, as a code only: nothing internal reaches the
 * app.
 */
export function streamed(
  c: Context,
  event: string,
  run: (emit: (data: unknown) => void) => Promise<unknown>,
): Response {
  return streamSSE(c, async (stream) => {
    try {
      let sent = Promise.resolve();
      const result = await run((data) => {
        sent = sent.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }));
      });
      await sent;
      await stream.writeSSE({ event: 'done', data: JSON.stringify(result) });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ code: isAppError(err) ? err.code : 'internal' }),
      });
    }
  });
}
