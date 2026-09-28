-- Security advisor (Supabase linter 0011, audit 29.09.): the trigger function ran with a
-- mutable search_path. A function without a fixed path resolves names through whatever the
-- caller's search_path says — the classic way to slip a different `now()` in front of the
-- real one. It only needs pg_catalog, so it says so.
create or replace function lb_touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
