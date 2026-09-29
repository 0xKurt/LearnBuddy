// Getting the pages of one sheet to the API: reserve, PUT every page to storage,
// submit (docs/architecture.md §Material). Pure — the API calls and the actual PUT
// arrive as `deps`, so the retry, the partial failure and the give-up are proven
// under Node (lib/capture/__tests__/materialUpload.test.ts). lib/capture/upload.ts
// wires the real ones and adds the part that needs the device (preparePhoto).

import type {
  CreateMaterialRequest,
  CreateMaterialResponse,
} from '@learnbuddy/shared-types/contracts';
import type { z } from 'zod';

import { ApiError } from '../api/apiError.js';
import type { PutResult } from './putTypes.js';

/** The API takes 1–20 photos per material. */
export const MAX_PHOTOS = 20;

/** Why a photo did not reach storage: no connection, refused by storage, or the local file is gone. */
export type UploadFailure = 'network' | 'rejected' | 'file';

export class PhotoUploadError extends Error {
  constructor(
    readonly kind: UploadFailure,
    /** 0-based position of the photo in the material. */
    readonly position: number,
    readonly status: number = 0,
  ) {
    super(`Photo ${position + 1} was not uploaded (${kind}${status ? ` ${status}` : ''})`);
    this.name = 'PhotoUploadError';
  }
}

/**
 * A photo sent twice (an earlier try stored it, but its answer never reached
 * the app): the API signs with upsert, so storage normally just replaces it; a
 * storage that refuses duplicates answers 409 or 400 "already exists". The
 * photo is there either way, and submit checks every photo.
 */
function alreadyStored(status: number, body: string): boolean {
  return status === 409 || (status === 400 && /duplicate|already exists/i.test(body));
}

export type SendProgress =
  | { step: 'reserving' }
  | { step: 'uploading'; current: number; total: number }
  | { step: 'submitting' };

export type MaterialPurpose = 'study' | 'homework';

/** What is uploaded: prepared photos are JPEGs; a PDF goes as it is. */
export type UploadMime = 'image/jpeg' | 'application/pdf';
export type UploadFile = { uri: string; mime: UploadMime };

/**
 * What the photos are for: the capture step and goal they belong to, and
 * whether it is study material or homework (hints only, a help session).
 */
export type MaterialLink = {
  stepId: string | null;
  goalId: string | null;
  purpose?: MaterialPurpose;
  /** The earlier material whose missing pages these photos are (keeps its goal and purpose). */
  completes?: string | null;
};

/** The outside world this needs: the two API calls, the PUT, and fresh idempotency keys. */
export type UploadDeps = {
  createMaterial: (body: z.input<typeof CreateMaterialRequest>) => Promise<CreateMaterialResponse>;
  submitMaterial: (id: string) => Promise<unknown>;
  putPhoto: (localUri: string, uploadUrl: string, contentType: string) => Promise<PutResult>;
  newId: () => string;
};

/** PUTs one prepared JPEG (or a PDF) to its signed upload URL; resolves once storage has it. */
export async function uploadPhoto(
  put: UploadDeps['putPhoto'],
  localUri: string,
  uploadUrl: string,
  position: number,
  mime: UploadMime = 'image/jpeg',
): Promise<void> {
  const res = await put(localUri, uploadUrl, mime);
  if (res.kind === 'file') throw new PhotoUploadError('file', position);
  if (res.kind === 'network') throw new PhotoUploadError('network', position);
  if (res.status >= 200 && res.status < 300) return;
  if (alreadyStored(res.status, res.body)) return;
  throw new PhotoUploadError('rejected', position, res.status);
}

/** How many pages go up at once: enough to use the connection, not enough to choke it. */
const PARALLEL_UPLOADS = 3;

/**
 * Sending the pages of one sheet. Keep the instance for retries: it keeps its
 * client_request_id (the API then answers with the same material), skips photos storage
 * already confirmed, and asks for fresh upload URLs when storage refused one.
 *
 * Pages may be added while she is still taking them (`grow` + `pushReady`, issue #56):
 * each one goes up as soon as it is ready, so "Senden" has only the rest and the submit
 * left. Until `send()` the API knows the reservation is not on its way yet (`sending`).
 * A page removed or retaken changes the order: that reservation is given up and a new
 * instance starts (lib/capture/useAttachments.ts).
 */
export class MaterialUpload {
  private readonly deps: UploadDeps;
  private currentRequestId: string;
  private materialId: string | null = null;
  /** Signed upload URL per photo position (index = position). */
  private targets: string[] | null = null;
  private readonly uploaded = new Set<number>();
  /** Submit was asked for at least once: the material may be on its way to being read. */
  private submitTried = false;
  private files: UploadFile[];
  private readonly link: MaterialLink;
  /** The API has been told she asked to send (so the home may say "unterwegs"). */
  private requested = false;
  /** Pages go up one push at a time (they arrive while she keeps taking photos). */
  private pushing: Promise<void> = Promise.resolve();

  constructor(
    deps: UploadDeps,
    files: readonly UploadFile[],
    link: MaterialLink,
    requestId: string = deps.newId(),
  ) {
    this.deps = deps;
    this.files = files.map((f) => ({ ...f }));
    this.link = link;
    this.currentRequestId = requestId;
  }

  /** Also kept in the draft: a send after a restart reuses the same material. */
  get requestId(): string {
    return this.currentRequestId;
  }

