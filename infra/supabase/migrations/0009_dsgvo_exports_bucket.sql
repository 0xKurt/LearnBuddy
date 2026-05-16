-- 0009 — dsgvo-exports storage bucket.
-- Source: infra/supabase/functions/dsgvo-export-worker/index.ts (Slice G1).
-- The export worker uploads each account's JSON dump here and generates a
-- 7-day signed URL. RLS: only the account owner reads back their own dump.

insert into storage.buckets (id, name, public)
values ('dsgvo-exports', 'dsgvo-exports', false)
on conflict (id) do nothing;

create policy "dsgvo_exports_owner_read" on storage.objects
  for select using (
    bucket_id = 'dsgvo-exports'
    and (
      auth.uid() is not null
      and (storage.foldername(name))[1] = (
        select id::text from accounts where owner_user_id = auth.uid()
      )
    )
  );
