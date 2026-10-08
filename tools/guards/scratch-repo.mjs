// A throwaway git repository for the tools' own tests (measuring main, pre-push stamp).
//
// Inside the pre-commit hook git exports GIT_DIR, GIT_INDEX_FILE … — inherited, they point a
// throwaway repo's commands at the REAL repository (it happened: commits and config written into
// the project's .git). So: none of the hook's GIT_* variables, no global or system config, and
// every setting passed with -c, never written anywhere. `scratchRepo` checks that the new
// repository really is the throwaway one before it hands it out.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * @param {string} prefix temp-dir prefix, e.g. `lb-merge-`
 * @param {string[]} [config] extra `key=value` settings, each passed with `-c`
 */
export function scratchRepo(prefix, config = []) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  );
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' });
  const settings = ['user.email=t@example.test', 'user.name=t', ...config].flatMap((c) => [
    '-c',
    c,
  ]);
  const git = (/** @type {string[]} */ ...args) =>
    execFileSync('git', [...settings, ...args], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe' });
  const remove = () => rmSync(dir, { recursive: true, force: true });
  try {
    git('init', '-q', '-b', 'main');
    // The guard against the leak itself: this must be the throwaway repository.
    assert.equal(git('rev-parse', '--show-toplevel').trim(), realpathSync(dir));
  } catch (e) {
    remove();
    throw e;
  }
  return { dir, env, git, remove };
}
