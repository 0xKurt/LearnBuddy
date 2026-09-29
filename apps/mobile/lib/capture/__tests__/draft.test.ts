import { describe, expect, it } from 'vitest';

import {
  cameraOpenOf,
  createDraftStore,
  rebasedUri,
  type DraftLink,
  type DraftStorage,
} from '../draft.js';

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
    await s.sent('mat-1', [p1, p2], 'r');
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
    await s.sent('mat', [b], 'r0');
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

  it('never deletes photos that are being sent, and a finished send keeps a newer draft (M-21)', async () => {
    const m = memory();
    const s = createDraftStore(m.storage);
    const a = await s.keep('cache/a.jpg');
    await s.save({ requestId: 'r1', photos: [{ uri: a, problems: [], kept: false }], link: LINK });
    s.startSending('r1');
    // A fresh capture starts meanwhile: the sending photos stay.
    expect(await s.discard()).toBe(false);
    expect(m.files.has(a)).toBe(true);
    const b = await s.keep('cache/b.jpg');
    await s.save({ requestId: null, photos: [{ uri: b, problems: [], kept: false }], link: LINK });
    // The first send finishes: the new draft is still there.
    await s.sent('mat-1', [a], 'r1');
    s.stopSending('r1');
    expect((await s.load())?.photos.map((p) => p.uri)).toEqual([b]);
    // Not sending any more: "Verwerfen" works again.
    expect(await s.discard()).toBe(true);
    expect(m.files.has(b)).toBe(false);
  });

  it('recovers a photo from a cut-off camera only into a recent capture (M-22)', () => {
    const now = new Date('2026-09-28T14:00:00Z');
    const noted = JSON.stringify({ link: LINK, at: '2026-09-28T13:50:00Z' });
    expect(cameraOpenOf(noted, now)?.link).toEqual(LINK);
    expect(cameraOpenOf(noted, new Date('2026-09-28T15:00:00Z'))).toBeNull();
    expect(cameraOpenOf('{"link":{}}', now)).toBeNull();
    expect(cameraOpenOf(null, now)).toBeNull();
  });
});

describe('URIs after the app moved (issue #57)', () => {
  const NEW = 'file:///data/NEW-UUID/Documents/lb-capture/';
  const OLD = 'file:///data/OLD-UUID/Documents/lb-capture/';

  it('rebases a URI from the old container onto the directory as it is now', () => {
    expect(rebasedUri(`${OLD}p.jpg`, NEW)).toBe(`${NEW}p.jpg`);
  });

  it('leaves URIs alone that are current, foreign or not directly in the directory', () => {
    expect(rebasedUri(`${NEW}p.jpg`, NEW)).toBe(`${NEW}p.jpg`);
    const other = 'file:///data/OLD-UUID/Documents/other/p.jpg';
    expect(rebasedUri(other, NEW)).toBe(other);
    const nested = 'file:///x/lb-capture/sub/p.jpg';
    expect(rebasedUri(nested, NEW)).toBe(nested);
    expect(rebasedUri('file:///x/lb-capture/', NEW)).toBe('file:///x/lb-capture/');
    const data = 'data:image/jpeg;base64,abc';
    expect(rebasedUri(data, NEW)).toBe(data);
  });

  it('accepts the directory with or without a trailing slash', () => {
    expect(rebasedUri(`${OLD}p.jpg`, 'file:///data/NEW-UUID/Documents/lb-capture')).toBe(
      `${NEW}p.jpg`,
    );
  });

  it('hands out draft and sent-page URIs resolved, and deletes at the resolved place', async () => {
    const m = memory();
    const dropped: string[] = [];
    const s = createDraftStore({
      ...m.storage,
      drop: async (uris) => {
        dropped.push(...uris);
      },
      resolve: (uri) => rebasedUri(uri, NEW),
    });
    // Saved before an app update: the URIs name the old container.
    await s.save({
      requestId: null,
      photos: [{ uri: `${OLD}a.jpg`, problems: [], kept: false }],
      link: LINK,
    });
    expect((await s.load())?.photos.map((p) => p.uri)).toEqual([`${NEW}a.jpg`]);
    // The chat's material card finds the sent page too.
    await s.sent('mat', [`${OLD}a.jpg`], 'r1');
    expect(await s.sentPage('mat', 1)).toBe(`${NEW}a.jpg`);
    // "Verwerfen" deletes the file where it is now, not at the old path.
    await s.save({
      requestId: null,
      photos: [{ uri: `${OLD}b.jpg`, problems: [], kept: false }],
      link: LINK,
    });
    await s.discard();
    expect(dropped).toContain(`${NEW}b.jpg`);
    expect(dropped).not.toContain(`${OLD}b.jpg`);
  });
});

describe('PDFs in a draft', () => {
  it('keeps which file is a PDF; a send with a PDF has no photo per page', async () => {
    const m = memory();
    const t = new Date('2026-09-28T14:00:00Z');
    const s = createDraftStore(m.storage, () => t);
    await s.save({
      requestId: null,
      photos: [
        { uri: 'a.pdf', problems: [], kept: false, pdf: 'Blatt.pdf' },
        { uri: 'b.jpg', problems: [], kept: false },
      ],
      link: LINK,
    });
    expect((await s.load())?.photos.map((p) => p.pdf)).toEqual(['Blatt.pdf', null]);
    await s.sent('mat-pdf', ['a.pdf', 'b.jpg'], 'r1', false);
    // Page 2 is not the second file: nothing is shown rather than the wrong page.
    expect(await s.sentPage('mat-pdf', 1)).toBeNull();
    expect(await s.sentPage('mat-pdf', 2)).toBeNull();
    await s.sent('mat-photos', ['c.jpg'], 'r2');
    expect(await s.sentPage('mat-photos', 1)).toBe('c.jpg');
  });
});
