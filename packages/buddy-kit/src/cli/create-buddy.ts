// pnpm create-buddy <target-dir> --name … --bundle-id … [options]
// Creates a new, independent Buddy project from this repository (issue #107 §2).
// docs/buddy-kit.md has the ten steps from here to a running app.

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { CAPABILITIES, KIT_LOCALES, KitError, parseConfig } from '../config.js';
import { createBuddy } from '../create.js';
import { parseArgs } from './args.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const USAGE = `pnpm create-buddy <target-dir> --name "Fit Buddy" --bundle-id com.example.fitbuddy
  [--id fitbuddy] [--scheme fitbuddy] [--audience adults-only|minors-with-guardian]
  [--locales de,en] [--default-locale de] [--capabilities ${CAPABILITIES.join(',')}]
  [--vertex-location europe-west4] [--git] [--verify]
Without a terminal every required value must be given as a flag.`;

const VALUED = [
  'id',
  'name',
  'bundle-id',
  'scheme',
  'audience',
  'locales',
  'default-locale',
  'capabilities',
  'vertex-location',
] as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), VALUED);
  if (args.flags.has('help') || args.positional.length !== 1) {
    console.log(USAGE);
    process.exit(args.flags.has('help') ? 0 : 2);
  }
  const target = resolve(process.env.INIT_CWD ?? process.cwd(), args.positional[0]!);
  const get = (k: (typeof VALUED)[number]) => args.values.get(k)?.at(-1);

  const tty = process.stdin.isTTY === true;
  const rl = tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (k: (typeof VALUED)[number], question: string, fallback?: string) => {
    const given = get(k);
    if (given !== undefined) return given;
    if (fallback !== undefined && !rl) return fallback;
    if (!rl) throw new KitError(`--${k} is required without a terminal\n\n${USAGE}`);
    const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
    return answer || fallback || '';
  };
  const name = await ask('name', 'Name der App');
  const defaultId = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const id = await ask('id', 'Id (klein, ohne Leerzeichen)', defaultId);
  const bundleId = await ask('bundle-id', 'Bundle-ID (com.firma.app)');
  const scheme = await ask('scheme', 'Deep-Link-Scheme', id);
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
  rl?.close();

  const config = parseConfig({
    identity: { id, name, bundleId, scheme },
    policy: { audience, supabaseRegion: 'eu-central-1', vercelRegion: 'fra1', vertexLocation },
    content: { locales, defaultLocale },
    wiring: { capabilities: capsRaw ? capsRaw.split(',').map((s) => s.trim()) : [] },
    legal: {},
  });

  const files = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const report = createBuddy({ sourceRoot: REPO, targetRoot: target, files, config });
  console.log(
    `✓ ${config.identity.name} in ${target}: ${report.copied} Dateien kopiert, ${report.skipped.length} ausgelassen.`,
  );
  console.log(
    `  Neu geschrieben: ${report.rewritten.join(', ')}, buddy.config.json, docs/legal/processors.md, BUDDY-SETUP.md`,
  );
  const total = report.leftovers.reduce((s, l) => s + l.count, 0);
  console.log(
    `  Noch „LearnBuddy" in ${report.leftovers.length} Dateien (${total} Stellen) — Schritt 2 in BUDDY-SETUP.md.`,
  );

  if (args.flags.has('git')) {
    execFileSync('git', ['init', '-q'], { cwd: target });
    console.log('✓ git init (eigenes Repository, ohne LearnBuddys Historie)');
  }
  if (args.flags.has('verify')) {
    // The same gates as the pre-commit hook, in the new project. Integration tests need the
    // local Postgres (LB_TEST_DATABASE_URL) exactly like here.
    for (const cmd of [['install'], ['typecheck'], ['lint'], ['test']]) {
      console.log(`→ pnpm ${cmd.join(' ')}`);
      const run = spawnSync('pnpm', cmd, { cwd: target, stdio: 'inherit' });
      if (run.status !== 0) throw new KitError(`pnpm ${cmd.join(' ')} failed in ${target}`);
    }
    console.log('✓ typecheck, lint und test grün im neuen Projekt');
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
