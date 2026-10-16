// pnpm core-check: does the generic core build without the learning domain? (issue #107, cut 10)
//
// Makes the core copy by construction (create-buddy --core) in a temporary directory, installs
// it, typechecks every package and starts its API (seams/core-boot.ts.txt: a server's build of the
// app, with no database reached and no model asked). Each error in production code is counted per file and code
// and compared with packages/buddy-kit/core-gaps.json, the gaps that are left: a new one is red
// (the core reaches the domain again), and so is one that went away while the list still names
// it — the list says exactly what is left, and only gets shorter. Errors in tests, the harness,
// evals and scripts are counted for the report only: those that test the domain go with it.
//
//   pnpm core-check            # CI (check.yml), a few minutes
//   pnpm core-check --write    # after fixing gaps: writes the list anew (never to add one)

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

import { parseConfig } from '../config.js';
import { BASELINE, compareBaseline, generateBaseline } from '../baseline.js';
import { CORE_BOOT, isSupport, signalsOf, type Guard } from '../core.js';
import { createBuddy } from '../create.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const GAPS = join(REPO, 'packages/buddy-kit/core-gaps.json');
const PACKAGES = ['packages/shared-types', 'apps/api', 'apps/mobile'];

/** Production-code errors of a tsc run as "file: TScode" with their count; support errors apart. */
export function countErrors(
  output: string,
  pkg: string,
): { gaps: Record<string, number>; support: number } {
  const gaps: Record<string, number> = {};
  let support = 0;
  for (const line of output.split('\n')) {
    const m = /^(.+?)\(\d+,\d+\): error (TS\d+):/.exec(line);
    if (!m) continue;
    const file = `${pkg}/${m[1]!.replace(/^\.\//, '')}`;
    if (isSupport(file)) {
      support++;
      continue;
    }
    const key = `${file}: ${m[2]}`;
    gaps[key] = (gaps[key] ?? 0) + 1;
  }
  return { gaps, support };
}

