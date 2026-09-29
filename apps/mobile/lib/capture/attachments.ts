// The pages on the capture screen and in the chat composer, as plain values:
// what one more page, a retake, a removal or "Passt schon" makes of the set,
// what the draft keeps of it, what comes back out of a draft, and what a failed
// send means. lib/capture/useAttachments.ts is the React part around this —
// pickers, permissions, drafts, upload; every decision it makes lives here, so
// Node tests prove it (lib/capture/__tests__/attachments.test.ts).

import { ApiError } from '../api/apiError.js';
import type { PhotoProblem } from '../photo/quality.js';
import type { CaptureDraft } from './draft.js';
import { displayName, type IncomingFile } from './files.js';
import { MAX_PHOTOS, PhotoUploadError, type UploadFile } from './materialUpload.js';

/** The pages of one sheet, in page order, with what is known about each of them. */
export type PageSet = {
  /** Local URIs of the prepared pages, in page order. */
  uris: string[];
  /** What the check on the device found per page (lib/photo/quality.ts). */
  problems: Readonly<Record<string, PhotoProblem[]>>;
  /** Pages she chose to keep despite a problem. */
  kept: ReadonlySet<string>;
  /** The pages that are PDFs, with their names (uri → name). */
  pdfs: Readonly<Record<string, string>>;
};

export const NO_PAGES: PageSet = { uris: [], problems: {}, kept: new Set(), pdfs: {} };

/** One page that is ready to join the set. */
export type ReadyPage = { uri: string; problems: PhotoProblem[]; pdf: string | null };

/** The pages a draft brings back — findings, "passt schon" and PDF names included. */
export function pagesFromDraft(d: CaptureDraft): PageSet {
  return {
    uris: d.photos.map((p) => p.uri),
    problems: Object.fromEntries(
      d.photos.filter((p) => p.problems.length).map((p) => [p.uri, p.problems]),
    ),
    kept: new Set(d.photos.filter((p) => p.kept).map((p) => p.uri)),
    pdfs: Object.fromEntries(d.photos.flatMap((p) => (p.pdf ? [[p.uri, p.pdf] as const] : []))),
  };
}

/** What the draft keeps of the pages on screen (the same order they are shown in). */
export function draftPages(set: PageSet): CaptureDraft['photos'] {
  return set.uris.map((uri) => ({
    uri,
    problems: set.problems[uri] ?? [],
    kept: set.kept.has(uri),
    pdf: set.pdfs[uri] ?? null,
  }));
}

/**
 * One more page. `replace` is the page a retake stands in for: the new one takes its
 * place, so the order of the sheet does not change and the old finding goes with it.
 * Without it the page goes last — and never past the cap the API takes.
 */
export function withPageAdded(
  set: PageSet,
  page: ReadyPage,
  replace: string | null = null,
): PageSet {
  const uris = replace
    ? set.uris.map((u) => (u === replace ? page.uri : u))
    : set.uris.length < MAX_PHOTOS
      ? [...set.uris, page.uri]
      : set.uris;
  const problems = { ...set.problems };
  if (replace) delete problems[replace];
  if (page.problems.length > 0) problems[page.uri] = page.problems;
  const pdfs = { ...set.pdfs };
  if (page.pdf) pdfs[page.uri] = page.pdf;
  return { ...set, uris, problems, pdfs };
}

/** She took a page out: it goes, the others keep their order. */
export function withPageRemoved(set: PageSet, uri: string): PageSet {
  const pdfs = { ...set.pdfs };
  delete pdfs[uri];
  return { ...set, uris: set.uris.filter((u) => u !== uri), pdfs };
}

/** "Passt schon": this page goes along despite what the check found. */
export function withPageKept(set: PageSet, uri: string): PageSet {
  return { ...set, kept: new Set(set.kept).add(uri) };
}

/** The first page with a problem she has not decided about yet, or none. */
export function firstToReview(set: PageSet): string | null {
  return set.uris.find((uri) => (set.problems[uri]?.length ?? 0) > 0 && !set.kept.has(uri)) ?? null;
}

/** How many more pages fit. */
export function roomFor(set: PageSet): number {
  return MAX_PHOTOS - set.uris.length;
}

/** What goes up for each page: a PDF as it is, everything else as the prepared JPEG. */
export function uploadFiles(
  uris: readonly string[],
  pdfs: Readonly<Record<string, string>>,
): UploadFile[] {
  return uris.map((uri) => ({ uri, mime: pdfs[uri] ? 'application/pdf' : 'image/jpeg' }));
}

/** Whether a PDF is among these pages (then a page number is not a photo number). */
export function hasPdf(set: PageSet): boolean {
  return set.uris.some((uri) => set.pdfs[uri]);
}

/** One picked thing in page order: a photo, or a PDF (its name). */
export type Entry = { uri: string; pdf: string | null };

/**
 * Of the files that can be taken, the ones that still fit — and whether anything
 * had to be left out, which is said rather than silently dropped.
 */
export function filesToTake(
  take: ReadonlyArray<IncomingFile & { kind: 'pdf' | 'image' }>,
  room: number,
): { entries: Entry[]; overLimit: boolean } {
  return {
    entries: take
      .slice(0, Math.max(0, room))
      .map((f) => ({ uri: f.uri, pdf: f.kind === 'pdf' ? displayName(f) : null })),
    overLimit: take.length > room,
  };
}

/** The API refused the files themselves: that material is gone, other files start anew. */
const FILE_REFUSALS = new Set(['too_many_pages', 'file_unreadable', 'file_too_large']);

/** What a send that did not work means for the learner. */
export type SendFailure = {
  /**
   * The page that did not go up and what to say about it (i18n key), or null when
   * it was not one page but the API refusing the whole thing.
   */
  page: { key: string; index: number } | null;
  /** The API refused these files: she must change them; this material is gone. */
  refused: boolean;
  /** Whether "deine Fotos sind noch da" is true — it must not be said when it is not. */
  kept: boolean;
};

/**
 * Why a send failed and what may be promised about it. A refusal of the files must
 * not end with "deine Fotos sind noch da" (it would invite sending the same again),
 * and a page whose local file is gone is not kept either.
 */
export function classifySend(err: unknown): SendFailure {
  if (err instanceof PhotoUploadError) {
    const index = err.position + 1;
    if (err.kind === 'file')
      return { page: { key: 'capture:error.upload_file', index }, refused: false, kept: false };
    return {
      page: {
        key:
          err.kind === 'network' ? 'capture:error.upload_network' : 'capture:error.upload_rejected',
        index,
      },
      refused: false,
      kept: true,
    };
  }
  if (err instanceof ApiError && err.reason && FILE_REFUSALS.has(err.reason))
    return { page: null, refused: true, kept: false };
  return { page: null, refused: false, kept: true };
}
