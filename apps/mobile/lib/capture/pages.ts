// The pages she attaches in the chat's input bar, as the core knows them (issue #107): what a
// page is, what a check on the device can find in a photo, how a send reports where it is and
// how one page can fail. Where the pages go and how a photo is checked is a domain's: the
// learning domain sends them as a sheet to read (lib/capture/materialUpload.ts) and checks
// photos for blur and light (lib/photo/), given once at app start (lib/learning/register.tsx).
// Without one, nothing can be attached. Pure (Node tests).

import type { ComponentType } from 'react';

import { slot } from '../registry.js';

/** The API takes 1–20 pages per send. */
export const MAX_PHOTOS = 20;

/** What the check on the device can find in a photo (the draft keeps it, lib/capture/draft.ts). */
export const PHOTO_PROBLEMS = ['blurry', 'dark', 'washed_out', 'small', 'tilted'] as const;
export type PhotoProblem = (typeof PHOTO_PROBLEMS)[number];

/** What is uploaded: prepared photos are JPEGs; a PDF goes as it is. */
export type UploadMime = 'image/jpeg' | 'application/pdf';
export type UploadFile = { uri: string; mime: UploadMime };

export type SendProgress =
  | { step: 'reserving' }
  | { step: 'uploading'; current: number; total: number }
  | { step: 'submitting' };

/**
 * What the pages are for: the capture step and goal they belong to, and whether it is study
 * material or homework (hints only, a help session).
 */
export type PageLink = {
  stepId: string | null;
  goalId: string | null;
  purpose?: 'study' | 'homework';
  /** The earlier sheet whose missing pages these are (keeps its goal and purpose). */
  completes?: string | null;
};

/** Why a page did not reach storage: no connection, refused by storage, or the local file is gone. */
export type UploadFailure = 'network' | 'rejected' | 'file';

export class PhotoUploadError extends Error {
  constructor(
    readonly kind: UploadFailure,
    /** 0-based position of the page in the set. */
    readonly position: number,
    readonly status: number = 0,
  ) {
    super(`Photo ${position + 1} was not uploaded (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * One set of pages on its way. Kept for retries: it keeps its request id, so the same pages are
 * never sent twice; pages may still join it until the send (`grow` + `pushReady`).
 */
export type PageUpload = {
  /** Also kept in the draft: a send after a restart goes on with the same set. */
  readonly requestId: string;
  /** What the API made of the pages, once it has them (the sheet's id). */
  readonly material: string | null;
  /** Reserved for this set but never sent: given up when the set changes. */
  readonly abandonedReservation: string | null;
  readonly pageCount: number;
  grow(file: UploadFile): void;
  pushReady(): Promise<void>;
  send(onProgress: (p: SendProgress) => void): Promise<void>;
};

/** What the card for a photo the check found hard to read gets. */
export type PhotoReviewProps = {
  /** 1-based number of the photo. */
  index: number;
  problems: readonly PhotoProblem[];
  disabled: boolean;
  onRetake: () => void;
  onKeep: () => void;
};

/** Where pages go, and how a photo is checked on the device before. */
export type PageHandler = {
  /** Starts one set's send. */
  start(files: readonly UploadFile[], link: PageLink, requestId?: string): PageUpload;
  check: {
    /** How wide the small copy the check looks at is. */
    width: number;
    /** What the small copy (a JPEG) shows; empty = looks fine. */
    run(smallJpegBase64: string, originalMinSide: number): PhotoProblem[];
    /** The card for a photo it found hard to read: take it again, or keep it. */
    Review: ComponentType<PhotoReviewProps>;
  };
};

export const pageHandler = slot<PageHandler>('Anhänge');
