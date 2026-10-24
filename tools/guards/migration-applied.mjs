// Positive production evidence for the exact candidate's new migrations (#915).
// Dependency-free: CI runs this without installing packages. Never run the probe in hooks.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Reuse the versioned production target; provisioning rewrites this for new Buddy projects.
// No environment/CLI override, and an unprovisioned URL supplies no evidence.
export const PRODUCTION_HEALTH_URL =
  /^\s*HEALTH_URL:[ \t]*(https:\/\/[^\s]+)[ \t]*$/m.exec(
    readFileSync(new URL('../../.github/workflows/health.yml', import.meta.url), 'utf8'),
  )?.[1] ?? '';
const DIRECTORY = 'infra/supabase/migrations/';
const NAME = /^\d{4}_[a-z0-9][a-z0-9_]{0,94}$/;

function git(args, cwd = process.cwd(), env = process.env) {
  return execFileSync('git', args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function commit(ref, cwd, env) {
  return git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], cwd, env);
}
function migrationName(path) {
  const name = path.slice(DIRECTORY.length, -4);
  if (!path.startsWith(DIRECTORY) || !path.endsWith('.sql') || !NAME.test(name))
    throw new Error('Invalid migration filename: ' + path);
  return name;
}

export function candidateMigrations(base, head = 'HEAD', cwd = process.cwd(), env = process.env) {
  const from = commit(base, cwd, env);
  const to = commit(head, cwd, env);
  const paths = git(['ls-tree', '-r', '--name-only', to, '--', DIRECTORY], cwd, env)
    .split('\n')
    .filter((p) => p.endsWith('.sql'));
  const numbers = new Set();
  for (const path of paths) {
    const name = migrationName(path);
    const number = name.slice(0, 4);
    if (numbers.has(number)) throw new Error('Migration number collision: ' + number);
    numbers.add(number);
  }
  const changes = git(
    ['diff', '--no-renames', '--name-status', '-z', from, to, '--', DIRECTORY],
    cwd,
    env,
  )
    .split('\0')
    .filter(Boolean);
  const added = [];
  for (let i = 0; i < changes.length; i += 2) {
    const [status, path] = changes.slice(i, i + 2);
    if (!path?.endsWith('.sql')) continue;
    if (status !== 'A') throw new Error('Historical migrations are immutable: ' + path);
    added.push(migrationName(path));
  }
  return added.sort();
}

export async function verifyApplied(names, request = globalThis.fetch) {
  for (let offset = 0; offset < names.length; offset += 20) {
    const expected = names.slice(offset, offset + 20);
    const url = new URL(PRODUCTION_HEALTH_URL);
    url.searchParams.set('expect', expected.join(','));
    const response = await request(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: globalThis.AbortSignal.timeout(15_000),
    });
    const source = new URL(response.url);
    if (response.status !== 200 || source.origin + source.pathname !== PRODUCTION_HEALTH_URL)
      throw new Error('No evidence from the production endpoint');
    const body = await response.json();
    const matches = (value) =>
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((name, i) => name === expected[i]);
    if (!matches(body?.expected) || !matches(body?.applied))
      throw new Error('Incomplete or unreadable migration evidence: ' + expected.join(','));
  }
}

async function main() {
  const base = process.argv[2];
  const head = process.argv[3] ?? 'HEAD';
  if (!base || process.argv.length > 4)
    throw new Error('usage: migration-applied.mjs <base> [<head>]');
  const from = commit(base);
  const to = commit(head);
  const names = candidateMigrations(from, to);
  await verifyApplied(names);
  if (commit(base) !== from || commit(head) !== to)
    throw new Error('Candidate/base changed during verification');
  console.log(`✓ Migration gate: ${names.length} new migrations verified for ${to}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('✗ Migration gate: ' + error.message);
    process.exitCode = 1;
  });
}
