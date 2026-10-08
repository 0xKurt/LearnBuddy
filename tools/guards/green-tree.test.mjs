// Pre-push skips the full suite only for a tree that already passed it (issue #455,
// tools/guards/green-tree.mjs). Run by `pnpm guards` next to guards.test.mjs.
//
// First the decision on its own, then the whole path in a throwaway repository: what the hooks
// do around a green run (snapshot, record) and what pre-push asks (covered, with git's lines on
// stdin). Every case builds its own repository, so the order of the cases does not matter.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { decide, parsePushLines, runKey } from './green-tree.mjs';
import { REPO_ROOT } from './measure.mjs';
import { scratchRepo } from './scratch-repo.mjs';

const FULL = 'pnpm -r --parallel test';
const RELATED = 'pnpm -C apps/api run test:related src/modules/buddy/policy.ts';
const RUN = { command: FULL, node: 'v22.12.0', requireDb: '1', database: 'pg://t', packages: 'a1' };
const T1 = '1'.repeat(40);
const T2 = '2'.repeat(40);
const T3 = '3'.repeat(40);
/** git's object id for "nothing": a new branch on the remote, or a deletion. */
const NONE = '0'.repeat(40);

/** A stamp file as `record` writes it. */
const stamps = (/** @type {{ tree: string, run?: typeof RUN }[]} */ ...entries) =>
  entries
    .map(({ tree, run = RUN }) => JSON.stringify({ tree, run: runKey(run), command: run.command }))
    .map((line) => `${line}\n`)
    .join('');
const decideFor = (/** @type {string[]} */ trees, /** @type {string | null} */ stampText) =>
  decide({ trees, stampText, run: runKey(RUN) });

describe('decide: pre-push skips only what the same full run already proved (issue #455)', () => {
  it('skips when the pushed tree passed the same full run', () => {
    const verdict = decideFor([T1], stamps({ tree: T1 }));
    assert.equal(verdict.skip, true, verdict.reason);
  });

  it('runs for a different tree', () => {
    const verdict = decideFor([T2], stamps({ tree: T1 }));
    assert.equal(verdict.skip, false);
    assert.match(verdict.reason, /2222222 never passed the full suite/);
  });

  it('runs when the tree passed only the related tests', () => {
    const verdict = decideFor([T1], stamps({ tree: T1, run: { ...RUN, command: RELATED } }));
    assert.equal(verdict.skip, false);
    assert.match(verdict.reason, /another command/);
  });

  it('runs when Node, the test database or the installed packages differ', () => {
    for (const change of [
      { node: 'v24.1.0' },
      { requireDb: '' },
      { database: 'pg://other' },
      { packages: 'b2' },
    ]) {
      const verdict = decideFor([T1], stamps({ tree: T1, run: { ...RUN, ...change } }));
      assert.equal(verdict.skip, false, JSON.stringify(change));
    }
  });

  it('runs without a stamp file, and with an empty one', () => {
    assert.equal(decideFor([T1], null).skip, false);
    assert.equal(decideFor([T1], '').skip, false);
  });

  it('runs on a corrupt stamp file, even when another line would match', () => {
    const good = stamps({ tree: T1 });
    for (const junk of [
      'not json',
      '{"tree":"1111',
      'null',
      JSON.stringify({ tree: 'abc', run: runKey(RUN), command: FULL }),
      JSON.stringify({ tree: T1, command: FULL }),
      JSON.stringify({ tree: T1, run: runKey(RUN) }),
    ]) {
      const verdict = decideFor([T1], `${good}${junk}\n`);
      assert.equal(verdict.skip, false, junk);
      assert.match(verdict.reason, /unreadable/);
    }
  });

  it('needs the tree of every pushed commit', () => {
    const text = stamps({ tree: T1 }, { tree: T2 });
    assert.equal(decideFor([T1, T2], text).skip, true);
    const verdict = decideFor([T1, T3, T2], text);
    assert.equal(verdict.skip, false);
    assert.match(verdict.reason, /^1 of 3 pushed trees not proven: 3333333/);
  });

  it('runs when the push adds no commit', () => {
    assert.equal(decideFor([], stamps({ tree: T1 })).skip, false);
  });
});

