-- Worksheets as PDF (docs/architecture.md §Material, docs/privacy.md): a material file may be
-- a PDF next to photos. Its page count is set when the upload is submitted; the material's
-- photo_count then counts pages (a photo is one page), still at most 20.

alter table material_photos drop constraint material_photos_mime_check;
alter table material_photos
  add constraint material_photos_mime_check
  check (mime in ('image/jpeg', 'image/png', 'application/pdf'));

alter table material_photos
  add column page_count smallint check (page_count between 1 and 20);

comment on column material_photos.page_count is
  'Pages of a PDF (set on submit); null for a photo, which is one page.';
