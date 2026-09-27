import { describe, expect, it } from 'vitest';

import type { SendResult } from '../outbox.js';
import { oneRunAndAnother, sendInOrder } from '../flush.js';

function pass(results: Record<string, SendResult>) {
  const tried: string[] = [];
  const settled: string[] = [];
  return {
    tried,
    settled,
    run: (list: string[]) =>
      sendInOrder(
        list,
        (e) => {
          tried.push(e);
          return Promise.resolve(results[e] ?? 'sent');
        },
        (e) => {
          settled.push(e);
          return Promise.resolve();
        },
      ),
  };
}

describe('sending the outbox', () => {
  it('one answer the server cannot take does not hold back the later ones', async () => {
    const p = pass({ a: 'try_later' });
    expect(await p.run(['a', 'b', 'c'])).toEqual({ sent: 2, refused: 0 });
    expect(p.settled).toEqual(['b', 'c']); // a stays kept
  });

  it('stops at once without a connection, and after three troubles in a row', async () => {
    const offline = pass({ b: 'no_connection' });
    await offline.run(['a', 'b', 'c']);
    expect(offline.tried).toEqual(['a', 'b']);

    const down = pass({ a: 'try_later', b: 'try_later', c: 'try_later' });
    await down.run(['a', 'b', 'c', 'd']);
    expect(down.tried).toEqual(['a', 'b', 'c']);
  });

  it('counts answers refused for good (they are dropped and she is told)', async () => {
    const p = pass({ b: 'refused' });
    expect(await p.run(['a', 'b'])).toEqual({ sent: 1, refused: 1 });
    expect(p.settled).toEqual(['a', 'b']);
  });
});

describe('one flush at a time', () => {
  it('a call during a run leads to one more run afterwards', async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const flush = oneRunAndAnother(async () => {
      runs += 1;
      if (runs === 1) await new Promise<void>((r) => (release = r));
      return runs;
    });
    const first = flush();
    const second = flush();
    const third = flush();
    expect(second).toBe(third);
    release();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(runs).toBe(2);
    expect(await flush()).toBe(3);
  });
});
