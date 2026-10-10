// `pnpm provision` as the owner runs it: a real subprocess, no terminal, flags only.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { appTree, config, tsx } from './helpers.js';

describe('pnpm provision', () => {
  it('--dry-run prints what would exist and what is left, and writes nothing', () => {
    const app = appTree('cli', config({ capabilities: ['voice', 'push'] }));
    const plan = tsx('provision.ts', ['--dry-run'], app);
    expect(plan.stderr).toBe('');
    expect(plan.status).toBe(0);
    expect(plan.stdout).toContain('Würde anlegen (--dry-run: nichts angelegt, nichts aufgerufen)');
    expect(plan.stdout).toContain('Lokal (--dry-run, nichts geschrieben)');
    expect(plan.stdout).toContain('[Google Cloud] Firebase-Projekt');
    expect(existsSync(join(app, '.buddy'))).toBe(false);

    const prod = tsx('provision.ts', ['--env', 'production'], app);
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain('production needs the legal details first');
  }, 60_000);
});
