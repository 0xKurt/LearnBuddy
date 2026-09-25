-- Minimal stand-ins for the Supabase-provided schemas so the real migrations
-- apply to vanilla Postgres 16 in tests and local development without the
-- Supabase stack. Never applied to a Supabase project.

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists net;
create schema if not exists cron;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);

create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000
) returns bigint language sql as $$ select 0::bigint $$;

create table if not exists cron.job (jobname text primary key, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $$
begin
  insert into cron.job values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  return 1;
end $$;
