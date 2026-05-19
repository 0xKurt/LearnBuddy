// Materials API helpers. Doc 04 §materials + ADR 0003.
//
//   - reserveMaterial()  → POST /materials/upload-url
//   - enqueueMaterial()  → POST /materials (202; extraction runs in a worker)
//   - retryMaterial()    → POST /materials/:id/retry
//   - getMaterial()      → GET /materials/:id   (poll extraction_status)
//   - listMaterialItems()→ GET /materials/:id/items
//
// Extraction is no longer a held-open SSE stream the client must babysit:
// the server enqueues a durable job and the client polls material status.

import { z } from 'zod';
import {
  Item,
  Material,
  MaterialUploadUrlRequest,
  MaterialUploadUrlResponse,
  type MaterialUploadUrlRequest as MaterialUploadUrlRequestInput,
  type MaterialCreateRequest as MaterialCreateRequestInput,
} from '@learnbuddy/shared-types';

import { ApiError, api } from './client.js';

export async function reserveMaterial(
  learnerId: string,
  input: MaterialUploadUrlRequestInput,
): Promise<MaterialUploadUrlResponse> {
  MaterialUploadUrlRequest.parse(input);
  return api('/materials/upload-url', {
    method: 'POST',
    body: input,
    schema: MaterialUploadUrlResponse,
    learnerId,
  });
}

/** Upload a single photo to its signed PUT URL. Resolves when the storage
 *  service has accepted the bytes. Throws ApiError('upload_failed') on any
 *  non-2xx response so the orchestrator can refund + retry. */
export async function uploadPhoto(signedUrl: string, photoUri: string): Promise<void> {
  const body = await fetchAsBlob(photoUri);
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body,
  });
  if (!res.ok) {
    throw new ApiError('upload_failed', `Photo upload failed: ${res.status}`, res.status);
  }
}

async function fetchAsBlob(uri: string): Promise<Blob> {
  const r = await fetch(uri);
  if (!r.ok) throw new ApiError('upload_failed', `Could not read photo: ${r.status}`, r.status);
  return r.blob();
}

const EnqueueResponse = z.object({
  material_id: z.string(),
  status: z.string(),
});
export type EnqueueResponse = z.infer<typeof EnqueueResponse>;

/** POST /materials — enqueues extraction and returns immediately (202). The
 *  caller then polls getMaterial() until extraction_status is ready/failed. */
export async function enqueueMaterial(
  learnerId: string,
  input: MaterialCreateRequestInput,
): Promise<EnqueueResponse> {
  return api('/materials', {
    method: 'POST',
    body: input,
    schema: EnqueueResponse,
    learnerId,
  });
}

/** POST /materials/:id/retry — re-run extraction for a failed/stuck material
 *  from the already-uploaded photos. Guarded server-side against double
 *  charge / double enqueue. */
export async function retryMaterial(
  learnerId: string,
  materialId: string,
): Promise<EnqueueResponse> {
  return api(`/materials/${materialId}/retry`, {
    method: 'POST',
    schema: EnqueueResponse,
    learnerId,
  });
}

const MaterialListItem = z.object({
  id: z.string(),
  title: z.string().nullable(),
  extraction_status: z.string(),
  page_count: z.number().nullable(),
  created_at: z.string(),
  subject_id: z.string(),
  folder_id: z.string().nullable(),
});
export type MaterialListItem = z.infer<typeof MaterialListItem>;

export async function listMaterials(
  learnerId: string,
  params: { folderId?: string; subjectId?: string },
): Promise<MaterialListItem[]> {
  const qs = new URLSearchParams();
  if (params.folderId) qs.set('folder_id', params.folderId);
  else if (params.subjectId) qs.set('subject_id', params.subjectId);
  return api(`/materials?${qs.toString()}`, {
    method: 'GET',
    schema: z.array(MaterialListItem),
    learnerId,
  });
}

export async function getMaterial(
  learnerId: string,
  materialId: string,
): Promise<Material & { items: Item[] }> {
  return api(`/materials/${materialId}`, {
    method: 'GET',
    schema: Material.extend({
      items: z.array(Item),
      templates: z.array(z.unknown()).default([]),
      study_assets: z.array(z.unknown()).default([]),
    }),
    learnerId,
  });
}

export async function listMaterialItems(learnerId: string, materialId: string): Promise<Item[]> {
  const res = await api(`/materials/${materialId}/items`, {
    method: 'GET',
    schema: z.object({ items: z.array(Item) }),
    learnerId,
  });
  return res.items;
}

export async function deleteMaterial(learnerId: string, materialId: string): Promise<void> {
  await api(`/materials/${materialId}`, {
    method: 'DELETE',
    schema: z.object({ ok: z.boolean() }),
    learnerId,
  });
}
