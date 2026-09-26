import { describe, expect, it } from 'vitest';

import { SseReader } from '../sse.js';

describe('SseReader', () => {
  it('returns events only once they are complete, across any split', () => {
    const text =
      'event: reply\ndata: {"round":1,"text":"Hal"}\n\nevent: reply\r\ndata: {"round":1,"text":"Hallo"}\r\n\r\n: ping\n\nevent: done\ndata: {"a":1}\n\n';
    for (let size = 1; size <= text.length; size += 7) {
      const r = new SseReader();
      const events = [];
      for (let i = 0; i < text.length; i += size) events.push(...r.push(text.slice(i, i + size)));
      expect(events).toEqual([
        { event: 'reply', data: '{"round":1,"text":"Hal"}' },
        { event: 'reply', data: '{"round":1,"text":"Hallo"}' },
        { event: 'done', data: '{"a":1}' },
      ]);
    }
  });
});
