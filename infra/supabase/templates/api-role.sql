-- The database role the API connects as (issue #107 §3; on LearnBuddy it existed only live,
-- made by hand on 28.09. and covered by no test). Versioned here, applied with psql, and
-- tested: apps/api/src/__tests__/api-role.int.test.ts runs the API on real Postgres 16 as
-- exactly this role.
--
--   set -a; . ./.buddy/secrets.env; set +a
--   psql "<admin connection string>" -v api_role=lb_api -v api_password="$LB_API_DB_PASSWORD" \
--        -f infra/supabase/templates/api-role.sql
--
-- Not a migration: a role is per cluster, its password is a secret, and the name is the
-- operator's choice. Run it after the migrations; running it again only resets the password
-- and the grants (idempotent).
--
-- What the API needs and gets: login; read and write on every table and sequence of
-- `public`; execute on its functions — now and for every later migration (default
-- privileges, so run this as the role that runs the migrations). BYPASSRLS, because row level
-- security is on for every table WITHOUT policies (0022_revoke_app_key_access.sql): the keys
-- in the app can read nothing, and the API scopes every query itself (docs/privacy.md
-- §Access control). What it does not get: superuser, creating roles or databases, DDL on
-- `public`, anything in `auth` or `storage` — accounts and files go through Supabase's own
-- APIs with the service-role key.
--
-- NOT VERIFIED LIVE: whether Supabase lets its `postgres` role grant BYPASSRLS to a new
-- role. If it refuses, the alternative is one permissive policy per table for this role
-- (`create policy api_all on <table> to lb_api using (true) with check (true)`), which then
-- has to be added for each new table in its migration.

\set ON_ERROR_STOP on

select exists (select 1 from pg_roles where rolname = :'api_role') as api_role_exists \gset

\if :api_role_exists
alter role :"api_role" with login password :'api_password'
  nosuperuser nocreatedb nocreaterole noreplication bypassrls;
\else
create role :"api_role" with login password :'api_password'
  nosuperuser nocreatedb nocreaterole noreplication bypassrls;
\endif

revoke create on schema public from :"api_role";
grant usage on schema public to :"api_role";
grant select, insert, update, delete on all tables in schema public to :"api_role";
grant usage, select, update on all sequences in schema public to :"api_role";
grant execute on all functions in schema public to :"api_role";

alter default privileges in schema public
  grant select, insert, update, delete on tables to :"api_role";
alter default privileges in schema public
  grant usage, select, update on sequences to :"api_role";
alter default privileges in schema public
  grant execute on functions to :"api_role";
