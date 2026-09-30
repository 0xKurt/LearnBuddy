-- A sheet whose questions are not all there yet (issue #150).
--
-- A reading returns as many questions as one model answer can hold; a sheet with more says
-- so and is read again for the rest (ITEMS_PER_READING, MOST_READINGS in
-- modules/materials/extract.ts). If it is still not covered after those readings, the sheet
-- is incomplete — and it says so rather than looking whole, because looking whole is
-- exactly what made "frag mich alle Vokabeln ab" hand back half a word list (#49, #145).
alter table materials
  add column items_incomplete boolean not null default false;

comment on column materials.items_incomplete is
  'The sheet holds more questions than were read into items. Buddy says so instead of letting a half-read sheet pass for a whole one. Issue #150.';
