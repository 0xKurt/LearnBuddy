// The page set behind the capture screen and the chat composer: what a retake, a
// removal or a restart makes of it, and what a failed send may promise. A mistake
// here loses a photographed page — or tells her her pages are still there when they
// are not (CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import { ApiError } from '../../api/apiError.js';
import {
  classifySend,
  draftPages,
  filesToTake,
  firstToReview,
  hasPdf,
  NO_PAGES,
  pagesFromDraft,
  roomFor,
  uploadFiles,
  withPageAdded,
  withPageKept,
  withPageRemoved,
  type PageSet,
  type ReadyPage,
} from '../attachments.js';
import type { CaptureDraft, DraftLink } from '../draft.js';
import type { IncomingFile } from '../files.js';
import { MAX_PHOTOS, PhotoUploadError } from '../pages.js';

const LINK: DraftLink = {
  stepId: null,
  goalId: null,
  purpose: 'study',
  completes: null,
  pages: null,
  add: false,
};

const page = (uri: string, over: Partial<ReadyPage> = {}): ReadyPage => ({
  uri,
  problems: [],
  pdf: null,
  ...over,
});

const of = (...pages: ReadyPage[]): PageSet =>
  pages.reduce((set, p) => withPageAdded(set, p), NO_PAGES);

describe('the pages of one sheet', () => {
  it('keeps the order they were taken in, and a retake keeps its place', () => {
    const set = of(page('a'), page('b'), page('c'));
    const retaken = withPageAdded(set, page('b2'), 'b');
    expect(retaken.uris).toEqual(['a', 'b2', 'c']);
  });

  it('a retake takes the finding of the page it stands in for with it', () => {
    const set = of(page('a', { problems: ['blurry'] }));
    expect(firstToReview(set)).toBe('a');
    const retaken = withPageAdded(set, page('a2'), 'a');
    expect(retaken.problems).toEqual({});
    expect(firstToReview(retaken)).toBeNull();
  });

  it('never takes more pages than the API does', () => {
    const full = Array.from({ length: MAX_PHOTOS }, (_, i) => page(`p${i}`)).reduce(
      (set, p) => withPageAdded(set, p),
      NO_PAGES,
    );
    expect(roomFor(full)).toBe(0);
    const over = withPageAdded(full, page('one-too-many'));
    expect(over.uris).toHaveLength(MAX_PHOTOS);
    expect(over.uris).not.toContain('one-too-many');
    // A retake still works at the cap: it takes a place, it does not add one.
    const retaken = withPageAdded(full, page('p0-again'), 'p0');
    expect(retaken.uris).toHaveLength(MAX_PHOTOS);
    expect(retaken.uris[0]).toBe('p0-again');
  });

  it('takes a page out without disturbing the others', () => {
    const set = of(page('a'), page('b', { pdf: 'Blatt.pdf' }), page('c'));
    const left = withPageRemoved(set, 'b');
    expect(left.uris).toEqual(['a', 'c']);
    expect(left.pdfs).toEqual({});
    expect(hasPdf(left)).toBe(false);
  });

  it('asks about every page with a finding, once, and stops asking once she says it is fine', () => {
    const set = of(
      page('a'),
      page('b', { problems: ['dark'] }),
      page('c', { problems: ['small'] }),
    );
    expect(firstToReview(set)).toBe('b');
    const kept = withPageKept(set, 'b');
    expect(firstToReview(kept)).toBe('c');
    expect(firstToReview(withPageKept(kept, 'c'))).toBeNull();
  });
});

