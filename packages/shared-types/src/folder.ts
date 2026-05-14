import { z } from 'zod';
import { Iso8601, Uuid } from './enums.js';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const Folder = z.object({
  id: Uuid,
  subject_id: Uuid,
  name: z.string().min(1),
  scheduled_for: DateOnly.nullable(),
  archived_at: Iso8601.nullable(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type Folder = z.infer<typeof Folder>;

export const FolderCreate = z.object({
  name: z.string().min(1),
  scheduled_for: DateOnly.nullable().optional(),
});
export type FolderCreate = z.infer<typeof FolderCreate>;

export const FolderUpdate = FolderCreate.partial();
export type FolderUpdate = z.infer<typeof FolderUpdate>;
