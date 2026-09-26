import { describe, expect, it } from 'vitest';

import { createDraftStore, type DraftLink, type DraftStorage } from '../draft.js';

function memory() {
  const kv = new Map<string, string>();
  const files = new Set<string>();
  const storage: DraftStorage = {
    read: async (k) => kv.get(k) ?? null,
    write: async (k, v) => {
      if (v === null) kv.delete(k);
      else kv.set(k, v);
    },
    keep: async (uri) => {
      const kept = `kept:${uri}`;
      files.add(kept);
      return kept;
    },
    drop: async (uris) => {
      for (const u of uris) files.delete(u);
    },
  };
  return { kv, files, storage };
}

const LINK: DraftLink = {
  stepId: null,
  goalId: null,
  purpose: 'homework',
  completes: null,
  pages: null,
  add: false,
};

describe('photo drafts', () => {
  it('keeps unsent photos across a restart and offers them once nothing is sending', async () => {
    const m = memory();
    let t = new Date('2026-09-28T14:00:00Z');
    const a = createDraftStore(m.storage, () => t);
    const uri = await a.keep('cache/1.jpg');
    await a.save({
      requestId: null,
      photos: [{ uri, problems: ['small'], kept: true }],
      link: LINK,
    });
    // The app is killed: a new run finds the draft.
    const b = createDraftStore(m.storage, () => t);
    expect(await b.leftBehind()).toMatchObject({
      photos: [{ uri: 'kept:cache/1.jpg', problems: ['small'], kept: true }],
      link: { purpose: 'homework' },
    });
    // While this run is sending it, it is not "left behind".
    await b.save({ requestId: 'r1', photos: [{ uri, problems: [], kept: false }], link: LINK });
    b.startSending('r1');
    expect(await b.leftBehind()).toBeNull();
    b.stopSending('r1');
    expect((await b.leftBehind())?.requestId).toBe('r1');
    // A week later it is cleaned up, photos included.
    t = new Date('2026-10-06T14:00:00Z');
    expect(await b.load()).toBeNull();
    expect(m.files.size).toBe(0);
  });

  it('"Verwerfen" deletes the photos; an empty set clears the draft', async () => {
    const m = memory();
    const s = createDraftStore(m.storage);
    const uri = await s.keep('cache/2.jpg');
    await s.save({ requestId: null, photos: [{ uri, problems: [], kept: false }], link: LINK });
    await s.discard();
    expect(await s.load()).toBeNull();
    expect(m.files.size).toBe(0);
    await s.save({ requestId: null, photos: [{ uri, problems: [], kept: false }], link: LINK });
    await s.save({ requestId: null, photos: [], link: LINK });
    expect(await s.load()).toBeNull();
  });

  it('keeps sent photos a day for the page notice, then deletes them', async () => {
    const m = memory();
    let t = new Date('2026-09-28T14:00:00Z');
    const s = createDraftStore(m.storage, () => t);
    const p1 = await s.keep('cache/p1.jpg');
    const p2 = await s.keep('cache/p2.jpg');
    await s.save({
      requestId: 'r',
      photos: [p1, p2].map((uri) => ({ uri, problems: [], kept: false })),
      link: LINK,
    });
    await s.sent('mat-1', [p1, p2]);
    expect(await s.load()).toBeNull();
    expect(await s.sentPage('mat-1', 2)).toBe(p2);
    expect(await s.sentPage('mat-1', 3)).toBeNull();
    expect(await s.sentPage('other', 1)).toBeNull();
    t = new Date('2026-09-29T15:00:00Z');
    await s.prune();
    expect(await s.sentPage('mat-1', 2)).toBeNull();
    expect(m.files.size).toBe(0);
  });

  it('signing out deletes the draft and the kept photos', async () => {
    const m = memory();
    const s = createDraftStore(m.storage);
    const a = await s.keep('cache/a.jpg');
    const b = await s.keep('cache/b.jpg');
    await s.sent('mat', [b]);
    await s.save({ requestId: null, photos: [{ uri: a, problems: [], kept: false }], link: LINK });
    await s.clearAll();
    expect(await s.load()).toBeNull();
    expect(await s.sentPage('mat', 1)).toBeNull();
    expect(m.files.size).toBe(0);
  });

  it('ignores a damaged draft instead of crashing', async () => {
    const m = memory();
    m.kv.set('lb.capture.draft.v1', '{"v":1,"photos":"nope"');
    expect(await createDraftStore(m.storage).load()).toBeNull();
    m.kv.set('lb.capture.draft.v1', JSON.stringify({ v: 1, photos: [] }));
    expect(await createDraftStore(m.storage).load()).toBeNull();
  });
});
