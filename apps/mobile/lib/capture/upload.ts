// Photos of study material, from the picker to the API (docs/architecture.md
// §Material). Each photo is made small but readable on the device (longest
// side 1600 px, JPEG). Sending reserves the material with signed upload URLs,
// PUTs every photo straight to storage, then submit lets the API check that
// the photos arrived and start reading them.
//
// What needs the device stays here (preparePhoto); the order of reserve →
// upload → submit, with its retries and give-ups, lives in
// lib/capture/materialUpload.ts, where Node tests can prove it. This file wires
// the real API calls and the real PUT into it.

import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { newId } from '../api/client.js';
import { checkPhoto } from '../photo/check.js';
import { ANALYSIS_WIDTH, type PhotoProblem } from '../photo/quality.js';
import { createMaterial, submitMaterial } from '../api/endpoints.js';
import {
  MaterialUpload,
  type MaterialLink,
  type UploadDeps,
  type UploadFile,
} from './materialUpload.js';
import { putPhoto } from './put.js';

export {
  MAX_PHOTOS,
  MaterialUpload,
  PhotoUploadError,
  type MaterialLink,
  type MaterialPurpose,
  type SendProgress,
  type UploadFailure,
  type UploadFile,
  type UploadMime,
} from './materialUpload.js';

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

/** The real outside world of a send: the two API calls, the native PUT, fresh request ids. */
const DEPS: UploadDeps = { createMaterial, submitMaterial, putPhoto, newId };

/** Starts one sheet's send with the real API and the real upload. */
export function newMaterialUpload(
  files: readonly UploadFile[],
  link: MaterialLink,
  requestId?: string,
): MaterialUpload {
  return new MaterialUpload(DEPS, files, link, requestId ?? newId());
}
