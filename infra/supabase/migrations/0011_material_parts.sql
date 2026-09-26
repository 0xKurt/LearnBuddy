-- Pages added to a sheet later (docs/architecture.md §Material).
--
-- A page photographed again, or added later ("Seite hinzufügen"), is sent as a
-- material of its own (`completes_material_id`, migration 0009) so upload,
-- reading and failure stay exactly as for any photo. Once it is read, its
-- questions join the sheet it completes: the same material, the same subject,
-- and for homework the same help session while it is still open. The part then
-- only records that it was merged, and lists and Buddy's context skip it.
alter table materials
  add column merged_into uuid references materials(id) on delete set null;
