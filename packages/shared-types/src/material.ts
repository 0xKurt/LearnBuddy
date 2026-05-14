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

export const MaterialUploadUrlRequest = z.object({
  photo_count: z.number().int().min(1).max(10),
});
export type MaterialUploadUrlRequest = z.infer<typeof MaterialUploadUrlRequest>;

export const MaterialUploadUrlResponse = z.object({
  upload_urls: z.array(
    z.object({
      position: z.number().int(),
      storage_path: z.string(),
      signed_url: z.string().url(),
      expires_at: Iso8601,
    }),
  ),
});
export type MaterialUploadUrlResponse = z.infer<typeof MaterialUploadUrlResponse>;

export const MaterialCreateRequest = z.object({
  subject_id: Uuid,
  folder_id: Uuid.nullable().optional(),
  title: z.string().nullable().optional(),
  source_kind: SourceKind.default('photo'),
  photos: z.array(
    z.object({
      storage_path: z.string(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      byte_size: z.number().int().nullable(),
      client_quality_scores: z
        .object({
          blur: z.number().nullable(),
          brightness: z.number().nullable(),
        })
        .nullable()
        .optional(),
    }),
  ).min(1).max(10),
  target_item_count: z.number().int().min(1).max(25).default(10),
});
export type MaterialCreateRequest = z.infer<typeof MaterialCreateRequest>;
