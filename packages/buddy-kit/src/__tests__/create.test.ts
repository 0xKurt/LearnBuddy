import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseConfig } from '../config.js';
import { createBuddy, type CreateReport, isCopied, KIT_ONLY } from '../create.js';
import { findForeign, readSource } from '../source.js';
import { config, REPO, tmp } from './helpers.js';

const repoFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8');

// The real repository, copied for real: every rewrite is tested against the file it rewrites,
// and a file that newly ties the copy to the source's infrastructure turns this red.
describe('create-buddy on this repository', () => {
  let target: string;
  let report: CreateReport;
  const source = readSource(REPO);
  beforeAll(async () => {
    const url = pathToFileURL(join(REPO, 'tools/guards/boundaries.config.mjs')).href;
    const { DOMAIN } = (await import(url)) as { DOMAIN: string[] };
    target = join(tmp('create'), 'fitbuddy');
    report = createBuddy({
      sourceRoot: REPO,
      targetRoot: target,
      files: repoFiles(),
      config: config({ repo: 'zerox/fitbuddy' }),
      domain: DOMAIN,
    });
  });

  it('leaves no tie to the source’s infrastructure (Expo, Supabase, API, repository)', () => {
    expect(source.foreign.map((f) => f.what)).toEqual(
      expect.arrayContaining(['Bundle-ID der Quelle', 'EAS-Projekt der Quelle']),
    );
    expect(report.links).toEqual([]);
  });

  it('finds a tie that a rewrite missed', () => {
    const projectId = source.foreign.find((f) => f.what === 'EAS-Projekt der Quelle')!.text;
    const dir = tmp('planted');
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/x.sh'), `echo ${projectId}\n`);
    writeFileSync(join(dir, 'CLAUDE.md'), `Issues in \`${source.repoSlug}\`.\n`);
    writeFileSync(join(dir, 'docs.md'), `see https://github.com/${source.repoSlug}/issues/1\n`);
    const found = findForeign(dir, ['scripts/x.sh', 'CLAUDE.md', 'docs.md'], source.foreign);
    expect(found.map((f) => `${f.file}:${f.line}`)).toEqual(
      source.repoSlug ? ['scripts/x.sh:1', 'CLAUDE.md:1'] : ['scripts/x.sh:1'],
    );
  });

  it('copies the tracked files but no history, no foreign credentials and not the generator', () => {
    expect(report.copied).toBeGreaterThan(500);
    expect(existsSync(join(target, 'apps/api/src/app.ts'))).toBe(true);
    for (const gone of ['.git', 'docs/legacy', 'docs/decisions', 'reports'])
      expect(existsSync(join(target, gone))).toBe(false);
    expect(existsSync(join(target, 'apps/mobile/google-services.json'))).toBe(false);
    expect(report.skipped).toContain('apps/mobile/google-services.json');
    for (const f of KIT_ONLY) {
      expect(existsSync(join(REPO, f)), `${f} gibt es in der Quelle`).toBe(true);
      expect(existsSync(join(target, f)), `${f} ist nur für den Generator`).toBe(false);
    }
    // provision stands alone: nothing the copy keeps imports the generator.
    const kit = join(target, 'packages/buddy-kit/src');
    const generator = KIT_ONLY.map((f) => f.split('/').pop()!.replace(/\.ts$/, '.js'));
    for (const file of readdirSync(kit, { recursive: true, encoding: 'utf8' })) {
      if (!file.endsWith('.ts')) continue;
      const text = read(kit, file);
      for (const g of generator) expect(text, `${file} → ${g}`).not.toContain(`/${g}'`);
    }
  });

  it('gives the app its own identity', () => {
    const appJson = read(target, 'apps/mobile/app.json');
    const expo = (JSON.parse(appJson) as { expo: Record<string, unknown> }).expo;
    expect(expo).toMatchObject({ name: 'Fit Buddy', slug: 'fitbuddy', scheme: 'fitbuddy' });
    expect(expo.ios).toMatchObject({ bundleIdentifier: 'com.example.fitbuddy' });
    expect(expo.android).toMatchObject({ package: 'com.example.fitbuddy' });
    expect(expo).not.toHaveProperty('owner');
    expect(expo).not.toHaveProperty('updates');
    expect(expo.android).not.toHaveProperty('googleServicesFile');
    expect(appJson).not.toContain(source.name);
    expect(appJson).toContain('FitbuddyShare');
    // The stores ask in the app's own name, not about the source's worksheets.
    expect(appJson).toContain('Damit du Fit Buddy ein Foto zeigen kannst.');
    expect(appJson).toContain('Damit du mit Fit Buddy sprechen kannst, statt zu tippen.');

    const eas = JSON.parse(read(target, 'apps/mobile/eas.json')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    const env = Object.values(eas.build).flatMap((p) => Object.keys(p.env ?? {}));
    // The addresses go, the build flag stays: an internal preview may start without legal URLs.
    expect(env.filter((k) => k.startsWith('EXPO_PUBLIC_'))).toEqual(['EXPO_PUBLIC_INTERNAL_BUILD']);
    expect(read(target, 'apps/mobile/app.config.ts')).toContain("'Fit Buddy Dev'");

    const pkg = JSON.parse(read(target, 'package.json')) as {
      name: string;
      scripts: Record<string, string>;
    };
    expect(pkg.name).toBe('fitbuddy');
    expect(pkg.scripts).not.toHaveProperty('create-buddy');
    expect(pkg.scripts).toHaveProperty('provision');
    expect(read(target, 'infra/supabase/config.toml')).toMatch(/^project_id = "fitbuddy"$/m);
    expect(read(target, '.github/workflows/health.yml')).toMatch(/^\s*HEALTH_URL: ''$/m);
    expect(read(target, 'CLAUDE.md')).toContain('`zerox/fitbuddy`');
    expect(read(target, '.maestro/flows/01-welcome.yaml')).toContain('com.example.fitbuddy.dev');
  });

  it('writes its config, the processor list and the checklist, and ignores .buddy/', () => {
    const written = parseConfig(JSON.parse(read(target, 'buddy.config.json')));
    expect(written).toEqual(config({ repo: 'zerox/fitbuddy' }));
    expect(read(target, 'docs/legal/processors.md')).toContain('Google Cloud — Text-to-Speech');
    const setup = read(target, 'BUDDY-SETUP.md');
    expect(setup).toContain('Lern-Domain (noch enthalten)');
    expect(setup).toContain('eu-central-1');
    expect(read(target, '.gitignore')).toMatch(/^\.buddy\/$/m);
  });

  it('counts the learning domain that is still in the copy instead of hiding it', () => {
    const practice = report.domain.find((d) => d.pattern.includes('practice|materials'));
    expect(practice?.files).toBeGreaterThan(50);
    expect(read(target, 'BUDDY-SETUP.md')).toMatch(/\*\*\d+ Dateien\*\*/);
    expect(report.leftovers.length).toBeGreaterThan(10);
  });

  it('refuses a target that exists and is not empty, and one inside the source', () => {
    expect(() =>
      createBuddy({ sourceRoot: REPO, targetRoot: target, files: [], config: config() }),
    ).toThrow(/not empty — nothing was written/);
    expect(() =>
      createBuddy({ sourceRoot: REPO, targetRoot: join(REPO, 'x'), files: [], config: config() }),
    ).toThrow(/inside the source/);
  });
});

describe('what is copied', () => {
  it('never copies key files, env files, local state or the generator', () => {
    for (const f of [
      'a/b.jks',
      'x.p8',
      'release.keystore',
      '.env',
      'apps/api/.env.local',
      '.buddy/secrets.env',
      'packages/buddy-kit/src/create.ts',
    ])
      expect(isCopied(f)).toBe(false);
    expect(isCopied('apps/api/.env.example')).toBe(true);
    expect(isCopied('apps/api/src/app.ts')).toBe(true);
    expect(isCopied('packages/buddy-kit/src/provision.ts')).toBe(true);
  });
});
