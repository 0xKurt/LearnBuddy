import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll } from 'vitest';

import { type BuddyConfig, parseConfig } from '../config.js';
import { RUN_ENV } from './tmpGuard.js';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function repoFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

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

export function config(over: { legal?: BuddyConfig['legal']; capabilities?: string[] } = {}) {
  return parseConfig({
    identity: {
      id: 'fitbuddy',
      name: 'Fit Buddy',
      bundleId: 'com.example.fitbuddy',
      scheme: 'fitbuddy',
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
