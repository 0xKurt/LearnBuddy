// Folder API helpers. Doc 04 §subjects-and-folders.

import { z } from 'zod';
import {
  Folder,
  FolderCreate,
  FolderUpdate,
  type FolderCreate as FolderCreateInput,
  type FolderUpdate as FolderUpdateInput,
} from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';

/** Folder list row enriched with the aggregate counts the Subject screen
 *  shows alongside each Lernziel ("3 Materialien · 24 Karten"). The
 *  /subjects/:id/folders endpoint computes these server-side. */
const FolderListItem = Folder.extend({
  material_count: z.number(),
  item_count: z.number(),
  has_pending: z.boolean(),
  has_failed: z.boolean(),
});
export type FolderListItem = z.infer<typeof FolderListItem>;

export async function listFolders(subjectId: string): Promise<FolderListItem[]> {
  return api(`/subjects/${subjectId}/folders`, {
    method: 'GET',
    schema: z.array(FolderListItem),
  });
}

export async function createFolder(subjectId: string, input: FolderCreateInput): Promise<Folder> {
  FolderCreate.parse(input);
  return api(`/subjects/${subjectId}/folders`, {
    method: 'POST',
    body: input,
    schema: Folder,
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function updateFolder(id: string, input: FolderUpdateInput): Promise<Folder> {
  FolderUpdate.parse(input);
  return api(`/folders/${id}`, { method: 'PATCH', body: input, schema: Folder });
}

export async function archiveFolder(id: string): Promise<{ id: string; archived: true }> {
  return api(`/folders/${id}`, { method: 'DELETE' }) as Promise<{ id: string; archived: true }>;
}

const FolderMaterial = z.object({
  id: z.string(),
  title: z.string().nullable(),
  extraction_status: z.string(),
  page_count: z.number().nullable(),
  created_at: z.string(),
});
const FolderItem = z.object({
  id: z.string(),
  question: z.string(),
  expected_answer: z.string(),
  material_id: z.string(),
  created_at: z.string(),
});
const FolderDetail = Folder.extend({
  materials: z.array(FolderMaterial),
  items: z.array(FolderItem),
});
export type FolderDetail = z.infer<typeof FolderDetail>;
export type FolderMaterial = z.infer<typeof FolderMaterial>;
export type FolderItem = z.infer<typeof FolderItem>;

/** GET /folders/:id — Lernziel-Detail: folder metadata + every
 *  non-archived item across every non-archived material inside. */
export async function getFolderDetail(folderId: string): Promise<FolderDetail> {
  return api(`/folders/${folderId}`, {
    method: 'GET',
    schema: FolderDetail,
  });
}
