// Drain the in-memory capture store and run it through the upload pipeline:
// reserveMaterial → PUT each photo to the signed URL → finalizeMaterial.
//
// Slice C2 wiring. Doc 04 §POST /materials/upload-url + §POST /materials.
//
// The orchestrator emits coarse progress callbacks (`reserving`, `uploading`
// with a fraction, `finalizing`) so the upload screen can animate without
// having to subscribe to RN-fetch internals.

import {
  finalizeMaterial,
  reserveMaterial,
  uploadPhoto,
  type DoneEvent,
} from '../api/materials.js';
import type { PendingCapture } from '../store/capture.js';

export type UploadProgress =
  | { phase: 'reserving' }
  | { phase: 'uploading'; uploaded: number; total: number }
  | { phase: 'finalizing' }
  | { phase: 'done'; done: DoneEvent };

export async function runUpload(
  learnerId: string,
  capture: PendingCapture,
  onProgress: (p: UploadProgress) => void,
): Promise<DoneEvent> {
  onProgress({ phase: 'reserving' });
  const reservation = await reserveMaterial(learnerId, {
    subject_id: capture.subject_id,
    folder_id: capture.folder_id,
    photo_count: capture.photos.length,
    mime_type: 'image/jpeg',
  });

  for (let i = 0; i < capture.photos.length; i++) {
    onProgress({ phase: 'uploading', uploaded: i, total: capture.photos.length });
    const photo = capture.photos[i];
    const slot = reservation.uploads[i];
    if (!photo || !slot) {
      throw new Error('Upload slot mismatch');
    }
    await uploadPhoto(slot.signed_url, photo.uri);
  }
  onProgress({
    phase: 'uploading',
    uploaded: capture.photos.length,
    total: capture.photos.length,
  });

  onProgress({ phase: 'finalizing' });
  const done = await finalizeMaterial(learnerId, {
    material_id: reservation.material_id,
    subject_id: capture.subject_id,
    folder_id: capture.folder_id,
    title: null,
    locale: 'de',
    target_item_count: 10,
    client_quality_scores: capture.photos.map((p, idx) => ({
      position: idx + 1,
      blur: p.quality.blur,
      brightness: p.quality.brightness,
      tilt: p.quality.tilt,
      width: p.quality.width,
      height: p.quality.height,
    })),
  });

  onProgress({ phase: 'done', done });
  return done;
}
