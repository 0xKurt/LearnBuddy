// Materials API helpers. Doc 04 §materials.
//
// Slice C2 ships:
//   - reserveMaterial()      → POST /materials/upload-url
//   - finalizeMaterial()     → POST /materials, returns the SSE `done` payload
//   - getMaterial()          → GET /materials/:id
//   - listMaterialItems()    → GET /materials/:id/items
//
// SSE on RN: native fetch doesn't expose a streaming reader, so for the
// placeholder pipeline we await the full response text and parse the trailing
// `data: {…}` line of the `done` event. Slice D1 (real Vertex) will swap in
// a proper EventSource-style transport via expo-event-source or a custom XHR
// chunk parser; the on-screen phase animation in (learner)/upload.tsx runs
// on its own clock and is independent of the transport.

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
import { ENV } from '../env.js';
import { getSessionSync } from '../auth/session.js';

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

const DoneEvent = z.object({
  material_id: z.string(),
  items: z.array(Item),
  templates: z.array(z.unknown()).default([]),
  study_assets: z.array(z.unknown()).default([]),
  extracted_language: z.string().default('de'),
  credits_used: z.number().int().nonnegative(),
});
export type DoneEvent = z.infer<typeof DoneEvent>;

/** POST /materials. Parses the SSE body and returns the `done` payload. */
export async function finalizeMaterial(
  learnerId: string,
  input: MaterialCreateRequestInput,
): Promise<DoneEvent> {
  const url = new URL('/materials', ENV.API_URL).toString();
  const token = getSessionSync()?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-learner-id': learnerId,
    },
    body: JSON.stringify(input),
  });

  const text = await res.text();
  if (!res.ok) {
    let code = 'unknown';
    let message = `Request failed: ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // non-JSON body — keep the defaults
    }
    throw new ApiError(code, message, res.status);
  }

  const done = parseSseDoneEvent(text);
  return DoneEvent.parse(done);
}

/** Scan an SSE response body and pull out the `done` event's data payload.
 *  Returns the parsed JSON or throws if the stream ended on `error`. */
function parseSseDoneEvent(body: string): unknown {
  const blocks = body.split('\n\n');
  let lastEvent: string | null = null;
  let doneData: string | null = null;
  let errorData: string | null = null;
  for (const block of blocks) {
    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        lastEvent = line.slice('event: '.length).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice('data: '.length);
        if (lastEvent === 'done') doneData = data;
        if (lastEvent === 'error') errorData = data;
      }
    }
  }
  if (errorData) {
    const err = JSON.parse(errorData) as { code: string; message: string };
    throw new ApiError(err.code, err.message, 502);
  }
  if (!doneData) {
    throw new ApiError('extraction_failed', 'SSE stream ended without a done event', 502);
  }
  return JSON.parse(doneData);
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
