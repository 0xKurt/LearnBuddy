// One "is it still on screen?" (issue #311, slice 6): every hook that waits for something asks
// `useMounted` (lib/useMounted.ts). Before, nine files carried the same ref and effect. Read from
// the source, like `oneListen.test.ts`: no other file sets a ref true on mount by hand.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('one useMounted (#311)', () => {
  it('is the only place that tracks being mounted by hand', () => {
    const holders = ['app', 'components', 'lib']
      .flatMap((dir) => files(join(ROOT, dir)))
      .filter((path) => /\bmounted\.current = true\b/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(ROOT, path));
    expect(holders).toEqual(['lib/useMounted.ts']);
  });
});
