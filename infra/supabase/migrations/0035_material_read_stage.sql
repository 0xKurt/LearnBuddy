-- Real progress while Buddy reads a sheet (gap 5, docs/architecture.md §Material): the
-- reading reports where it is, and the card on the home shows only these real stages
-- (CLAUDE.md rule 5) — never a played progress bar.
--   opening   the photos are being loaded for reading
--   reading   the model is reading them (one call for all pages: no per-page progress)
-- Set by the run that holds the reading job's lease; the app clock stamps each change.
-- Queued, ready and failed are the material's status; "making practice" afterwards is the
-- Buddy check the reading woke (jobs), not a column here.
alter table materials
  add column read_stage text check (read_stage in ('opening', 'reading')),
  add column read_stage_at timestamptz;
