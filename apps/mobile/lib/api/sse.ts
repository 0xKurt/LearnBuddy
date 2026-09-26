// Server-sent events, read piece by piece (pure, unit-tested): the API streams
// Buddy's reply this way (docs/architecture.md §Speed).

export type SseEvent = { event: string; data: string };

/** Feed text as it arrives; complete events come out, the unfinished rest waits. */
export class SseReader {
  private buffer = '';

  push(chunk: string): SseEvent[] {
    // Normalised on the whole buffer: a \r\n may be split across two chunks.
    this.buffer = (this.buffer + chunk).replace(/\r\n/g, '\n');
    const out: SseEvent[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const e = parseBlock(block);
      if (e) out.push(e);
      end = this.buffer.indexOf('\n\n');
    }
    return out;
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}
