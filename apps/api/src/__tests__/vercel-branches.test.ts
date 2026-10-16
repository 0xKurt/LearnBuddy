// Vercel builds `main` only (issue #638, CLAUDE.md "How we work" 4): every other branch push was
// a paid preview build ("Build CPU Minutes 69 hours, $14.69", owner 14.10.2026). Read off
// apps/api/vercel.json as Vercel reads it (docs: git-configuration, `git.deploymentEnabled`):
// minimatch globs per branch, a branch no rule names deploys, and one that matches several rules
// deploys if any of them is true. The Ignored Build Step (`ignoreCommand`) is run as Vercel runs
// it: exit 0 skips the build, anything else builds.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { minimatch } from 'minimatch';
import { describe, expect, it } from 'vitest';

type VercelGit = {
  git?: { deploymentEnabled?: Record<string, boolean> | boolean };
  ignoreCommand?: string;
};

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
) as VercelGit;

/** Whether Vercel would start a deployment for a push to `branch`. */
function deploys(branch: string): boolean {
  const rules = config.git?.deploymentEnabled;
  if (rules === undefined) return true;
  if (typeof rules === 'boolean') return rules;
  const matching = Object.entries(rules).filter(([glob]) => minimatch(branch, glob));
  return matching.length === 0 || matching.some(([, on]) => on);
}

/** Whether the Ignored Build Step lets a build of `ref` go on (exit 0 skips it). */
function builds(ref: string): boolean {
  if (!config.ignoreCommand) return true;
  const r = spawnSync('sh', ['-c', config.ignoreCommand], {
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref },
  });
  return r.status !== 0;
}

const OTHERS = [
  'claude/687-now-by-month',
  'fix/login',
  'perf/home',
  'codex/k-items',
  'feature',
  'worktree-agent-a4ae6af277bfddf9b',
  'dependabot/npm_and_yarn/zod-3.25.77',
  'main-copy',
];

describe('Vercel builds main only (#638)', () => {
  it('starts a deployment for main', () => {
    expect(deploys('main')).toBe(true);
    expect(builds('main')).toBe(true);
  });

  it.each(OTHERS)('starts none for %s', (branch) => {
    expect(deploys(branch)).toBe(false);
  });

  it.each(OTHERS)('and its build step would skip %s anyway', (branch) => {
    expect(builds(branch)).toBe(false);
  });
});
