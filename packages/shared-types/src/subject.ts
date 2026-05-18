import { z } from 'zod';
import { Iso8601, SubjectKind, Uuid } from './enums.js';

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const Subject = z.object({
  id: Uuid,
  learner_id: Uuid,
  name: z.string().min(1),
  subject_kind: SubjectKind,
  color_hex: HexColor,
  icon_id: z.string().nullable(),
  custom_glyph: z.string().nullable().optional(),
  sort_order: z.number().int(),
  archived_at: Iso8601.nullable(),
  folder_count: z.number().int().nonnegative().optional(),
  material_count: z.number().int().nonnegative().optional(),
  upcoming_test_in_days: z.number().int().nullable().optional(),
  created_at: Iso8601,
  updated_at: Iso8601,
});
export type Subject = z.infer<typeof Subject>;

export const SubjectCreate = z.object({
  name: z.string().min(1),
  subject_kind: SubjectKind,
  color_hex: HexColor,
  icon_id: z.string().nullable().optional(),
  custom_glyph: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
});
export type SubjectCreate = z.infer<typeof SubjectCreate>;

export const SubjectUpdate = SubjectCreate.partial();
export type SubjectUpdate = z.infer<typeof SubjectUpdate>;
