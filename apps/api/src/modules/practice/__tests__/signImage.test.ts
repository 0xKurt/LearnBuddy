// The concept images of a practice are signed side by side (#637, Refs #671): every answer
// rebuilds the session view, and its images were signed one Storage round trip after another —
// a session with eight pictures waited for eight requests in a row before the answer came back.
// requires live verification in Claude Code session (replaces Storage, the outside world)

import { describe, expect, it } from 'vitest';

import type { StorageGateway } from '../../../storage/gateway.js';
import { signImageUrls, type ItemImageRow } from '../viewParts.js';

function slowStorage(ms: number, failing = new Set<string>()) {
  let inFlight = 0;
  let peak = 0;
  const storage = {
    async createDownloadUrl(path: string): Promise<string> {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, ms));
      inFlight--;
      if (failing.has(path)) throw new Error('storage down');
      return `https://signed/${path}`;
    },
  } as unknown as StorageGateway;
  return { storage, peak: () => peak };
}

const row = (path: string | null): ItemImageRow => ({
  image_path: path,
  image_width: 10,
  image_height: 10,
  image_label: null,
});

describe('signing the concept images of a session', () => {
  it('signs every distinct picture at once', async () => {
    const { storage, peak } = slowStorage(20);
    const rows = ['a', 'b', 'c', 'a', null, 'd'].map(row);
    const urls = await signImageUrls(storage, rows);
    expect([...urls.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(peak()).toBe(4);
  });

  it('leaves out a picture Storage could not sign, keeps the others', async () => {
    const { storage } = slowStorage(5, new Set(['b']));
    const urls = await signImageUrls(storage, ['a', 'b'].map(row));
    expect(urls.get('a')).toBe('https://signed/a');
    expect(urls.has('b')).toBe(false);
  });
});
