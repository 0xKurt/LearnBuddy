// `pnpm create-buddy` as the owner (and CI) runs it: a real subprocess, no terminal.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { noHookGit, REPO, tmp, tsx } from './helpers.js';

describe('pnpm create-buddy', () => {
  it('makes the reference buddy from its config, as its own repository on main', () => {
    const base = tmp('cli');
    const config = join(REPO, 'packages/buddy-kit/reference.config.json');
    const made = tsx('create-buddy.ts', ['reference', '--config', config, '--git'], base);
    expect(made.stderr).toBe('');
    expect(made.status).toBe(0);
    expect(made.stdout).toContain('✓ Reference Buddy in');
    expect(made.stdout).toContain('✓ keine Verbindung zur Infrastruktur der Quelle');
    const app = join(base, 'reference');
    expect(JSON.parse(readFileSync(join(app, 'buddy.config.json'), 'utf8'))).toEqual(
      JSON.parse(readFileSync(config, 'utf8')),
    );
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: app, env: noHookGit(), encoding: 'utf8' }).trim();
    // Its own history from the first commit, with nothing left out of it.
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    expect(git('rev-list', '--count', 'HEAD')).toBe('1');
    expect(git('status', '--porcelain')).toBe('');
    expect(() => git('remote', 'get-url', 'origin')).toThrow();
  }, 60_000);

  it('asks for every missing value by name when there is no terminal', () => {
    const r = tsx('create-buddy.ts', ['x', '--name', 'X Buddy'], tmp('cli2'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--bundle-id is required without a terminal');
  });
});