describe('what is uploaded', () => {
  it('sends a PDF as a PDF and everything else as the prepared photo', () => {
    const set = of(page('a'), page('b.pdf', { pdf: 'Blatt.pdf' }));
    expect(uploadFiles(set.uris, set.pdfs)).toEqual([
      { uri: 'a', mime: 'image/jpeg' },
      { uri: 'b.pdf', mime: 'application/pdf' },
    ]);
    expect(hasPdf(set)).toBe(true);
  });

  it('takes only what fits and says when something was left out', () => {
    const files: Array<IncomingFile & { kind: 'pdf' | 'image' }> = [
      { uri: 'one.jpg', name: 'one.jpg', mimeType: 'image/jpeg', size: 1, kind: 'image' },
      { uri: 'two.pdf', name: 'Mathe.pdf', mimeType: 'application/pdf', size: 1, kind: 'pdf' },
    ];
    expect(filesToTake(files, 2)).toEqual({
      entries: [
        { uri: 'one.jpg', pdf: null },
        { uri: 'two.pdf', pdf: 'Mathe.pdf' },
      ],
      overLimit: false,
    });
    expect(filesToTake(files, 1)).toEqual({
      entries: [{ uri: 'one.jpg', pdf: null }],
      overLimit: true,
    });
    // No room left: nothing is taken silently.
    expect(filesToTake(files, 0)).toEqual({ entries: [], overLimit: true });
    expect(filesToTake(files, -3)).toEqual({ entries: [], overLimit: true });
  });
});

describe('the draft that survives the app being closed', () => {
  it('brings back the order, the findings, "passt schon" and the PDF names', () => {
    const set = of(
      page('a', { problems: ['blurry'] }),
      page('b.pdf', { pdf: 'Blatt.pdf' }),
      page('c'),
    );
    const kept = withPageKept(set, 'a');
    const draft: CaptureDraft = {
      v: 1,
      requestId: 'r1',
      photos: draftPages(kept),
      link: LINK,
      savedAt: '2026-09-29T10:00:00.000Z',
    };
    expect(draft.photos).toEqual([
      { uri: 'a', problems: ['blurry'], kept: true, pdf: null },
      { uri: 'b.pdf', problems: [], kept: false, pdf: 'Blatt.pdf' },
      { uri: 'c', problems: [], kept: false, pdf: null },
    ]);

    const back = pagesFromDraft(draft);
    expect(back.uris).toEqual(kept.uris);
    expect(back.problems).toEqual(kept.problems);
    expect([...back.kept]).toEqual([...kept.kept]);
    expect(back.pdfs).toEqual(kept.pdfs);
    // Nothing is asked about again that she already decided on.
    expect(firstToReview(back)).toBeNull();
    // And the PDF still goes up as a PDF after the restart.
    expect(uploadFiles(back.uris, back.pdfs)[1]).toEqual({
      uri: 'b.pdf',
      mime: 'application/pdf',
    });
  });

  it('an empty set writes nothing and comes back empty', () => {
    expect(draftPages(NO_PAGES)).toEqual([]);
    expect(roomFor(NO_PAGES)).toBe(MAX_PHOTOS);
  });
});

describe('what a failed send may say', () => {
  it('names the page and promises the photos are still there', () => {
    expect(classifySend(new PhotoUploadError('network', 2))).toEqual({
      page: { key: 'capture:error.upload_network', index: 3 },
      refused: false,
      kept: true,
    });
    expect(classifySend(new PhotoUploadError('rejected', 0, 403))).toEqual({
      page: { key: 'capture:error.upload_rejected', index: 1 },
      refused: false,
      kept: true,
    });
  });

  it('promises nothing about a page whose file on the phone is gone', () => {
    expect(classifySend(new PhotoUploadError('file', 1))).toEqual({
      page: { key: 'capture:error.upload_file', index: 2 },
      refused: false,
      kept: false,
    });
  });

  it('a refusal of the files themselves is not "deine Fotos sind noch da"', () => {
    for (const reason of ['too_many_pages', 'file_unreadable', 'file_too_large']) {
      expect(classifySend(new ApiError('bad_request', 'no', 400, { reason }))).toEqual({
        page: null,
        refused: true,
        kept: false,
      });
    }
  });

  it('every other failure keeps the photos and says so', () => {
    expect(classifySend(new ApiError('network', 'No connection', 0))).toEqual({
      page: null,
      refused: false,
      kept: true,
    });
    // An API reason that is not about the files (a stale context, say) is not a refusal.
    expect(
      classifySend(new ApiError('conflict', 'stale', 409, { reason: 'photos_missing' })),
    ).toEqual({ page: null, refused: false, kept: true });
    expect(classifySend(new Error('boom'))).toEqual({ page: null, refused: false, kept: true });
    expect(classifySend(null)).toEqual({ page: null, refused: false, kept: true });
  });
});
