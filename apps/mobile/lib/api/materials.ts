// Materials API helpers. Doc 04 §materials.
//
// Slice C2 ships:
//   - reserveMaterial()      → POST /materials/upload-url
//   - finalizeMaterial()     → POST /materials, returns the SSE `done` payload
//   - getMaterial()          → GET /materials/:id
//   - listMaterialItems()    → GET /materials/:id/items
//
// SSE on RN: native `fetch` exposes no streaming reader, but XHR's
// `onreadystatechange` fires on every chunk during readyState 3. We
// accumulate the response text, parse complete `event:/data:` blocks as
// they arrive, surface `phase` events through `onPhase`, and resolve the
// returned promise with the `done` payload. No external dep needed.

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

export type FinalizePhase = 'reading_images' | 'generating_items' | 'cropping_diagrams';

/** POST /materials. Streams the SSE body via XHR — `onPhase` fires on every
 *  intermediate `phase` event so the UI can show real progress. Resolves
 *  with the `done` payload, rejects on `error` events or non-2xx status. */
export function finalizeMaterial(
  learnerId: string,
  input: MaterialCreateRequestInput,
  onPhase?: (phase: FinalizePhase) => void,
): Promise<DoneEvent> {
  const url = new URL('/materials', ENV.API_URL).toString();
  const token = getSessionSync()?.access_token;

  return new Promise<DoneEvent>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('content-type', 'application/json');
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-learner-id', learnerId);
    // The default `text` parser keeps the responseText growing as chunks
    // arrive; we just track how much we've already parsed.
    let cursor = 0;
    let donePayload: unknown = null;
    let streamError: { code: string; message: string } | null = null;
    xhr.onreadystatechange = () => {
      // readyState 3 = LOADING — chunks arriving. readyState 4 = DONE.
      if (xhr.readyState < 3) return;
      const chunk = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      if (chunk) {
        for (const ev of parseSseChunks(chunk)) {
          if (ev.event === 'phase' && ev.data) {
            try {
              const p = (JSON.parse(ev.data) as { phase: FinalizePhase }).phase;
              onPhase?.(p);
            } catch {
              // ignore malformed phase data
            }
          }
          if (ev.event === 'done' && ev.data) {
            try {
              donePayload = JSON.parse(ev.data);
            } catch (err) {
              streamError = { code: 'extraction_failed', message: String(err) };
            }
          }
          if (ev.event === 'error' && ev.data) {
            try {
              streamError = JSON.parse(ev.data) as { code: string; message: string };
            } catch {
              streamError = { code: 'extraction_failed', message: ev.data };
            }
          }
        }
      }
      if (xhr.readyState !== 4) return;

      if (xhr.status < 200 || xhr.status >= 300) {
        let code = 'unknown';
        let message = `Request failed: ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: { code?: string; message?: string };
          };
          code = body.error?.code ?? code;
          message = body.error?.message ?? message;
        } catch {
          // non-JSON error body
        }
        reject(new ApiError(code, message, xhr.status));
        return;
      }
      if (streamError) {
        reject(new ApiError(streamError.code, streamError.message, 502));
        return;
      }
      if (!donePayload) {
        reject(new ApiError('extraction_failed', 'SSE stream ended without a done event', 502));
        return;
      }
      try {
        resolve(DoneEvent.parse(donePayload));
      } catch (err) {
        reject(
          new ApiError(
            'extraction_failed',
            err instanceof Error ? err.message : 'Done payload validation failed',
            502,
          ),
        );
      }
    };
    xhr.onerror = () => {
      reject(new ApiError('extraction_failed', 'Network error during materials upload', 0));
    };
    xhr.send(JSON.stringify(input));
  });
}

/** Carry-over buffer for chunk boundaries that split mid-event. */
let sseRemainder = '';

/** Parse a chunk of SSE text into discrete `{event, data}` events.
 *  Handles event blocks straddling chunk boundaries via `sseRemainder`. */
function parseSseChunks(chunk: string): Array<{ event: string; data: string }> {
  const combined = sseRemainder + chunk;
  const blocks = combined.split('\n\n');
  sseRemainder = blocks.pop() ?? ''; // last fragment is incomplete unless it ended with \n\n
  const out: Array<{ event: string; data: string }> = [];
  for (const block of blocks) {
    let evName = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) evName = line.slice('event: '.length).trim();
      else if (line.startsWith('data: ')) data += (data ? '\n' : '') + line.slice('data: '.length);
    }
    if (data) out.push({ event: evName, data });
  }
  return out;
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
