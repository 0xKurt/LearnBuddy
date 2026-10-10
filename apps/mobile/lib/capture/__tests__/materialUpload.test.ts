// The order a sheet reaches the API in, and above all what happens when it does not:
// a page that fails must not cost the ones that made it, a retry must not send the
// same sheet twice, and nothing may be claimed that is not true (CLAUDE.md rule 5).

import type {
  CreateMaterialRequest,
  CreateMaterialResponse,
} from '@learnbuddy/shared-types/contracts';
import type { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../../api/apiError.js';
import { MaterialUpload, uploadPhoto, type UploadDeps } from '../materialUpload.js';
import { PhotoUploadError, type PageLink, type SendProgress, type UploadFile } from '../pages.js';
import type { PutResult } from '../putTypes.js';

type Body = z.input<typeof CreateMaterialRequest>;
type Put = (position: number, url: string) => PutResult | Promise<PutResult>;

const LINK: PageLink = { stepId: null, goalId: null, purpose: 'homework', completes: null };
const jpegs = (n: number): UploadFile[] =>
  Array.from({ length: n }, (_, i) => ({ uri: `file:///p${i}.jpg`, mime: 'image/jpeg' }));

/** Lets a promise chain get a few turns ahead (for the pages that do go up). */
async function ticks(n = 10) {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
}

function reservation(
  id: string,
  slots: number,
  status = 'awaiting_upload',
): CreateMaterialResponse {
  return {
    material: { id, status },
    uploads: Array.from({ length: slots }, (_, position) => ({
      position,
      path: `${id}/${position}`,
      url: `https://store/${id}/${position}`,
      token: 'tok',
    })),
  } as unknown as CreateMaterialResponse;
}

const ok: PutResult = { kind: 'response', status: 200, body: '' };

function world(
  options: {
    reserve?: (body: Body, nth: number) => CreateMaterialResponse;
    put?: Put;
    submit?: (id: string, nth: number) => void;
  } = {},
) {
  const reserves: Body[] = [];
  const puts: Array<{ url: string; mime: string }> = [];
  const submits: string[] = [];
  let ids = 0;
  const deps: UploadDeps = {
    createMaterial: async (body) => {
      reserves.push(body);
      return options.reserve
        ? options.reserve(body, reserves.length - 1)
        : reservation('mat-1', body.photo_mimes.length);
    },
    submitMaterial: async (id) => {
      submits.push(id);
      options.submit?.(id, submits.length - 1);
    },
    putPhoto: async (uri, url, mime) => {
      const position = Number(/\/p(\d+)\./.exec(uri)?.[1] ?? -1);
      puts.push({ url, mime });
      return options.put ? options.put(position, url) : ok;
    },
    newId: () => `req-${(ids += 1)}`,
  };
  return { deps, reserves, puts, submits };
}

const positions = (puts: Array<{ url: string }>) =>
  puts.map((p) => Number(p.url.split('/').at(-1)));

function missing(list: unknown): ApiError {
  return new ApiError('conflict', 'photos missing', 409, {
    reason: 'photos_missing',
    ...(list === undefined ? {} : { missing: list }),
  });
}

describe('sending one sheet', () => {
  it('reserves once, puts every page and then submits', async () => {
    const w = world();
    const steps: SendProgress[] = [];
    const upload = new MaterialUpload(w.deps, jpegs(3), LINK, 'req-0');
    await upload.send((p) => steps.push(p));

    expect(w.reserves).toHaveLength(1);
    expect(w.reserves[0]).toMatchObject({
      client_request_id: 'req-0',
      photo_mimes: ['image/jpeg', 'image/jpeg', 'image/jpeg'],
      purpose: 'homework',
      // Only now does the API know she asked for it (the home may say "unterwegs").
      sending: true,
    });
    expect(positions(w.puts).sort()).toEqual([0, 1, 2]);
    expect(w.submits).toEqual(['mat-1']);
    expect(steps[0]).toEqual({ step: 'reserving' });
    expect(steps.at(-1)).toEqual({ step: 'submitting' });
    expect(steps.filter((s) => s.step === 'uploading').at(-1)).toEqual({
      step: 'uploading',
      current: 3,
      total: 3,
    });
  });

  it('a PDF among the pages goes up as a PDF, not as a photo', async () => {
    const w = world();
    const files: UploadFile[] = [
      { uri: 'file:///p0.pdf', mime: 'application/pdf' },
      { uri: 'file:///p1.jpg', mime: 'image/jpeg' },
    ];
    await new MaterialUpload(w.deps, files, LINK, 'req-0').send(() => undefined);
    expect(w.reserves[0]?.photo_mimes).toEqual(['application/pdf', 'image/jpeg']);
    expect(w.puts.map((p) => p.mime).sort()).toEqual(['application/pdf', 'image/jpeg']);
  });
});

describe('a page that does not make it', () => {
  it('keeps the pages that did: the retry reuses the material and sends only the rest', async () => {
    let attempt = 0;
    const w = world({
      put: async (position) => {
        if (position !== 1) return ok;
        attempt += 1;
        if (attempt > 1) return ok;
        // The other two are through before this one gives up.
        await ticks();
        return { kind: 'network' };
      },
    });
    const upload = new MaterialUpload(w.deps, jpegs(3), LINK, 'req-0');

    await expect(upload.send(() => undefined)).rejects.toMatchObject({
      name: 'PhotoUploadError',
      kind: 'network',
      position: 1,
    });
    expect(w.submits).toEqual([]);
    // Nothing was submitted, so the reservation is one nobody will use.
    expect(upload.abandonedReservation).toBe('mat-1');

    const before = w.puts.length;
    await upload.send(() => undefined);
    // Same material, no second reservation, and only the page that was missing.
    expect(upload.requestId).toBe('req-0');
    expect(w.reserves).toHaveLength(1);
    expect(positions(w.puts.slice(before))).toEqual([1]);
    expect(w.submits).toEqual(['mat-1']);
  });

  it('asks for fresh upload URLs after storage refused one (an expired link)', async () => {
    let refuse = true;
    const w = world({
      put: (position) => {
        if (position !== 0 || !refuse) return ok;
        refuse = false;
        return { kind: 'response', status: 403, body: 'expired' };
      },
    });
    const upload = new MaterialUpload(w.deps, jpegs(2), LINK, 'req-0');

    await expect(upload.send(() => undefined)).rejects.toMatchObject({
      kind: 'rejected',
      position: 0,
      status: 403,
    });
    await upload.send(() => undefined);
    // The same sheet (same request id), but signed again.
    expect(w.reserves.map((r) => r.client_request_id)).toEqual(['req-0', 'req-0']);
    expect(w.submits).toEqual(['mat-1']);
  });

  it('says which page it was and stops before the submit when the local file is gone', async () => {
    const w = world({ put: (position) => (position === 1 ? { kind: 'file' } : ok) });
    const upload = new MaterialUpload(w.deps, jpegs(2), LINK, 'req-0');
    const err = await upload.send(() => undefined).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PhotoUploadError);
    expect(err).toMatchObject({ kind: 'file', position: 1 });
    expect(w.submits).toEqual([]);
  });

  it('takes a duplicate storage refuses as stored — the photo is there either way', async () => {
    for (const res of [
      { kind: 'response', status: 409, body: '' } as const,
      { kind: 'response', status: 400, body: 'Duplicate object' } as const,
      { kind: 'response', status: 400, body: 'The resource already exists' } as const,
    ]) {
      const w = world({ put: () => res });
      await new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0').send(() => undefined);
      expect(w.submits).toEqual(['mat-1']);
    }
    // A plain 400 stays a refusal.
    const w = world({ put: () => ({ kind: 'response', status: 400, body: 'bad request' }) });
    await expect(
      new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0').send(() => undefined),
    ).rejects.toMatchObject({ kind: 'rejected', status: 400 });
  });
});