/** What differs from the list: new or grown gaps, and gaps the list still names that are gone. */
export function compareGaps(
  now: Record<string, number>,
  listed: Record<string, number>,
): { grown: string[]; gone: string[] } {
  const keys = new Set([...Object.keys(now), ...Object.keys(listed)]);
  const grown: string[] = [];
  const gone: string[] = [];
  for (const k of [...keys].sort()) {
    const a = now[k] ?? 0;
    const b = listed[k] ?? 0;
    if (a > b) grown.push(`${k} (${b} → ${a})`);
    else if (a < b) gone.push(`${k} (${b} → ${a})`);
  }
  return { grown, gone };
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  // The copy's database is built on the test Postgres; without one the check cannot say anything.
  const admin = process.env.LB_TEST_DATABASE_URL;
  if (!admin) throw new Error('core-check needs LB_TEST_DATABASE_URL (the test Postgres)');
  const target = join(mkdtempSync(join(tmpdir(), 'core-check-')), 'core');
  try {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    const guard = (await import(
      pathToFileURL(join(REPO, 'tools/guards/boundaries.config.mjs')).href
    )) as Guard;
    const { DOMAIN, DOMAIN_TABLES } = guard;
    // The copy's own database: generated (--write), or the checked-in one compared with what the
    // migrations build without the domain (baseline.ts).
    if (write) {
      writeFileSync(join(REPO, BASELINE), generateBaseline(admin, REPO, DOMAIN_TABLES));
      console.log(`written: ${BASELINE}`);
    } else {
      const { missing, extra } = compareBaseline(admin, REPO, DOMAIN_TABLES);
      if (missing.length > 0 || extra.length > 0) {
        console.error(
          `✗ ${BASELINE} is not the core's schema the migrations build (pnpm core-check --write):${missing.map((l) => `\n  - missing: ${l}`).join('')}${extra.map((l) => `\n  - extra: ${l}`).join('')}`,
        );
        process.exitCode = 1;
        return;
      }
      console.log(`✓ ${BASELINE} is the core's schema the migrations build`);
    }
    const config = parseConfig(
      JSON.parse(readFileSync(join(REPO, 'packages/buddy-kit/reference.config.json'), 'utf8')),
    );
    const report = createBuddy({
      sourceRoot: REPO,
      targetRoot: target,
      files,
      config,
      domain: DOMAIN,
      core: true,
      signals: signalsOf(guard),
    });
    console.log(
      `core copy: ${report.copied} files, ${report.core?.domain ?? 0} of the domain and ${report.core?.support.length ?? 0} tests/evals/scripts that need it left out`,
    );
    const install = spawnSync('pnpm', ['install', '--prefer-offline', '--no-frozen-lockfile'], {
      cwd: target,
      stdio: 'inherit',
    });
    if (install.status !== 0) throw new Error('pnpm install failed in the core copy');

    const gaps: Record<string, number> = {};
    let support = 0;
    for (const pkg of PACKAGES) {
      const run = spawnSync(
        process.execPath,
        [
          join(target, 'node_modules/typescript/bin/tsc'),
          '--noEmit',
          '--pretty',
          'false',
          '-p',
          '.',
        ],
        { cwd: join(target, pkg), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      );
      const counted = countErrors(`${run.stdout}${run.stderr}`, pkg);
      Object.assign(gaps, counted.gaps);
      support += counted.support;
    }
    // Does it start? The API built as a server builds it, with no database and no model.
    mkdirSync(dirname(join(target, CORE_BOOT.path)), { recursive: true });
    writeFileSync(join(target, CORE_BOOT.path), CORE_BOOT.text);
    const boot = spawnSync(
      process.execPath,
      [join(target, 'node_modules/tsx/dist/cli.mjs'), CORE_BOOT.path.replace(/^apps\/api\//, '')],
      { cwd: join(target, 'apps/api'), encoding: 'utf8' },
    );
    if (boot.status !== 0) {
      console.error(`✗ the core does not start without the domain:\n${boot.stdout}${boot.stderr}`);
      process.exitCode = 1;
      return;
    }
    console.log(boot.stdout.trim());
    // Does it work on its own database? The copy's API tests (the core's: the domain's stayed
    // out) on databases built from its one migration, the baseline.
    const tests = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=dot'], {
      cwd: join(target, 'apps/api'),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: {
        ...process.env,
        LB_TEST_DATABASE_URL: admin,
        LB_REQUIRE_TEST_DB: '1',
        LB_TEST_MAX_WORKERS: process.env.LB_TEST_MAX_WORKERS ?? '2',
        // Plain text, so the summary below can be read (CI forces colour otherwise).
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
    const run = stripVTControlCharacters(`${tests.stdout}${tests.stderr}`);
    // How many ran, read from vitest's summary: a run that ran none proves nothing.
    const ran = /Tests\s+(\d+) passed[^\n]*/.exec(run);
    if (tests.status === 0 && (!ran || Number(ran[1]) === 0)) {
      console.error(`✗ the core's tests ran none on its own database:\n${run.slice(-4000)}`);
      process.exitCode = 1;
      return;
    }
    if (tests.status !== 0) {
      const log = join(tmpdir(), 'core-check-tests.log');
      writeFileSync(log, run);
      const failed = [...new Set(run.match(/^ FAIL {2}\S+/gm) ?? [])];
      console.error(
        `✗ the core's tests fail on its own database (the whole run: ${log}):\n  ${failed.join('\n  ')}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`core tests: ${ran?.[0].replace(/^Tests\s+/, '') ?? ''}`);
    const total = Object.values(gaps).reduce((s, n) => s + n, 0);
    console.log(
      `core typecheck: ${total} errors in production code (${Object.keys(gaps).length} file/code pairs), ${support} in tests and evals`,
    );
    if (write) {
      writeFileSync(GAPS, `${JSON.stringify(gaps, Object.keys(gaps).sort(), 2)}\n`);
      console.log(`written: ${GAPS}`);
      return;
    }
    const listed = JSON.parse(readFileSync(GAPS, 'utf8')) as Record<string, number>;
    const { grown, gone } = compareGaps(gaps, listed);
    if (grown.length > 0) {
      console.error(
        `✗ the core reaches the learning domain in new places (the domain registers itself into the core; boundaries.config.mjs):\n  ${grown.join('\n  ')}`,
      );
    }
    if (gone.length > 0) {
      console.error(
        `✗ gaps closed — take them off packages/buddy-kit/core-gaps.json (pnpm core-check --write):\n  ${gone.join('\n  ')}`,
      );
    }
    if (grown.length > 0 || gone.length > 0) process.exitCode = 1;
    else console.log('✓ the core builds without the domain, apart from the gaps listed');
  } finally {
    rmSync(join(target, '..'), { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
