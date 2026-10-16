// The vector list runs beside the lexical ones (#673): whatever fails, and in whichever order,
// nothing is left as an unhandled rejection (one would take the serverless function down).

import { afterEach, describe, expect, it } from 'vitest';

import { besideEachOther } from '../connectors/material.js';

const later = <T>(ms: number, fn: () => T): Promise<T> =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, ms);
  });

describe('two search lists side by side (#673)', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  afterEach(() => {
    unhandled.length = 0;
  });

  it('gives both results when both succeed', async () => {
    await expect(
      besideEachOther(
        async () => 'lexical',
        later(5, () => 'vector'),
      ),
    ).resolves.toEqual(['lexical', 'vector']);
  });

  it('drops a failed vector list and keeps the lexical one', async () => {
    const result = await besideEachOther(
      async () => 'lexical',
      later(5, () => {
        throw new Error('embedding down');
      }),
    );
    expect(result).toEqual(['lexical', null]);
  });

  it('leaves no unhandled rejection when the lexical part throws and the vector part fails later', async () => {
    await expect(
      besideEachOther(
        async () => {
          throw new Error('database down');
        },
        later(20, () => {
          throw new Error('embedding down');
        }),
      ),
    ).rejects.toThrow('database down');
    // Give the late rejection time to land, then a turn of the event loop for the report.
    await new Promise((r) => setTimeout(r, 50));
    expect(unhandled).toEqual([]);
  });
});
