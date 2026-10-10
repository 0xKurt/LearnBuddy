// pnpm create-buddy <target-dir> --name … --bundle-id … [options]
// pnpm create-buddy <target-dir> --config packages/buddy-kit/reference.config.json
// Creates a new, independent Buddy project from this repository (issue #107 §2).
// docs/buddy-kit.md has the ten steps from here to a running app.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CAPABILITIES, KIT_LOCALES, KitError, parseConfig, type BuddyConfig } from '../config.js';
import { createBuddy } from '../create.js';
import { parseArgs } from './args.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const USAGE = `pnpm create-buddy <target-dir> --name "Fit Buddy" --bundle-id com.example.fitbuddy
  [--id fitbuddy] [--scheme fitbuddy] [--repo owner/fitbuddy]
  [--audience adults-only|minors-with-guardian] [--locales de,en] [--default-locale de]
  [--capabilities ${CAPABILITIES.join(',')}] [--vertex-location europe-west4]
  [--git] [--verify | --verify=typecheck]
pnpm create-buddy <target-dir> --config <buddy.config.json> [--git] [--verify…]
Without a terminal every required value must be given as a flag (or in --config).
--git: own repository on main with a first commit. --verify: install, typecheck, lint, test in
the new project; --verify=typecheck: install, typecheck and provision --dry-run (CI).`;

const VALUED = [
  'config',
  'id',
  'name',
  'bundle-id',
  'scheme',
  'repo',
  'audience',
  'locales',
  'default-locale',
  'capabilities',
  'vertex-location',
] as const;
type Valued = (typeof VALUED)[number];

const GATES = {
  all: [['install', '--frozen-lockfile', '--prefer-offline'], ['typecheck'], ['lint'], ['test']],
  typecheck: [
    ['install', '--frozen-lockfile', '--prefer-offline'],
    ['typecheck'],
    ['provision', '--dry-run'],
  ],
} as const;

async function askConfig(get: (k: Valued) => string | undefined): Promise<BuddyConfig> {
  const tty = process.stdin.isTTY === true;
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (k: Valued, question: string, fallback?: string) => {
    const given = get(k);
    if (given !== undefined) return given;
    if (fallback !== undefined && !rl) return fallback;
    if (!rl) throw new KitError(`--${k} is required without a terminal\n\n${USAGE}`);
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback || '';
  };
  try {
    const name = await ask('name', 'Name der App');
    const defaultId = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const id = await ask('id', 'Id (klein, ohne Leerzeichen)', defaultId);
    const bundleId = await ask('bundle-id', 'Bundle-ID (com.firma.app)');
    const scheme = await ask('scheme', 'Deep-Link-Scheme', id);
    const repo = await ask('repo', 'GitHub-Repository (owner/name, leer = später)', '');
    const audience = await ask(
      'audience',
      'Zielgruppe (adults-only | minors-with-guardian)',
      'adults-only',
    );
    const locales = (await ask('locales', `Sprachen (${KIT_LOCALES.join(',')})`, 'de'))
      .split(',')
      .map((s) => s.trim());
    const defaultLocale = await ask('default-locale', 'Standardsprache', locales[0]);
    const capsRaw = await ask(
      'capabilities',
      `Fähigkeiten (${CAPABILITIES.join(',')}; leer = keine)`,
      '',
    );
    const vertexLocation = await ask('vertex-location', 'Vertex-Region (EU)', 'europe-west4');
    return parseConfig({
      identity: { id, name, bundleId, scheme, ...(repo ? { repo } : {}) },
      policy: { audience, supabaseRegion: 'eu-central-1', vercelRegion: 'fra1', vertexLocation },
      content: { locales, defaultLocale },
      wiring: { capabilities: capsRaw ? capsRaw.split(',').map((s) => s.trim()) : [] },
      legal: {},
    });
  } finally {
    rl?.close();
  }
}

/**
 * git in the NEW repository. None of the caller's GIT_* variables: inside a hook they point at
 * the source's repository, and `git init` would act on that (tools/guards/scratch-repo.mjs).
 */
function git(args: string[], cwd: string): void {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('GIT_') || /^GIT_(AUTHOR|COMMITTER)_/.test(k),
    ),
  );
  const run = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (run.status !== 0)
    throw new KitError(`git ${args[0]} failed in ${cwd}:\n${run.stderr.trim()}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), VALUED);
  if (args.flags.has('help') || args.positional.length !== 1) {
    console.log(USAGE);
    process.exit(args.flags.has('help') ? 0 : 2);
  }
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const target = resolve(cwd, args.positional[0]!);
  const get = (k: Valued) => args.values.get(k)?.at(-1);
  const configFile = get('config');
  const config = configFile
    ? parseConfig(JSON.parse(readFileSync(resolve(cwd, configFile), 'utf8')))
    : await askConfig(get);

  const files = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const boundaries = pathToFileURL(join(REPO, 'tools/guards/boundaries.config.mjs')).href;
  const { DOMAIN } = (await import(boundaries)) as { DOMAIN: string[] };
  const report = createBuddy({
    sourceRoot: REPO,
    targetRoot: target,
    files,
    config,
    domain: DOMAIN,
  });
  console.log(
    `✓ ${config.identity.name} in ${target}: ${report.copied} Dateien kopiert, ${report.skipped.length} ausgelassen, ${report.rewritten.length} mit neuer Identität.`,
  );
  if (report.links.length > 0) {
    const lines = report.links.map((l) => `  ${l.file}:${l.line} — ${l.what}`);
    throw new KitError(
      `the copy still points at the source's infrastructure (${report.links.length}):\n${lines.join('\n')}\nThe kit misses a rewrite (packages/buddy-kit/src/rewrite.ts); the copy is left for a look.`,
    );
  }
  console.log('✓ keine Verbindung zur Infrastruktur der Quelle');
  const domain = report.domain.reduce((s, d) => s + d.files, 0);
  console.log(`  Lern-Domain noch in ${domain} Dateien — BUDDY-SETUP.md §2.`);

  if (args.flags.has('git')) {
    git(['init', '-q', '-b', 'main'], target);
    git(['add', '-A'], target);
    git(['commit', '-q', '-m', `${config.identity.name}: erzeugt mit create-buddy`], target);
    console.log('✓ eigenes Repository auf main, erster Commit (ohne die Historie der Quelle)');
  }
  if (args.flags.has('verify')) {
    const which = args.values.get('verify')?.at(-1) ?? 'all';
    if (which !== 'all' && which !== 'typecheck')
      throw new KitError(`--verify takes nothing or "typecheck", not "${which}"`);
    // Integration tests need the local Postgres (LB_TEST_DATABASE_URL) exactly like here.
    for (const cmd of GATES[which]) {
      console.log(`→ pnpm ${cmd.join(' ')}`);
      const run = spawnSync('pnpm', [...cmd], { cwd: target, stdio: 'inherit' });
      if (run.status !== 0) throw new KitError(`pnpm ${cmd.join(' ')} failed in ${target}`);
    }
    console.log(`✓ ${GATES[which].map((c) => c[0]).join(', ')} grün im neuen Projekt`);
  }
  console.log('Weiter: BUDDY-SETUP.md und docs/buddy-kit.md');
}

main().catch((err: unknown) => {
  if (err instanceof KitError) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
  throw err;
});
