-- 0008 — Storage buckets and their RLS policies.
-- Source: docs/02-architecture.md §supabase §storage.
--
-- materials-raw: uploaded photos. Lifecycle: deleted by pg_cron 7 days after
-- extraction_status='ready'.
-- study-assets: derivative images. Lives until the account holder deletes.

insert into storage.buckets (id, name, public)
values
  ('materials-raw', 'materials-raw', false),
  ('study-assets',  'study-assets',  false)
on conflict (id) do nothing;

-- Account holder can read their own raw photos (via signed URLs the API
-- generates with the service role; direct SELECT here is rarely used but
-- supported so a learner can confirm a recent upload before extraction).
create policy "materials_raw_owner_read" on storage.objects
  for select using (
    bucket_id = 'materials-raw'
    and (
      auth.uid() is not null
      and (storage.foldername(name))[1] = (
        select id::text from accounts where owner_user_id = auth.uid()
      )
    )
  );

create policy "study_assets_owner_read" on storage.objects
  for select using (
    bucket_id = 'study-assets'
    and (
      auth.uid() is not null
      and (storage.foldername(name))[1] = (
        select id::text from accounts where owner_user_id = auth.uid()
      )
    )
  );

-- Writes happen via signed PUT URLs minted by the API (service role).
-- No INSERT/UPDATE/DELETE policies for authenticated users.
