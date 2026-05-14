import { z } from 'zod';
import { Iso8601, StudyAssetKind, Uuid } from './enums.js';

export const StudyAssetMetadata = z
  .object({
    label_positions: z
      .array(
        z.object({
          index: z.number().int().min(1),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        }),
      )
      .optional(),
    original_label_text: z.array(z.string()).optional(),
    fallback: z.enum(['no_masking']).nullable().optional(),
    graph_meta: z.unknown().optional(),
  })
  .passthrough();
export type StudyAssetMetadata = z.infer<typeof StudyAssetMetadata>;

export const StudyAsset = z.object({
  id: Uuid,
  material_id: Uuid,
  learner_id: Uuid,
  kind: StudyAssetKind,
  storage_path: z.string(),
  source_page_index: z.number().int().nullable(),
  title: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  metadata: StudyAssetMetadata,
  created_at: Iso8601,
});
export type StudyAsset = z.infer<typeof StudyAsset>;
