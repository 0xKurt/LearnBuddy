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

export async function listFolders(subjectId: string): Promise<Folder[]> {
  return api(`/subjects/${subjectId}/folders`, {
    method: 'GET',
    schema: z.array(Folder),
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