describe('what the API answers', () => {
  it('uploads only the pages submit reported missing', async () => {
    let first = true;
    const w = world({
      submit: () => {
        if (!first) return;
        first = false;
        throw missing([2]);
      },
    });
    const upload = new MaterialUpload(w.deps, jpegs(3), LINK, 'req-0');
    await expect(upload.send(() => undefined)).rejects.toMatchObject({ name: 'ApiError' });
    // A submit was tried: the material may be on its way to being read, so it stays.
    expect(upload.abandonedReservation).toBeNull();

    const before = w.puts.length;
    await upload.send(() => undefined);
    expect(positions(w.puts.slice(before))).toEqual([2]);
    expect(w.submits).toEqual(['mat-1', 'mat-1']);
  });

  it('sends every page again when submit does not say which are missing', async () => {
    let first = true;
    const w = world({
      submit: () => {
        if (!first) return;
        first = false;
        throw missing(undefined);
      },
    });
    const upload = new MaterialUpload(w.deps, jpegs(3), LINK, 'req-0');
    await expect(upload.send(() => undefined)).rejects.toMatchObject({ name: 'ApiError' });
    const before = w.puts.length;
    await upload.send(() => undefined);
    expect(positions(w.puts.slice(before)).sort()).toEqual([0, 1, 2]);
  });

  it('leaves another failure alone: the pages stay uploaded', async () => {
    let first = true;
    const w = world({
      submit: () => {
        if (!first) return;
        first = false;
        throw new ApiError('network', 'No connection', 0);
      },
    });
    const upload = new MaterialUpload(w.deps, jpegs(2), LINK, 'req-0');
    await expect(upload.send(() => undefined)).rejects.toMatchObject({ code: 'network' });
    const before = w.puts.length;
    await upload.send(() => undefined);
    expect(w.puts.slice(before)).toEqual([]);
    expect(w.submits).toEqual(['mat-1', 'mat-1']);
  });

  it('sends nothing twice when an earlier try got through and only its answer was lost', async () => {
    const w = world({ reserve: () => reservation('mat-1', 2, 'reading') });
    const upload = new MaterialUpload(w.deps, jpegs(2), LINK, 'req-0');
    await upload.send(() => undefined);
    expect(w.puts).toEqual([]);
    expect(upload.abandonedReservation).toBeNull();
  });

  it('gives up a reservation whose slots do not match the pages', async () => {
    const w = world({ reserve: () => reservation('mat-1', 1) });
    const upload = new MaterialUpload(w.deps, jpegs(3), LINK, 'req-0');
    await expect(upload.send(() => undefined)).rejects.toThrow(/do not match/);
    // Nothing of that material is used again: a new sheet, and nothing to delete.
    expect(upload.requestId).not.toBe('req-0');
    expect(upload.material).toBeNull();
    expect(upload.abandonedReservation).toBeNull();
    expect(w.puts).toEqual([]);
  });
});

