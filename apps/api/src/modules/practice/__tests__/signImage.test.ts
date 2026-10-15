// The concept images of a practice are signed in one request, and a signed URL is handed out again
// while it is still good (#637, #671). Every answer and every poll rebuilds the session view; its
// pictures were signed again each time, one Storage round trip per picture.
// requires live verification in Claude Code session (replaces Storage, the outside world)

import { describe, expect, it } from 'vitest';

import type { StorageGateway } from '../../../storage/gateway.js';
import { signImageUrls, type ItemImageRow } from '../viewParts.js';

function countingStorage(opts: { unsignable?: Set<string>; down?: boolean } = {}) {
  const calls: string[][] = [];
  const storage = {
    async createDownloadUrls(paths: string[]): Promise<Map<string, string>> {
      calls.push([...paths]);
      if (opts.down) throw new Error('storage down');
      return new Map(
        paths.filter((p) => !opts.unsignable?.has(p)).map((p) => [p, `https://signed/${p}`]),
      );
    },
  } as unknown as StorageGateway;
  return { storage, calls };
}

let n = 0;
/** Paths of their own per test: the signed URLs are kept for the whole process. */
const fresh = (name: string) => `test-${++n}/${name}.png`;

const row = (path: string | null): ItemImageRow => ({
  image_path: path,
  image_width: 10,
  image_height: 10,
  image_label: null,
});

const T0 = new Date('2026-10-15T08:00:00Z');
const later = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe('signing the concept images of a session', () => {
  it('signs every distinct picture in one request', async () => {
    const [a, b, c, d] = [fresh('a'), fresh('b'), fresh('c'), fresh('d')];
    const { storage, calls } = countingStorage();
    const urls = await signImageUrls(storage, [a, b, c, a, null, d].map(row), T0);
    expect([...urls.keys()].sort()).toEqual([a, b, c, d].sort());
    expect(calls).toHaveLength(1);
  });

  it('hands a signed URL out again while it has ten minutes left, then signs anew', async () => {
    const [a, b] = [fresh('a'), fresh('b')];
    const { storage, calls } = countingStorage();
    await signImageUrls(storage, [a, b].map(row), T0);
    const again = await signImageUrls(storage, [a, b].map(row), later(19));
    expect(again.get(a)).toBe(`https://signed/${a}`);
    expect(calls).toHaveLength(1);
    await signImageUrls(storage, [a, b].map(row), later(21));
    expect(calls).toHaveLength(2);
  });

  it('leaves out a picture Storage could not sign, keeps the others, and asks again next time', async () => {
    const [a, b] = [fresh('a'), fresh('b')];
    const { storage, calls } = countingStorage({ unsignable: new Set([b]) });
    const urls = await signImageUrls(storage, [a, b].map(row), T0);
    expect(urls.get(a)).toBe(`https://signed/${a}`);
    expect(urls.has(b)).toBe(false);
    await signImageUrls(storage, [a, b].map(row), later(1));
    expect(calls[1]).toEqual([b]);
  });

  it('loads the session without pictures while Storage is down', async () => {
    const { storage } = countingStorage({ down: true });
    expect((await signImageUrls(storage, [fresh('a')].map(row), T0)).size).toBe(0);
  });
});
