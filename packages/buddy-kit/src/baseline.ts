// The core copy's own database (issue #107, docs/buddy-kit.md §Kern ohne Domain): the schema the
// source's migrations build, without the learning domain's tables. Generated, never written by
// hand — on a scratch database of the test Postgres (`LB_TEST_DATABASE_URL`):
//
//   1. the test shim and every migration, exactly as the API's tests apply them;
//   2. the domain's tables dropped with `cascade` (DOMAIN_TABLES): their indexes, triggers and the
//      core's `domain_*` foreign keys go with them, the core's columns stay as plain uuids; the
//      extensions only the domain used (pg_trgm, vector) go when nothing else needs them;
//   3. `pg_dump` of the public schema, plus what the migrations put outside it (the storage
//      bucket, the scheduler's cron job) — packages/buddy-kit/core-baseline.sql.
//
// `pnpm core-check` builds that database again, and one from the checked-in baseline, and compares
// the two through the catalog (tables, columns, constraints, indexes, triggers, functions, grants,
// policies, the bucket and the cron job) — not the dump's text, which differs between pg_dump
// versions. A migration that changes the core's schema without `--write` is red.
// Uses psql and pg_dump; nothing here reaches a database other than the scratch ones it creates.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'infra/supabase/migrations';
const SHIM = 'infra/supabase/test-shim.sql';
export const BASELINE = 'packages/buddy-kit/core-baseline.sql';
/** The copy's one migration, in place of the source's. */
export const COPY_BASELINE = `${MIGRATIONS}/0001_baseline.sql`;

/** A source migration file (the copy leaves them out). */
export const isMigration = (file: string): boolean =>
  new RegExp(`^${MIGRATIONS}/\\d{4}_[a-z0-9_]+\\.sql$`).test(file);

/** Supabase-only extensions: the shim provides the schemas they would create (testing/database.ts). */
const forTests = (sql: string): string =>
  sql.replace(/^create extension if not exists (pg_cron|pg_net);$/gim, '-- test: $&');

/** The source's schema as the API's tests apply it: shim, then every migration in order. */
function sourceSql(repo: string): string {
  const dir = join(repo, MIGRATIONS);
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  return forTests(
    [
      readFileSync(join(repo, SHIM), 'utf8'),
      ...files.map((f) => readFileSync(join(dir, f), 'utf8')),
    ].join('\n;\n'),
  );
}

function urlFor(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

function run(cmd: string, args: string[], input?: string): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.trim().slice(0, 2000)}`);
  return r.stdout;
}

const psql = (url: string, sql: string): string =>
  run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-d', url], sql);

/** A scratch database for one build; `drop` removes it. */
function scratch(admin: string): { url: string; drop: () => void } {
  const name = `lb_core_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  psql(
    admin,
    `create database "${name}" encoding 'UTF8' locale_provider icu icu_locale 'en-US' locale 'C.UTF-8' template template0;`,
  );
  return {
    url: urlFor(admin, name),
    drop: () => void psql(admin, `drop database if exists "${name}" with (force);`),
  };
}

/** The source's schema without the domain's tables (steps 1 and 2). */
function buildCore(url: string, repo: string, domainTables: readonly string[]): void {
  psql(url, sourceSql(repo));
  psql(
    url,
    `drop table if exists ${domainTables.map((t) => `public.${t}`).join(', ')} cascade;
     do $$ begin
       begin drop extension if exists vector; exception when dependent_objects_still_exist then null; end;
       begin drop extension if exists pg_trgm; exception when dependent_objects_still_exist then null; end;
     end $$;`,
  );
}

/** A database built from the shim and the checked-in baseline, as a core copy's tests build it. */
function buildFromBaseline(url: string, repo: string): void {
  psql(
    url,
    forTests(
      [readFileSync(join(repo, SHIM), 'utf8'), readFileSync(join(repo, BASELINE), 'utf8')].join(
        '\n;\n',
      ),
    ),
  );
}

/**
 * The schema as the catalog holds it, one sorted line per fact: everything of the public schema
 * that is not an extension's own, the extensions, default privileges, the storage buckets and the
 * cron jobs.
 */
const FINGERPRINT = `
with own as (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
                      and d.objid = c.oid and d.deptype = 'e')
), lines as (
  select 'relation ' || c.relname || ' ' || c.relkind::text || ' rls=' || c.relrowsecurity
         || ' acl=' || coalesce(c.relacl::text, '-') as line
    from pg_class c where c.oid in (select oid from own) and c.relkind in ('r', 'p', 'v', 'm', 'S')
  union all
  select 'column ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
         || ' notnull=' || a.attnotnull || ' default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
         || ' identity=' || a.attidentity::text || ' generated=' || a.attgenerated::text
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.oid in (select oid from own) and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all
  select 'constraint ' || conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where conrelid in (select oid from own)
  union all
  select 'index ' || pg_get_indexdef(i.indexrelid)
    from pg_index i where i.indrelid in (select oid from own)
  union all
  select 'trigger ' || pg_get_triggerdef(t.oid)
    from pg_trigger t where t.tgrelid in (select oid from own) and not t.tgisinternal
  union all
  select 'policy ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '-')
         || ' ' || coalesce(with_check, '-') || ' ' || array_to_string(roles, ',')
    from pg_policies where schemaname = 'public'
  union all
  select 'view ' || c.relname || ' ' || pg_get_viewdef(c.oid)
    from pg_class c where c.oid in (select oid from own) and c.relkind in ('v', 'm')
  union all
  select 'function ' || p.oid::regprocedure::text || ' acl=' || coalesce(p.proacl::text, '-')
         || ' ' || md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
  union all
  select 'type ' || t.typname || ' ' || coalesce(
           (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '-')
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' and t.typtype in ('e', 'd')
  union all
  select 'extension ' || extname from pg_extension
  union all
  select 'default acl ' || defaclobjtype::text || ' ' || defaclacl::text
    from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace where n.nspname = 'public'
  union all
  select 'bucket ' || id || ' ' || name || ' public=' || public from storage.buckets
  union all
  select 'cron ' || jobname || ' ' || schedule || ' ' || command from cron.job
)
select line from lines order by line;`;

