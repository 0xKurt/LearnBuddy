// Deploy checks (audit S-9; docs/architecture.md §Delivery): run in CI and before promoting a
// deploy. Each check prints one line; any FAIL exits non-zero. Run via scripts/deploy-check.sh.
//
//   always            vercel.json through Vercel's own builder detector (@vercel/fs-detectors)
//   DATABASE_URL      TLS settings, region (warning only, D-4), and that the app keys (anon,
//                     authenticated) can execute no function and every table has RLS
//   LB_DEPLOY_URL     GET <url>/v1/health answers 200 with ok: true
//
// LB_FS_DETECTORS_DIR points at a directory with @vercel/fs-detectors installed (the wrapper
// installs it there so the lockfile does not carry Vercel's build tooling).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pg from 'pg';

import { databaseRegionWarning, databaseTlsIssue } from '../src/config.js';
import { connectionOptions } from '../src/lib/db.js';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;
const ok = (msg: string) => console.info(`ok    ${msg}`);
const warn = (msg: string) => console.warn(`WARN  ${msg}`);
const fail = (msg: string) => {
  failed = true;
  console.error(`FAIL  ${msg}`);
};

type Builder = { src?: string; use: string };
type DetectResult = {
  errors: Array<{ code: string; message: string }> | null;
  builders: Builder[] | null;
};
type Detectors = {
  detectBuilders(
    files: string[],
    pkg: unknown,
    options: {
      functions?: unknown;
      projectSettings: Record<string, unknown>;
      featHandleMiss: boolean;
    },
  ): Promise<DetectResult>;
};

type VercelJson = {
  framework?: string | null;
  buildCommand?: string | null;
  outputDirectory?: string | null;
  functions?: Record<string, Record<string, unknown>>;
  rewrites?: Array<{ source: string; destination: string }>;
};

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) listFiles(path, out);
    else out.push(relative(API_ROOT, path));
  }
  return out;
}

async function loadDetectors(): Promise<Detectors> {
  const dir = process.env.LB_FS_DETECTORS_DIR;
  const require = createRequire(dir ? join(dir, 'package.json') : import.meta.url);
  const entry = require.resolve('@vercel/fs-detectors');
  return (await import(pathToFileURL(entry).href)) as Detectors;
}

async function checkVercel(): Promise<void> {
  const config = JSON.parse(readFileSync(join(API_ROOT, 'vercel.json'), 'utf8')) as VercelJson;
  const pkg: unknown = JSON.parse(readFileSync(join(API_ROOT, 'package.json'), 'utf8'));
  const detectors = await loadDetectors();
  const result = await detectors.detectBuilders(listFiles(API_ROOT), pkg, {
    functions: config.functions,
    projectSettings: {
      framework: config.framework ?? null,
      buildCommand: config.buildCommand,
      outputDirectory: config.outputDirectory,
    },
    featHandleMiss: true,
  });
  if (result.errors?.length) {
    for (const e of result.errors) fail(`vercel: ${e.code}: ${e.message}`);
    return;
  }
  const builders = result.builders ?? [];
  const fn = builders.find((b) => b.src === 'api/index.ts');
  if (fn?.use === '@vercel/node') ok('vercel: api/index.ts builds as a Node function');
  else fail('vercel: api/index.ts is not detected as a Node function');
  // Anything served statically must come from public/ only, never src/ or .env files.
  for (const b of builders.filter((x) => x.use === '@vercel/static')) {
    if (b.src === 'public/**/*') ok('vercel: static files only from public/');
    else fail(`vercel: static builder would publish ${b.src ?? '(all files)'}`);
  }
  const rewrites = config.rewrites ?? [];
  const nested = (prefix: string) =>
    rewrites.some((r) => r.source === `${prefix}/(.*)` && r.destination === '/api');
  if (nested('/v1') && nested('/api')) ok('vercel: /v1/* and /api/* (nested paths) reach the API');
  else fail('vercel: rewrites must send /v1/(.*) and /api/(.*) to /api');
}

async function checkDatabase(url: string): Promise<void> {
  const tls = databaseTlsIssue(url);
  if (tls) fail(`database: ${tls}`);
  else ok('database: TLS with certificate verification for remote hosts');
  const region = databaseRegionWarning(url);
  if (region) warn(`database: ${region}`);
  else ok('database: region is an EU member state (or local)');
  if (tls) return;
  const client = new pg.Client({
    ...connectionOptions(url, process.env.DATABASE_CA_CERT || undefined),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const fns = await client.query<{ fn: string; role: string }>(
      `select p.oid::regprocedure::text as fn, r.role
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join (values ('anon'), ('authenticated')) as r(role)
        where n.nspname = 'public'
          and not exists (select 1 from pg_depend d
                           where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                             and d.deptype = 'e')
          and has_function_privilege(r.role, p.oid, 'execute')`,
    );
    if (fns.rows.length === 0) ok('database: the app keys can execute no public function');
    for (const row of fns.rows) fail(`database: ${row.role} can execute ${row.fn}`);
    const tables = await client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    if (tables.rows.length === 0) ok('database: row level security on every public table');
    for (const row of tables.rows) fail(`database: no row level security on ${row.relname}`);
  } finally {
    await client.end();
  }
}

async function checkHealth(base: string): Promise<void> {
  const url = `${base.replace(/\/+$/, '')}/v1/health`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    if (res.status === 200 && body?.ok === true) ok(`deploy: ${url} is healthy`);
    else fail(`deploy: ${url} answered ${res.status} ${JSON.stringify(body)}`);
  } catch (err) {
    fail(`deploy: ${url} unreachable (${err instanceof Error ? err.message : 'unknown'})`);
  }
}

await checkVercel();
if (process.env.DATABASE_URL) await checkDatabase(process.env.DATABASE_URL);
else console.info('skip  database checks (no DATABASE_URL)');
if (process.env.LB_DEPLOY_URL) await checkHealth(process.env.LB_DEPLOY_URL);
else console.info('skip  deploy health smoke (no LB_DEPLOY_URL)');
process.exit(failed ? 1 : 0);
