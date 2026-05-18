-- Expand subject_kind + add custom_glyph.
-- Doc 05 §subject-form — Batch 6 UX overhaul.

-- Drop the old check constraint (Supabase names it automatically as subjects_subject_kind_check).
alter table subjects drop constraint if exists subjects_subject_kind_check;

-- Re-add with the full expanded list.
alter table subjects
  add constraint subjects_subject_kind_check
  check (subject_kind in (
    'math','physics','chemistry','biology','geography',
    'history','language_native','language_foreign',
    'religion_ethics','art_music','general','other',
    'computer_science','economics','law','philosophy','literature','sports'
  ));

-- Optional custom emoji to override the kind's default glyph on the tile.
alter table subjects add column if not exists custom_glyph text;
