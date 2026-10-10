import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll } from 'vitest';

import { type BuddyConfig, parseConfig } from '../config.js';
import { RUN_ENV } from './tmpGuard.js';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The environment for anything that runs git in ANOTHER repository: inside the pre-commit hook
 * the GIT_* variables point at this one (tools/guards/scratch-repo.mjs).
 */
export const noHookGit = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));

/**
 * A command of the kit as the owner runs it: a subprocess without a terminal, run from `cwd`,
 * with a commit identity of its own (CI has none configured).
 */
export const tsx = (script: string, args: string[], cwd: string) =>
  spawnSync(
    process.execPath,
    ['--import', 'tsx', join(REPO, 'packages/buddy-kit/src/cli', script), ...args],
    {
      cwd: join(REPO, 'packages/buddy-kit'),
      env: {
        ...noHookGit(),
        INIT_CWD: cwd,
        GIT_AUTHOR_NAME: 'kit test',
        GIT_AUTHOR_EMAIL: 'kit@example.test',
        GIT_COMMITTER_NAME: 'kit test',
        GIT_COMMITTER_EMAIL: 'kit@example.test',
      },
      encoding: 'utf8',
    },
  );

/** The temp dirs this test file made; removed when the file is done (issue #449). */
const made = new Set<string>();

// After the file, not after each test: a file may share one dir across its tests (beforeAll).
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made.clear();
});

/** A fresh temp dir, marked with this run (`tmpGuard.ts`) and removed after the test file. */
export function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `buddy-kit-${process.env[RUN_ENV] ?? 'run'}-${prefix}-`));
  made.add(dir);
  return dir;
}

/** What provision reads and writes, copied from this repository (no generator needed). */
const APP_FILES = [
  'apps/mobile/app.json',
  'apps/mobile/eas.json',
  'apps/api/vercel.json',
  '.github/workflows/health.yml',
  'infra/supabase/migrations',
];

/** An app tree for provision: this repository's own files, and its buddy.config.json. */
export function appTree(prefix: string, cfg: BuddyConfig = config()): string {
  const root = join(tmp(prefix), 'app');
  for (const f of APP_FILES) cpSync(join(REPO, f), join(root, f), { recursive: true });
  writeFileSync(join(root, 'buddy.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  return root;
}

export function config(
  over: {
    legal?: BuddyConfig['legal'];
    capabilities?: string[];
    repo?: string;
  } = {},
) {
  return parseConfig({
    identity: {
      id: 'fitbuddy',
      name: 'Fit Buddy',
      bundleId: 'com.example.fitbuddy',
      scheme: 'fitbuddy',
      ...(over.repo ? { repo: over.repo } : {}),
    },
    policy: {
      audience: 'adults-only',
      supabaseRegion: 'eu-central-1',
      vercelRegion: 'fra1',
      vertexLocation: 'europe-west4',
    },
    content: { locales: ['de', 'en'], defaultLocale: 'de' },
    wiring: { capabilities: over.capabilities ?? ['voice'] },
    legal: over.legal ?? {},
  });
}

export const LEGAL = {
  controller: 'Zero X Ventures',
  controllerAddress: 'Musterstraße 1, 10115 Berlin',
  privacyUrl: 'https://example.com/privacy',
  imprintUrl: 'https://example.com/imprint',
  supportEmail: 'support@example.com',
};
