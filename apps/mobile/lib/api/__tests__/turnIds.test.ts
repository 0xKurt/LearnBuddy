import { describe, expect, it } from 'vitest';

import { turnIds } from '../turnIds.js';

class Lost extends Error {}

describe('client turn ids for "Tipp" (hint-not-idempotent-from-app)', () => {
  const setup = () => {
    let n = 0;
    return turnIds(
      () => `id${++n}`,
      (err) => err instanceof Lost,
    );
  };

  it('a retap after a lost answer sends the same id, so the API replays it', async () => {
    const ids = setup();
    const seen: string[] = [];
    await expect(
      ids.run('s:i', (id) => {
        seen.push(id);
        return Promise.reject(new Lost());
      }),
    ).rejects.toBeInstanceOf(Lost);
    await ids.run('s:i', (id) => {
      seen.push(id);
      return Promise.resolve(1);
    });
    expect(seen).toEqual(['id1', 'id1']);
  });

  it('after an answer, or a clear refusal, the next tap is a new turn', async () => {
    const ids = setup();
    const seen: string[] = [];
    await ids.run('s:i', (id) => (seen.push(id), Promise.resolve(1)));
    await expect(
      ids.run('s:i', (id) => (seen.push(id), Promise.reject(new Error('409')))),
    ).rejects.toThrow();
    await ids.run('s:i', (id) => (seen.push(id), Promise.resolve(1)));
    expect(seen).toEqual(['id1', 'id2', 'id3']);
  });
});
