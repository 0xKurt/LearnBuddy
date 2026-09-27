-- The anon and authenticated keys ship inside the app and must reach nothing in the
-- database directly (docs/privacy.md §Access control). Supabase grants EXECUTE on every
-- function in the exposed public schema to both roles by default; 0001 revoked only
-- PUBLIC, so POST /rest/v1/rpc/lb_invoke_tick with the anon key made the database send
-- an authenticated tick (audit M-6 p2-sec-anon-rpc-lb-invoke-tick). Only pg_cron (as
-- postgres) and the API's privileged role call these functions.

do $$
declare
  f regprocedure;
  t text;
begin
  -- Every function the app's migrations created in public (not extension members).
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                          and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- Row level security (without policies) on every table, including any added after 0001.
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Supabase's schema-level default grant to the app keys is withdrawn for functions created
-- later. Postgres' global EXECUTE-to-PUBLIC default cannot be revoked per schema, so a new
-- function still needs its own revoke; database-exposure.int.test.ts fails until it has one.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
