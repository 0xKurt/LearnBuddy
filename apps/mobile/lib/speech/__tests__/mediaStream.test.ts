// requires live verification in Claude Code session
import { describe, expect, it, vi } from 'vitest';
import { appendAudio } from '../mediaStream.js';

function mediaHarness() {
  const buffer = new EventTarget();
  const append = vi.fn();
  Object.assign(buffer, { appendBuffer: append });
  const media = new EventTarget();
  const end = vi.fn();
  Object.assign(media, { readyState: 'open', addSourceBuffer: () => buffer, endOfStream: end });
  return { media: media as MediaSource, buffer, append, end };
}
describe('browser progressive MP3', () => {
  it('appends the first bytes before EOF and waits for each append before the next', async () => {
    const h = mediaHarness();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        source = c;
      },
    });
    const pending = appendAudio(h.media, body, new AbortController().signal);
    source.enqueue(new Uint8Array([1, 2]));
    source.enqueue(new Uint8Array([3, 4]));
    await vi.waitFor(() => expect(h.append).toHaveBeenCalledTimes(1));
    expect(h.end).not.toHaveBeenCalled();
    h.buffer.dispatchEvent(new Event('updateend'));
    await vi.waitFor(() => expect(h.append).toHaveBeenCalledTimes(2));
    source.close();
    h.buffer.dispatchEvent(new Event('updateend'));
    await pending;
    expect(h.end).toHaveBeenCalledOnce();
    expect([...new Uint8Array(h.append.mock.calls[0]![0] as ArrayBuffer)]).toEqual([1, 2]);
  });
  it('cancels while waiting for a browser buffer update', async () => {
    const h = mediaHarness();
    const stop = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
      },
    });
    const pending = appendAudio(h.media, body, stop.signal);
    const failed = expect(pending).rejects.toThrow('stopped');
    await vi.waitFor(() => expect(h.append).toHaveBeenCalledOnce());
    stop.abort();
    await failed;
    expect(h.end).not.toHaveBeenCalled();
  });
});