describe("parsePushLines: git's input to pre-push", () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);

  it('reads every pushed ref and drops deletions', () => {
    const text = [
      `refs/heads/x ${A} refs/heads/x ${NONE}`,
      `refs/heads/y ${B} refs/heads/y ${A}`,
      `(delete) ${NONE} refs/heads/z ${B}`,
      '',
    ].join('\n');
    assert.deepEqual(parsePushLines(text), [
      { local: A, remote: NONE },
      { local: B, remote: A },
    ]);
  });

  it('throws on a line it does not understand (the hook then runs the suite)', () => {
    assert.throws(() => parsePushLines(`refs/heads/x ${A} refs/heads/x`));
    assert.throws(() => parsePushLines(`refs/heads/x HEAD refs/heads/x ${NONE}`));
  });
});

describe('in a real repository: record after a green run, ask before the push', () => {
  const tool = join(REPO_ROOT, 'tools', 'guards', 'green-tree.mjs');

  /**
   * A repository whose remote has `main`, with the branch `feature` checked out.
   * @param {string} name
   */
  const setup = (name) => {
    const repo = scratchRepo(`lb-green-${name}-`);
    const { dir, env, git } = repo;
    const cli = (/** @type {string[]} */ args, input = '', cwd = dir) =>
      spawnSync(process.execPath, [tool, ...args], { cwd, env, input, encoding: 'utf8' });
    const write = (/** @type {string} */ file, /** @type {string} */ text) =>
      writeFileSync(join(dir, file), text);
    const commit = (/** @type {string} */ message) => {
      git('add', '-A');
      git('commit', '-qm', message);
      return git('rev-parse', 'HEAD').trim();
    };
    /** What .husky/full-suite.sh does around a green full run. */
    const greenRun = (command = FULL) => {
      const tree = cli(['snapshot']).stdout;
      return cli(['record', command, tree]).stdout;
    };
    /** What .husky/pre-push asks before a new branch goes up; exit 0 = skip the suite. */
    const push = (/** @type {string} */ sha, cwd = dir) =>
      cli(
        ['covered', FULL, 'origin'],
        `refs/heads/feature ${sha} refs/heads/feature ${NONE}\n`,
        cwd,
      );
    try {
      write('a.txt', 'a\n');
      write('b.txt', 'b\n');
      git('update-ref', 'refs/remotes/origin/main', commit('base'));
      git('checkout', '-qb', 'feature');
    } catch (e) {
      repo.remove();
      throw e;
    }
    return { ...repo, cli, write, commit, greenRun, push };
  };

  it('pushes a commit whose tree passed the full run without a second run', () => {
    const { git, write, commit, greenRun, push, remove } = setup('same');
    try {
      write('a.txt', 'changed\n');
      git('add', '-A');
      assert.match(greenRun(), /stamp: tree/);
      const pushed = push(commit('feature'));
      assert.equal(pushed.status, 0, pushed.stdout);
      assert.match(pushed.stdout, /all 1 pushed trees already passed/);
      // The record lives in the git directory: the working tree stays clean.
      assert.equal(git('status', '--porcelain').trim(), '');
    } finally {
      remove();
    }
  });

  it('runs without a record, and after an amend that changed the tree', () => {
    const { git, write, commit, greenRun, push, remove } = setup('amend');
    try {
      write('a.txt', 'changed\n');
      const plain = push(commit('only related tests'));
      assert.equal(plain.status, 1);
      assert.match(plain.stdout, /no green full run recorded/);

      write('b.txt', 'changed\n');
      git('add', '-A');
      greenRun();
      commit('full run');
      write('b.txt', 'amended\n');
      git('commit', '-qa', '--amend', '--no-edit');
      const amended = push(git('rev-parse', 'HEAD').trim());
      assert.equal(amended.status, 1);
      assert.match(amended.stdout, /never passed the full suite/);
    } finally {
      remove();
    }
  });

  it('records nothing when unstaged or untracked files were part of the run', () => {
    const { git, write, greenRun, push, remove } = setup('dirty');
    try {
      write('a.txt', 'staged\n');
      git('add', 'a.txt');
      write('b.txt', 'unstaged\n');
      assert.match(greenRun(), /no stamp/);
      git('commit', '-qm', 'staged part only');
      assert.equal(push(git('rev-parse', 'HEAD').trim()).status, 1);

      git('checkout', '--', 'b.txt');
      write('c.txt', 'untracked\n');
      write('a.txt', 'again\n');
      git('add', 'a.txt');
      assert.match(greenRun(), /no stamp/);
      git('commit', '-qm', 'with an untracked file beside it');
      assert.equal(push(git('rev-parse', 'HEAD').trim()).status, 1);
    } finally {
      remove();
    }
  });

  it('records nothing when the files changed during the run', () => {
    const { git, write, cli, commit, push, remove } = setup('during');
    try {
      write('a.txt', 'tested\n');
      git('add', '-A');
      const before = cli(['snapshot']).stdout;
      write('a.txt', 'changed while the suite ran\n');
      git('add', '-A');
      assert.match(cli(['record', FULL, before]).stdout, /no stamp/);
      assert.equal(push(commit('not what was tested')).status, 1);

      write('c.txt', 'untracked when the run began\n');
      const dirty = cli(['snapshot']).stdout;
      assert.equal(dirty, '');
      git('add', '-A');
      assert.match(cli(['record', FULL, dirty]).stdout, /no stamp/);
    } finally {
      remove();
    }
  });

  it('checks every pushed commit: a merge made without a full run runs the suite', () => {
    const { git, write, commit, greenRun, push, remove } = setup('merge');
    try {
      write('a.txt', 'feature\n');
      git('add', '-A');
      greenRun();
      commit('feature');
      git('checkout', '-q', 'main');
      write('b.txt', 'main moved\n');
      git('update-ref', 'refs/remotes/origin/main', commit('main moved'));
      git('checkout', '-q', 'feature');
      git('merge', '-q', '--no-edit', 'origin/main');
      const merged = push(git('rev-parse', 'HEAD').trim());
      assert.equal(merged.status, 1);
      assert.match(merged.stdout, /1 of 2 pushed trees not proven/);

      greenRun();
      const proven = push(git('rev-parse', 'HEAD').trim());
      assert.equal(proven.status, 0, proven.stdout);
      assert.match(proven.stdout, /all 2 pushed trees/);
    } finally {
      remove();
    }
  });

  it('never counts a related run, a corrupt file or another worktree', () => {
    const { dir, git, write, commit, greenRun, push, remove } = setup('other');
    const other = `${dir}-wt`;
    try {
      write('a.txt', 'changed\n');
      git('add', '-A');
      greenRun(RELATED);
      const sha = commit('feature');
      assert.match(push(sha).stdout, /another command/);

      const file = resolve(dir, git('rev-parse', '--git-path', 'lb-green-trees').trim());
      writeFileSync(file, 'garbage\n');
      assert.match(push(sha).stdout, /unreadable/);

      // A full run replaces the unreadable file …
      assert.match(greenRun(), /stamp: tree/);
      assert.equal(push(sha).status, 0);
      // … and its record belongs to this worktree alone.
      git('worktree', 'add', '-q', '--detach', other, sha);
      const fromThere = push(sha, other);
      assert.equal(fromThere.status, 1, fromThere.stdout);
      assert.match(fromThere.stdout, /no green full run recorded/);
    } finally {
      remove();
      rmSync(other, { recursive: true, force: true });
    }
  });
});
