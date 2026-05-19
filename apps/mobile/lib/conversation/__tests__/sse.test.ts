// Pure SSE parser tests (node). Covers multi-frame buffers, frames split
// across network chunks, `data:` with/without a space, non-data lines,
// and — the bug this fixes — a final event with NO trailing blank line.

import { describe, it, expect } from 'vitest';

import { drainSseFrames, flushSseFrame } from '../sse.js';

describe('drainSseFrames', () => {
  it('extracts every complete data: payload and keeps the partial remainder', () => {
    const buf =
      'data: {"type":"token","text":"Hi"}\n\ndata: {"type":"verdict"}\n\ndata: {"type":"d';
    const { payloads, rest } = drainSseFrames(buf);
    expect(payloads).toEqual(['{"type":"token","text":"Hi"}', '{"type":"verdict"}']);
    expect(rest).toBe('data: {"type":"d');
  });

  it('reassembles a frame split across two network chunks', () => {
    let buf = 'data: {"type":"to';
    let r = drainSseFrames(buf);
    expect(r.payloads).toEqual([]);
    buf = r.rest + 'ken","text":"x"}\n\n';
    r = drainSseFrames(buf);
    expect(r.payloads).toEqual(['{"type":"token","text":"x"}']);
    expect(r.rest).toBe('');
  });

  it('handles "data:" with no space and ignores non-data / empty lines', () => {
    const buf = 'event: msg\ndata:{"a":1}\n\n: comment\ndata: \n\n';
    const { payloads } = drainSseFrames(buf);
    expect(payloads).toEqual(['{"a":1}']);
  });
});

describe('flushSseFrame', () => {
  it('recovers a terminal event that arrived without a trailing blank line', () => {
    // Server closed the socket right after the last `done` event.
    expect(flushSseFrame('data: {"type":"done"}')).toEqual(['{"type":"done"}']);
  });

  it('returns nothing for an empty / whitespace-only remainder', () => {
    expect(flushSseFrame('')).toEqual([]);
    expect(flushSseFrame('\n')).toEqual([]);
  });
});
