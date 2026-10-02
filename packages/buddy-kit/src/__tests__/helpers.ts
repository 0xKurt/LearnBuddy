import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BuddyConfig, parseConfig } from '../config.js';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export function repoFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

export function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `buddy-kit-${prefix}-`));
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