function fingerprint(url: string): string[] {
  return psql(url, FINGERPRINT)
    .split('\n')
    .filter((l) => l !== '');
}

/** What differs between the core schema the migrations build and the checked-in baseline. */
export function compareBaseline(
  admin: string,
  repo: string,
  domainTables: readonly string[],
): { missing: string[]; extra: string[] } {
  const core = scratch(admin);
  const copy = scratch(admin);
  try {
    buildCore(core.url, repo, domainTables);
    buildFromBaseline(copy.url, repo);
    const want = fingerprint(core.url);
    const have = new Set(fingerprint(copy.url));
    const wanted = new Set(want);
    return {
      missing: want.filter((l) => !have.has(l)),
      extra: [...have].filter((l) => !wanted.has(l)),
    };
  } finally {
    core.drop();
    copy.drop();
  }
}

/** The pg_dump to use: `LB_PG_DUMP`, else the one on the PATH; its major must match the server's. */
function pgDump(url: string): string {
  const bin = process.env.LB_PG_DUMP ?? 'pg_dump';
  const mine = /(\d+)\./.exec(run(bin, ['--version']))?.[1];
  const server = psql(url, 'show server_version_num;').trim().slice(0, 2);
  if (mine !== server)
    throw new Error(
      `${bin} is version ${mine}, the server ${server}: point LB_PG_DUMP at the server's pg_dump`,
    );
  return bin;
}

const HEADER = `-- The core copy's database (create-buddy --core, issue #107): the schema LearnBuddy's migrations
-- build, without the learning domain's tables. Generated by \`pnpm core-check --write\`
-- (packages/buddy-kit/src/baseline.ts) — never edit it by hand; core-check compares it with the
-- migrations through the catalog. In a core copy it is the only migration (0001_baseline.sql).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Every object gets exactly the grants the dump lists below: Supabase grants new objects in
-- public to its API roles by default, and the migrations revoked part of that (0022). The dump
-- states the defaults the migrations left at its end.
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
`;

/** Generates the baseline (step 3): the dump of the public schema, and what lies outside it. */
export function generateBaseline(
  admin: string,
  repo: string,
  domainTables: readonly string[],
): string {
  const core = scratch(admin);
  try {
    buildCore(core.url, repo, domainTables);
    const dump = run(pgDump(core.url), [
      '--schema-only',
      '--schema=public',
      '--no-owner',
      '--no-comments',
      '-d',
      core.url,
    ])
      .split('\n')
      // pg_dump's version lines and its per-run \\restrict key are not part of the schema.
      .filter((l) => !/^\\(un)?restrict |^-- Dumped (from|by) /.test(l))
      // The schema exists already wherever this runs (Supabase, the test shim).
      .map((l) => (l === 'CREATE SCHEMA public;' ? 'CREATE SCHEMA IF NOT EXISTS public;' : l))
      .join('\n');
    // A dump of one schema leaves out the extensions: the ones the core still uses, made first.
    const extensions = psql(
      core.url,
      `select extname from pg_extension where extname <> 'plpgsql' order by extname;`,
    )
      .split('\n')
      .filter(Boolean)
      .map((name) => `create extension if not exists ${name};`);
    const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const buckets = psql(
      core.url,
      `select id || '|' || name || '|' || public from storage.buckets order by id;`,
    )
      .split('\n')
      .filter(Boolean)
      .map((row) => {
        const [id = '', name = '', isPublic = 'f'] = row.split('|');
        return `insert into storage.buckets (id, name, public) values (${literal(id)}, ${literal(name)}, ${isPublic === 't'}) on conflict (id) do nothing;`;
      });
    const jobs = psql(
      core.url,
      `select jobname || '|' || schedule || '|' || command from cron.job order by jobname;`,
    )
      .split('\n')
      .filter(Boolean)
      .map((row) => {
        const [name = '', schedule = '', ...command] = row.split('|');
        return `select cron.schedule(${literal(name)}, ${literal(schedule)}, ${literal(command.join('|'))});`;
      });
    return `${HEADER}${extensions.join('\n')}\n\n${dump.trim()}\n\n-- Outside the public schema: the storage bucket and the scheduler's cron job.\n${[...buckets, ...jobs].join('\n')}\n`;
  } finally {
    core.drop();
  }
}

/** The copy's list of expected migrations (apps/api/src/lib/migrations.ts): the one baseline. */
export function coreMigrationList(text: string): string {
  return text.replace(
    /export const EXPECTED_MIGRATIONS: readonly string\[\] = \[[\s\S]*?\n\];/,
    "export const EXPECTED_MIGRATIONS: readonly string[] = ['0001_baseline'];",
  );
}
