import { z } from 'zod';
import { ExtractionStatus, Iso8601, SourceKind, Uuid } from './enums.js';

export const Material = z.object({
  id: Uuid,
  subject_id: Uuid,
  folder_id: Uuid.nullable(),
  learner_id: Uuid,
  title: z.string().nullable(),
  source_kind: SourceKind,
  page_count: z.number().int().min(1),
  extracted_markdown: z.string().nullable(),
  detected_language: z.string().nullable(),
  extraction_model: z.string().nullable(),
  extraction_prompt_version: z.string().nullable(),
  extraction_status: ExtractionStatus,
  extraction_error: z.string().nullable(),
  photos_deleted_at: Iso8601.nullable(),
  scheduled_photo_deletion_at: Iso8601.nullable(),
  archived_at: Iso8601.nullable(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type Material = z.infer<typeof Material>;

export const MaterialPhoto = z.object({
  id: Uuid,
  material_id: Uuid,
  position: z.number().int().nonnegative(),
  storage_path: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  byte_size: z.number().int().nullable(),
  client_blur_score: z.number().nullable(),
  client_brightness: z.number().nullable(),
  deleted_at: Iso8601.nullable(),
  created_at: Iso8601,
});
export type MaterialPhoto = z.infer<typeof MaterialPhoto>;

// ─── POST /materials/upload-url ─────────────────────────────────────────────
// Doc 04 §POST /materials/upload-url — body carries subject + folder + count;
// response includes the freshly-allocated material_id + signed PUT URLs.

export const MaterialUploadUrlRequest = z.object({
  subject_id: Uuid,
  folder_id: Uuid.nullable().optional(),
  photo_count: z.number().int().min(1).max(10),
  mime_type: z.string().default('image/jpeg'),
});
export type MaterialUploadUrlRequest = z.infer<typeof MaterialUploadUrlRequest>;

export const MaterialUploadEntry = z.object({
  position: z.number().int().min(1),
  storage_path: z.string(),
  signed_url: z.string().url(),
  expires_at: Iso8601,
});
export type MaterialUploadEntry = z.infer<typeof MaterialUploadEntry>;

export const MaterialUploadUrlResponse = z.object({
  material_id: Uuid,
  uploads: z.array(MaterialUploadEntry).min(1).max(10),
});
export type MaterialUploadUrlResponse = z.infer<typeof MaterialUploadUrlResponse>;

// ─── POST /materials ────────────────────────────────────────────────────────
// Doc 04 §POST /materials — body confirms the photos have been PUT to the
// signed URLs and triggers extraction. C2 wires placeholder items; D1 plugs
// the real Vertex pipeline behind the same endpoint.

export const ClientQualityScore = z.object({
  position: z.number().int().min(1),
  blur: z.number().nullable(),
  brightness: z.number().nullable(),
  tilt: z.number().nullable().optional(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ClientQualityScore = z.infer<typeof ClientQualityScore>;

export const MaterialCreateRequest = z.object({
  material_id: Uuid,
  subject_id: Uuid,
  folder_id: Uuid.nullable().optional(),
  title: z.string().nullable().optional(),
  locale: z.string().default('de'),
  grade_level: z.number().int().min(1).max(13).nullable().optional(),
  client_quality_scores: z.array(ClientQualityScore).min(1).max(10),
});
export type MaterialCreateRequest = z.infer<typeof MaterialCreateRequest>;

// Final SSE `done` payload. Phases (`reading_images`, `generating_items`, etc)
// are streamed before this; the mobile client picks them up from the SSE
// transport layer separately.
export const MaterialDoneEvent = z.object({
  material_id: Uuid,
  items: z.array(z.unknown()), // shape is `Item` from ./item.js — kept loose
  // to avoid a forward-reference circular import.
  templates: z.array(z.unknown()).default([]),
  study_assets: z.array(z.unknown()).default([]),
  extracted_language: z.string().default('de'),
  credits_used: z.number().int().nonnegative(),
});
export type MaterialDoneEvent = z.infer<typeof MaterialDoneEvent>;