describe('pages that arrive while she is still taking them (issue #56)', () => {
  it('puts each page as it is ready, without telling the API she asked to send', async () => {
    const w = world();
    const upload = new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0');
    await upload.pushReady();
    expect(positions(w.puts)).toEqual([0]);
    expect(w.reserves.map((r) => r.sending)).toEqual([false]);
    expect(w.submits).toEqual([]);

    upload.grow({ uri: 'file:///p1.jpg', mime: 'image/jpeg' });
    expect(upload.pageCount).toBe(2);
    await upload.pushReady();
    expect(positions(w.puts)).toEqual([0, 1]);

    await upload.send(() => undefined);
    // Only now is it on its way; no page went up twice.
    expect(w.reserves.at(-1)?.sending).toBe(true);
    expect(positions(w.puts)).toEqual([0, 1]);
    expect(w.submits).toEqual(['mat-1']);
  });

  it('two pages ready in the same breath reserve once and never upload a page twice', async () => {
    const w = world();
    const upload = new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0');
    const first = upload.pushReady();
    upload.grow({ uri: 'file:///p1.jpg', mime: 'image/jpeg' });
    await Promise.all([first, upload.pushReady()]);
    expect(positions(w.puts)).toEqual([0, 1]);
  });

  it('never loses a push failure into the send: the send does the work again', async () => {
    let down = true;
    const w = world({
      put: () => (down ? { kind: 'network' } : ok),
    });
    const upload = new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0');
    // A push never rejects — it is not something she asked for yet.
    await expect(upload.pushReady()).resolves.toBeUndefined();
    down = false;
    await upload.send(() => undefined);
    expect(w.submits).toEqual(['mat-1']);
  });

  it('refuses a page for a sheet that is already sent', async () => {
    const w = world();
    const upload = new MaterialUpload(w.deps, jpegs(1), LINK, 'req-0');
    await upload.send(() => undefined);
    expect(() => upload.grow({ uri: 'file:///p1.jpg', mime: 'image/jpeg' })).toThrow(
      /already sent/,
    );
  });
});

describe('one photo to storage', () => {
  const put = (res: PutResult) => async () => res;

  it('names what went wrong and which page it was', async () => {
    await expect(uploadPhoto(put({ kind: 'network' }), 'u', 'url', 2)).rejects.toMatchObject({
      kind: 'network',
      position: 2,
      message: 'Photo 3 was not uploaded (network)',
    });
    await expect(uploadPhoto(put({ kind: 'file' }), 'u', 'url', 0)).rejects.toMatchObject({
      kind: 'file',
      position: 0,
    });
    await expect(
      uploadPhoto(put({ kind: 'response', status: 500, body: 'boom' }), 'u', 'url', 1),
    ).rejects.toMatchObject({ kind: 'rejected', position: 1, status: 500 });
  });

  it('passes the content type through and takes any 2xx', async () => {
    const seen: string[] = [];
    await uploadPhoto(
      async (_uri, _url, mime) => {
        seen.push(mime);
        return { kind: 'response', status: 204, body: '' };
      },
      'u',
      'url',
      0,
      'application/pdf',
    );
    expect(seen).toEqual(['application/pdf']);
  });
});
