// Photos of study material, from the picker to the API (docs/architecture.md
// §Material). Each photo is made small but readable on the device (longest
// side 1600 px, JPEG). Sending reserves the material with signed upload URLs,
// PUTs every photo straight to storage, then submit lets the API check that
// the photos arrived and start reading them.

import type { CreateMaterialResponse } from '@learnbuddy/shared-types/contracts';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { ApiError, newId } from '../api/client.js';
import { checkPhoto } from '../photo/check.js';
import { ANALYSIS_WIDTH, type PhotoProblem } from '../photo/quality.js';
import { createMaterial, submitMaterial } from '../api/endpoints.js';

/** The API takes 1–20 photos per material. */
export const MAX_PHOTOS = 20;

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** What the check on the device found (lib/photo/quality.ts); empty = looks fine. */
  problems: PhotoProblem[];
};

/**
 * Downscales a picked photo to a longest side of 1600 px (never upscales) and
 * saves it as JPEG. The size is read from the rendered image, which is already
 * upright, so the longer side is found whatever the camera's orientation was.
 */
export async function preparePhoto(sourceUri: string): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);
  const rendered: ImageRef[] = [];
  try {
    let image = await context.renderAsync();
    rendered.push(image);
    const originalMinSide = Math.min(image.width, image.height);
    if (Math.max(image.width, image.height) > MAX_SIDE) {
      context.resize(image.width >= image.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
      image = await context.renderAsync();
      rendered.push(image);
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    // A small copy for the quality check, measured right here on the device.
    let problems: PhotoProblem[] = [];
    try {
      if (image.width > ANALYSIS_WIDTH) context.resize({ width: ANALYSIS_WIDTH });
      const small = await context.renderAsync();
      rendered.push(small);
      const copy = await small.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (copy.base64) problems = checkPhoto(copy.base64, originalMinSide);
    } catch {
      // The check is advice: without it the photo is simply taken as it is.
    }
    return { uri: saved.uri, width: saved.width, height: saved.height, problems };
  } finally {
    // Full-size bitmaps: free them now rather than whenever the GC runs.
    context.release();
    for (const r of rendered) r.release();
  }
}

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

/** PUTs one prepared JPEG to its signed upload URL; resolves once storage has it. */
export async function uploadPhoto(
  localUri: string,
  uploadUrl: string,
  position: number,
): Promise<void> {
  let body: Blob;
  try {
    body = await (await fetch(localUri)).blob();
  } catch {
    throw new PhotoUploadError('file', position);
  }
  if (body.size === 0) throw new PhotoUploadError('file', position);

  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body,
    });
  } catch {
    throw new PhotoUploadError('network', position);
  }
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  if (alreadyStored(res.status, text)) return;
  throw new PhotoUploadError('rejected', position, res.status);
}

export type SendProgress =
  | { step: 'reserving' }
  | { step: 'uploading'; current: number; total: number }
  | { step: 'submitting' };

export type MaterialPurpose = 'study' | 'homework';

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

/**
 * Sending one fixed set of photos. Keep the instance for retries: it keeps
 * its client_request_id (the API then answers with the same material), skips
 * photos storage already confirmed, and asks for fresh upload URLs when
 * storage refused one. A changed photo set needs a new instance.
 */
export class MaterialUpload {
  private requestId = newId();
  private materialId: string | null = null;
  /** Signed upload URL per photo position (index = position). */
  private targets: string[] | null = null;
  private readonly uploaded = new Set<number>();
  private readonly photoUris: readonly string[];
  private readonly link: MaterialLink;

  constructor(photoUris: readonly string[], link: MaterialLink) {
    this.photoUris = [...photoUris];
    this.link = link;
  }

  /** Resolves once the API has accepted the photos for reading. */
  async send(onProgress: (p: SendProgress) => void): Promise<void> {
    const total = this.photoUris.length;
    let materialId = this.materialId;
    let targets = this.targets;

    if (!materialId || !targets) {
      onProgress({ step: 'reserving' });
      const res = await createMaterial({
        client_request_id: this.requestId,
        photo_mimes: this.photoUris.map(() => 'image/jpeg' as const),
        ...(this.link.stepId ? { step_id: this.link.stepId } : {}),
        ...(this.link.goalId ? { goal_id: this.link.goalId } : {}),
        purpose: this.link.purpose ?? 'study',
        ...(this.link.completes ? { completes: this.link.completes } : {}),
      });
      materialId = res.material.id;
      this.materialId = materialId;
      // An earlier try already got through; only its answer was lost.
      if (res.material.status !== 'awaiting_upload') return;
      targets = this.targetsFrom(res.uploads);
      this.targets = targets;
    }

    for (const [position, uri] of this.photoUris.entries()) {
      if (this.uploaded.has(position)) continue;
      const url = targets[position];
      if (url === undefined) throw new Error(`No upload URL for photo ${position + 1}`);
      onProgress({ step: 'uploading', current: position + 1, total });
      try {
        await uploadPhoto(uri, url, position);
      } catch (err) {
        // Refused (e.g. the URL expired): the next try gets fresh URLs for the same material.
        if (err instanceof PhotoUploadError && err.kind === 'rejected') this.targets = null;
        throw err;
      }
      this.uploaded.add(position);
    }

    onProgress({ step: 'submitting' });
    try {
      await submitMaterial(materialId);
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'photos_missing')
        this.forgetMissing(err.details);
      throw err;
    }
  }

  /** One URL per photo, by position. A mismatch starts a new material on the next try. */
  private targetsFrom(uploads: CreateMaterialResponse['uploads']): string[] {
    const urls = this.photoUris.map(
      (_, position) => uploads.find((u) => u.position === position)?.url,
    );
    const complete = urls.filter((u): u is string => u !== undefined);
    if (uploads.length !== this.photoUris.length || complete.length !== urls.length) {
      this.requestId = newId();
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
