// CLAUDE.md rule 8: a file that injects fakes carries the banner. Everything under
// src/testing and evals does (audit banner-missing-devstack-evals).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const API = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const BANNER = '// requires live verification in Claude Code session';

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

describe('rule 8 banner', () => {
  it('is in every test-tooling and eval file', () => {
    const files = [...tsFiles(join(API, 'src/testing')), ...tsFiles(join(API, 'evals'))];
    expect(files.length).toBeGreaterThan(10);
    const missing = files.filter((f) => !readFileSync(f, 'utf8').includes(BANNER));
    expect(missing.map((f) => f.slice(API.length + 1))).toEqual([]);
  });
});
