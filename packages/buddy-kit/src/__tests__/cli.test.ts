// The two commands as the owner runs them: a real subprocess, no terminal, flags only.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO, tmp } from './helpers.js';

const CLI = join(REPO, 'packages/buddy-kit/src/cli');
const tsx = (script: string, args: string[], cwd: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', join(CLI, script), ...args], {
    cwd: join(REPO, 'packages/buddy-kit'),
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });

describe('the commands', () => {
  it('create-buddy and provision --plan, end to end', () => {
    const base = tmp('cli');
    const made = tsx(
      'create-buddy.ts',
      [
        'demo',
        '--name',
        'Demo Buddy',
        '--bundle-id',
        'com.example.demo',
        '--capabilities',
        'voice,push',
      ],
      base,
    );
    expect(made.stderr).toBe('');
    expect(made.status).toBe(0);
    expect(made.stdout).toContain('✓ Demo Buddy in');
    const app = join(base, 'demo');
    expect(JSON.parse(readFileSync(join(app, 'buddy.config.json'), 'utf8'))).toMatchObject({
      identity: { id: 'demobuddy', scheme: 'demobuddy' },
    });

    const plan = tsx('provision.ts', ['--plan'], app);
    expect(plan.status).toBe(0);
    expect(plan.stdout).toContain('Lokal (--plan, nichts geschrieben)');
    expect(plan.stdout).toContain('[Google Cloud] Firebase-Projekt');
    expect(existsSync(join(app, '.buddy'))).toBe(false);

    const prod = tsx('provision.ts', ['--env', 'production'], app);
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain('production needs the legal details first');
  }, 60_000);

  it('create-buddy without a terminal names the missing flag', () => {
    const r = tsx('create-buddy.ts', ['x', '--name', 'X Buddy'], tmp('cli2'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--bundle-id is required without a terminal');
  });
});