  /** The material, once the API reserved it. */
  get material(): string | null {
    return this.materialId;
  }

  /**
   * A reservation nobody will use once this photo set changes: reserved, but
   * never submitted, so it is certainly still waiting for photos. The capture
   * screen deletes it instead of leaving an "unvollständig" sheet behind
   * (audit M-20). After a submit attempt it is left alone: it may be read.
   */
  get abandonedReservation(): string | null {
    return this.materialId && !this.submitTried ? this.materialId : null;
  }

  /** How many pages this sheet has right now (they may still be growing). */
  get pageCount(): number {
    return this.files.length;
  }

  /**
   * A page she took after this upload started: it joins the same material (issue #56).
   * Only before the send — afterwards the set is what the API has.
   */
  grow(file: UploadFile): void {
    if (this.submitTried) throw new Error('This sheet was already sent');
    this.files.push({ ...file });
    // The reservation must learn about the page; the next reserve returns its slot too.
    this.targets = null;
  }

  /**
   * Pages that are ready go up now, while she takes the next one. Nothing is submitted
   * and nothing is claimed: until `send()` the API knows she has not asked for it yet.
   * Failures are not raised here — `send()` does the same work again and reports properly.
   *
   * One at a time: two pages ready in the same breath would otherwise reserve twice and
   * upload the same position twice.
   */
  pushReady(): Promise<void> {
    this.pushing = this.pushing
      .then(async () => {
        if (this.submitTried) return;
        try {
          await this.deliver(() => undefined);
        } catch {
          // A page that did not make it now simply goes with the send.
        }
      })
      .catch(() => undefined);
    return this.pushing;
  }

  /** Resolves once the API has accepted the photos for reading. */
  async send(onProgress: (p: SendProgress) => void): Promise<void> {
    // A page still going up joins this send instead of racing it.
    await this.pushing;
    const materialId = await this.deliver(onProgress, true);
    onProgress({ step: 'submitting' });
    this.submitTried = true;
    try {
      await this.deps.submitMaterial(materialId);
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'photos_missing')
        this.forgetMissing(err.details);
      throw err;
    }
  }

  /** Reserves what is missing and uploads every page not stored yet; returns the material. */
  private async deliver(
    onProgress: (p: SendProgress) => void,
    requesting = false,
  ): Promise<string> {
    const total = this.files.length;
    let materialId = this.materialId;
    let targets = this.targets;

    if (!materialId || !targets || (requesting && !this.requested)) {
      onProgress({ step: 'reserving' });
      const res = await this.deps.createMaterial({
        client_request_id: this.currentRequestId,
        photo_mimes: this.files.map((f) => f.mime),
        ...(this.link.stepId ? { step_id: this.link.stepId } : {}),
        ...(this.link.goalId ? { goal_id: this.link.goalId } : {}),
        purpose: this.link.purpose ?? 'study',
        ...(this.link.completes ? { completes: this.link.completes } : {}),
        sending: requesting,
      });
      if (requesting) this.requested = true;
      materialId = res.material.id;
      this.materialId = materialId;
      // An earlier try already got through; only its answer was lost.
      if (res.material.status !== 'awaiting_upload') {
        this.submitTried = true;
        return materialId;
      }
      targets = this.targetsFrom(res.uploads);
      this.targets = targets;
    }

    // Three pages went up one after another, so she waited three times (issue #56).
    // They go together now — at most PARALLEL_UPLOADS at a time, so a phone connection is
    // used, not flooded. The count shown is what is done, not which one is in flight.
    const open = [...this.files.entries()].filter(([position]) => !this.uploaded.has(position));
    if (open.length > 0) {
      onProgress({ step: 'uploading', current: this.uploaded.size, total });
      const queue = [...open];
      const worker = async (): Promise<void> => {
        for (;;) {
          const next = queue.shift();
          if (!next) return;
          const [position, { uri, mime }] = next;
          const url = targets[position];
          if (url === undefined) throw new Error(`No upload URL for photo ${position + 1}`);
          try {
            await uploadPhoto(this.deps.putPhoto, uri, url, position, mime);
          } catch (err) {
            // Refused (e.g. the URL expired): the next try gets fresh URLs for the same material.
            if (err instanceof PhotoUploadError && err.kind === 'rejected') this.targets = null;
            throw err;
          }
          this.uploaded.add(position);
          onProgress({ step: 'uploading', current: this.uploaded.size, total });
        }
      };
      const workers = Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker);
      // One failure fails the send, as before; the others finish or are dropped with it.
      await Promise.all(workers);
    }
    return materialId;
  }

  /** One URL per photo, by position. A mismatch starts a new material on the next try. */
  private targetsFrom(uploads: CreateMaterialResponse['uploads']): string[] {
    const urls = this.files.map((_, position) => uploads.find((u) => u.position === position)?.url);
    const complete = urls.filter((u): u is string => u !== undefined);
    if (uploads.length !== this.files.length || complete.length !== urls.length) {
      this.currentRequestId = this.deps.newId();
      this.materialId = null;
      throw new Error('The upload slots do not match the photos');
    }
    return complete;
  }

  /** Submit found photos missing (details.missing = positions): upload those again next time. */
  private forgetMissing(details: Record<string, unknown> | null): void {
    const missing = details?.missing;
    if (!Array.isArray(missing)) {
      this.uploaded.clear();
      return;
    }
    for (const position of missing) {
      if (typeof position === 'number') this.uploaded.delete(position);
    }
  }
}
