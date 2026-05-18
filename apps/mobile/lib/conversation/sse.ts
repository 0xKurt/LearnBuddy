// Pure Server-Sent-Events frame extraction. No RN/Expo deps, so the
// streaming-parse logic (the riskiest pure bit of the conversational
// client) is unit-testable under the node mobile test runner.

/**
 * Pull every complete `data:` payload out of an accumulating SSE buffer.
 * Returns the JSON strings found and the unconsumed remainder (a partial
 * frame still arriving).
 */
export function drainSseFrames(buffer: string): { payloads: string[]; rest: string } {
  const payloads: string[] = [];
  let buf = buffer;
  let sep: number;
  while ((sep = buf.indexOf('\n\n')) !== -1) {
    const frame = buf.slice(0, sep);
    buf = buf.slice(sep + 2);
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (json) payloads.push(json);
    }
  }
  return { payloads, rest: buf };
}

/**
 * At end-of-stream the server's final event may not be followed by a blank
 * line before the socket closes. Parse a trailing complete frame too so the
 * terminal `done` / `error` event is never silently dropped.
 */
export function flushSseFrame(rest: string): string[] {
  const payloads: string[] = [];
  for (const line of rest.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const json = line.slice(5).trim();
    if (json) payloads.push(json);
  }
  return payloads;
}
