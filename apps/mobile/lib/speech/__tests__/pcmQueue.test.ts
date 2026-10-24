// requires live verification in Claude Code session
import { describe, expect, it, vi } from 'vitest';
import { PcmQueue, type PcmOutput } from '../pcmQueue.js';

function setup() {
  let time = 1;
  const scheduled: Array<{
    samples: Float32Array;
    at: number;
    ended: () => void;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const output: PcmOutput = {
    now: () => time,
    schedule(samples, at, ended) {
      const stop = vi.fn();
      scheduled.push({ samples, at, ended, stop });
      return stop;
    },
  };
  const on = { start: vi.fn(), progress: vi.fn(), end: vi.fn() };
  const queue = new PcmQueue(output, on);
  return {
    queue,
    scheduled,
    on,
    advance: (next: number) => {
      time = next;
      queue.tick();
    },
  };
}

describe('progressive PCM queue', () => {
  it('plays before EOF, preserves split samples, and schedules chunks without gaps', () => {
    const h = setup();
    h.queue.push(new Uint8Array([0]));
    expect(h.scheduled).toHaveLength(0);
    h.queue.push(new Uint8Array([128, 255, 127]));
    h.queue.start();
    expect(h.scheduled[0]?.samples).toEqual(new Float32Array([-1, 32767 / 32768]));
    h.queue.push(new Uint8Array([0, 0]));
    expect(h.scheduled[1]?.at).toBeCloseTo(h.scheduled[0]!.at + 2 / 24000);
    expect(h.on.end).not.toHaveBeenCalled();
    h.advance(1.1);
    expect(h.on.start).toHaveBeenCalledTimes(1);
    h.queue.finish();
    h.scheduled[0]!.ended();
    expect(h.on.end).not.toHaveBeenCalled();
    h.scheduled[1]!.ended();
    expect(h.on.end).toHaveBeenCalledWith('done');
  });
  it('preloads without playing and discards every scheduled chunk on barge-in', () => {
    const h = setup();
    h.queue.push(new Uint8Array(960));
    expect(h.scheduled).toHaveLength(0);
    h.queue.start();
    h.queue.stop();
    h.queue.push(new Uint8Array(960));
    h.scheduled[0]!.ended();
    h.queue.finish();
    expect(h.scheduled).toHaveLength(1);
    expect(h.scheduled[0]!.stop).toHaveBeenCalledOnce();
    expect(h.on.end.mock.calls).toEqual([['stopped']]);
    expect(h.on.start).not.toHaveBeenCalled();
  });
  it('rejects odd final samples, empty streams and excessive buffering', () => {
    for (const data of [new Uint8Array([1]), new Uint8Array()]) {
      const h = setup();
      h.queue.push(data);
      h.queue.finish();
      expect(h.on.end).toHaveBeenCalledWith('error');
    }
    const h = setup();
    h.queue.push(new Uint8Array(12_000_002));
    expect(h.on.end).toHaveBeenCalledWith('error');
  });
  it('resumes after an underrun and finishes only after the last audio ends', () => {
    const h = setup();
    h.queue.start();
    h.queue.push(new Uint8Array(960));
    h.scheduled[0]!.ended();
    expect(h.on.end).not.toHaveBeenCalled();
    h.advance(2);
    h.queue.push(new Uint8Array(960));
    expect(h.scheduled[1]!.at).toBeGreaterThanOrEqual(2);
    h.queue.finish();
    h.scheduled[1]!.ended();
    expect(h.on.end).toHaveBeenCalledOnce();
  });
});
