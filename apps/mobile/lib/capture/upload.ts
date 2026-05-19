// Drain the capture store through the upload pipeline:
// reserveMaterial → PUT each photo → enqueueMaterial. Extraction itself runs
// in a server-side worker (ADR 0003); the upload screen polls material
// status afterwards, so this resolves as soon as the job is queued.

import { enqueueMaterial, reserveMaterial, uploadPhoto } from '../api/materials.js';
import { i18n } from '../i18n/index.js';
import type { AppLocale } from '../i18n/locale-storage.js';
import type { PendingCapture } from '../store/capture.js';

export type UploadProgress =
  | { phase: 'reserving' }
  | { phase: 'uploading'; uploaded: number; total: number }
  | { phase: 'enqueuing' };

export type UploadResult = { material_id: string };

export async function runUpload(
  learnerId: string,
  capture: PendingCapture,
  onProgress: (p: UploadProgress) => void,
): Promise<UploadResult> {
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

  onProgress({ phase: 'enqueuing' });
  const res = await enqueueMaterial(learnerId, {
    material_id: reservation.material_id,
    subject_id: capture.subject_id,
    folder_id: capture.folder_id,
    title: null,
    locale: (i18n.language ?? 'de') as AppLocale,
    client_quality_scores: capture.photos.map((p, idx) => ({
      position: idx + 1,
      blur: p.quality.blur,
      brightness: p.quality.brightness,
      tilt: p.quality.tilt,
      width: p.quality.width,
      height: p.quality.height,
    })),
  });

  return { material_id: res.material_id };
}
