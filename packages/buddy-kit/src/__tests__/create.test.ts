import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { parseConfig } from '../config.js';
import { createBuddy, type CreateReport, isCopied } from '../create.js';
import { config, REPO, repoFiles, tmp } from './helpers.js';

// The real repository, copied for real: the rewrites are tested against the files they rewrite.
describe('create-buddy on this repository', () => {
  let target: string;
  let report: CreateReport;
  beforeAll(() => {
    target = join(tmp('create'), 'fitbuddy');
    report = createBuddy({
      sourceRoot: REPO,
      targetRoot: target,
      files: repoFiles(),
      config: config(),
    });
  });

  it('copies the tracked files but no history, no foreign credentials, no store identity', () => {
    expect(report.copied).toBeGreaterThan(500);
    expect(existsSync(join(target, 'apps/api/src/app.ts'))).toBe(true);
    expect(existsSync(join(target, '.git'))).toBe(false);
    expect(existsSync(join(target, 'docs/legacy'))).toBe(false);
    expect(existsSync(join(target, 'reports'))).toBe(false);
    expect(existsSync(join(target, 'apps/mobile/google-services.json'))).toBe(false);
    expect(report.skipped).toContain('apps/mobile/google-services.json');
  });

  it('gives the app its own identity and removes every link to LearnBuddy’s projects', () => {
    const appJson = readFileSync(join(target, 'apps/mobile/app.json'), 'utf8');
    const expo = (JSON.parse(appJson) as { expo: Record<string, unknown> }).expo;
    expect(expo).toMatchObject({ name: 'Fit Buddy', slug: 'fitbuddy', scheme: 'fitbuddy' });
    expect(expo.ios).toMatchObject({ bundleIdentifier: 'com.example.fitbuddy' });
    expect(expo.android).toMatchObject({ package: 'com.example.fitbuddy' });
    expect(expo).not.toHaveProperty('owner');
    expect(expo).not.toHaveProperty('updates');
    expect(expo.android).not.toHaveProperty('googleServicesFile');
    // LearnBuddy's Expo project id must not survive anywhere in the app config.
    const learnbuddyProject = (
      JSON.parse(readFileSync(join(REPO, 'apps/mobile/app.json'), 'utf8')) as {
        expo: { extra: { eas: { projectId: string } } };
      }
    ).expo.extra.eas.projectId;
    expect(appJson).not.toContain(learnbuddyProject);
    expect(appJson).not.toMatch(/LearnBuddy/);
    expect(appJson).toContain('FitbuddyShare');

    const eas = readFileSync(join(target, 'apps/mobile/eas.json'), 'utf8');
    expect(eas).not.toMatch(/EXPO_PUBLIC_|supabase\.co|vercel\.app/);
    const appConfig = readFileSync(join(target, 'apps/mobile/app.config.ts'), 'utf8');
    expect(appConfig).toContain("'Fit Buddy Dev'");
    expect(appConfig).toContain('com.example.fitbuddy.dev');
    expect(appConfig).not.toContain('com.learnbuddy.app');
  });

  it('writes its config, the processor list, the checklist, and ignores .buddy/', () => {
    const written = parseConfig(
      JSON.parse(readFileSync(join(target, 'buddy.config.json'), 'utf8')),
    );
    expect(written).toEqual(config());
    expect(readFileSync(join(target, 'docs/legal/processors.md'), 'utf8')).toContain(
      'Google Cloud — Text-to-Speech',
    );
    const setup = readFileSync(join(target, 'BUDDY-SETUP.md'), 'utf8');
    expect(setup).toContain('Lern-Domain entfernen');
    expect(setup).toContain('eu-central-1');
    expect(readFileSync(join(target, '.gitignore'), 'utf8')).toMatch(/^\.buddy\/$/m);
  });

  it('counts what still says LearnBuddy instead of hiding it', () => {
    expect(report.leftovers.length).toBeGreaterThan(10);
    const setup = readFileSync(join(target, 'BUDDY-SETUP.md'), 'utf8');
    expect(setup).toMatch(/\d+ Stellen in \d+ Dateien/);
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
  it('never copies key files, env files or local state', () => {
    for (const f of [
      'a/b.jks',
      'x.p8',
      'release.keystore',
      '.env',
      'apps/api/.env.local',
      '.buddy/secrets.env',
    ])
      expect(isCopied(f)).toBe(false);
    expect(isCopied('apps/api/.env.example')).toBe(true);
    expect(isCopied('apps/api/src/app.ts')).toBe(true);
  });

  it('works without a .gitignore in the source', () => {
    const source = tmp('src');
    mkdirSync(join(source, 'a'), { recursive: true });
    writeFileSync(join(source, 'a/x.ts'), 'export const x = 1;\n');
    const target = join(tmp('dst'), 'out');
    createBuddy({ sourceRoot: source, targetRoot: target, files: ['a/x.ts'], config: config() });
    expect(readFileSync(join(target, '.gitignore'), 'utf8')).toMatch(/^\.buddy\/$/m);
  });
});
