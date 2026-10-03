// Every source file is text (issue #315, audit #311 A9). A raw NUL byte in
// modules/practice/listen.ts made grep call the file binary and hide it from every search:
// the audit's own `rg` found no use of a constant that was used right there. A control
// character the code needs is written as an escape (`\u0000`), never as the byte itself.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const DIRS = ['apps', 'packages', 'infra', 'scripts', 'tests', 'docs'];
const TEXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.sql',
  '.md',
  '.sh',
  '.yml',
  '.yaml',
]);
const SKIP = new Set(['node_modules', 'dist', 'dist-web', 'build', '.expo', 'coverage', '.turbo']);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (TEXT.has(extname(name))) yield path;
  }
}

describe('source files are text', () => {
  it('no source file carries a NUL byte', () => {
    const withNul: string[] = [];
    let seen = 0;
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        seen++;
        if (readFileSync(file).includes(0)) withNul.push(relative(ROOT, file));
      }
    }
    // The walk really reached the code (a wrong root would pass on nothing).
    expect(seen).toBeGreaterThan(500);
    expect(withNul).toEqual([]);
  });
});
