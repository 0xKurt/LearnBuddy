// Pre-push runs the full test suite only for a tree that has not passed it yet (issue #455).
//
// The pre-commit hook runs the full suite whenever shared ground is staged, and pre-push used to
// run it again on exactly the same tree: with many branches on four cores that doubled the
// slowest step. Now a green full run records the tree it ran on, in the worktree's own git
// directory (`git rev-parse --git-path lb-green-trees`, never tracked). Pre-push skips the suite
// only when the tree of EVERY commit it pushes is recorded with the same run: the same command,
// Node, test-database settings and installed packages. Anything else runs the suite as before —
// no record, an unreadable one, a tree from a related-tests run, a merge or an amend made without
// a full run, another command, an error here.
//
// A tree is recorded only when the files on disk were exactly that tree before and after the
// run: nothing unstaged, nothing untracked. Ignored files (.env.local, build output) are not part
// of any tree; docs/engineering-guards.md §Pre-Push.
//
//   node tools/guards/green-tree.mjs snapshot                    the tree on disk, or nothing
//   node tools/guards/green-tree.mjs record <command> <tree>     after a green full run
//   node tools/guards/green-tree.mjs covered <command> <remote>  pre-push, git's lines on stdin:
//                                                                exit 0 proven, else run it

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Records kept per worktree; a push only looks at the commits it adds. */
const KEEP = 50;
/** A git object id, SHA-1 or SHA-256. */
const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const ZERO = /^0+$/;
const RUN_KEY = /^[0-9a-f]{64}$/;

/**
 * What besides the tree decides how a full run turns out.
 * @typedef {{ command: string, node: string, requireDb: string, database: string, packages: string }} Run
 * @typedef {{ tree: string, run: string, command: string }} Stamp
 */

const sha256 = (/** @type {string | Buffer} */ data) =>
  createHash('sha256').update(data).digest('hex');

/** @param {Run} run */
export function runKey(run) {
  return sha256(JSON.stringify([run.command, run.node, run.requireDb, run.database, run.packages]));
}

/**
 * The records in the stamp file, or null when any line is not one — then nothing counts.
 * @param {string} text
 * @returns {Stamp[] | null}
 */
function parseStamps(text) {
  /** @type {Stamp[]} */
  const stamps = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let s;
    try {
      s = JSON.parse(line);
    } catch {
      return null;
    }
    if (!OID.test(s?.tree) || !RUN_KEY.test(s?.run) || typeof s?.command !== 'string') return null;
    stamps.push({ tree: s.tree, run: s.run, command: s.command });
  }
  return stamps;
}

/**
 * Whether pre-push may skip the full suite: only when every pushed tree passed this very run.
 * @param {{ trees: string[], stampText: string | null, run: string }} input
 *   trees: of every commit the push adds; stampText: the stamp file, null when there is none
 * @returns {{ skip: boolean, reason: string }}
 */
export function decide({ trees, stampText, run }) {
  if (stampText === null) return { skip: false, reason: 'no green full run recorded here yet' };
  const stamps = parseStamps(stampText);
  if (stamps === null) return { skip: false, reason: 'the stamp file is unreadable' };
  if (trees.length === 0) return { skip: false, reason: 'no new commit to compare' };
  const proven = new Set(stamps.filter((s) => s.run === run).map((s) => s.tree));
  const open = trees.filter((t) => !proven.has(t));
  const first = open[0];
  if (first === undefined) {
    return { skip: true, reason: `all ${trees.length} pushed trees already passed the full suite` };
  }
  const other = stamps.find((s) => s.tree === first);
  const why = other
    ? `was green under another command, Node, database or package set (${other.command})`
    : 'never passed the full suite here';
  return {
    skip: false,
    reason: `${open.length} of ${trees.length} pushed trees not proven: ${first.slice(0, 7)} ${why}`,
  };
}

/**
 * git's pre-push input, `<local ref> <local oid> <remote ref> <remote oid>` per line.
 * @param {string} text
 * @returns {{ local: string, remote: string }[]} the refs that push commits; deletions dropped
 */
export function parsePushLines(text) {
  /** @type {{ local: string, remote: string }[]} */
  const refs = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [, local = '', , remote = '', ...rest] = line.trim().split(' ');
    if (!OID.test(local) || !OID.test(remote) || rest.length > 0) {
      throw new Error(`unexpected pre-push line: ${line}`);
    }
    if (!ZERO.test(local)) refs.push({ local, remote });
  }
  return refs;
}

/** git's trimmed output; throws when git fails. */
const git = (/** @type {string[]} */ args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** git's trimmed output, or null when git fails. */
const gitOrNull = (/** @type {string[]} */ args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** The tree the files on disk are, or null when they are not exactly the index. */
function snapshot() {
  const unstaged = gitOrNull(['--no-optional-locks', 'diff', '--quiet']) === null;
  if (unstaged || git(['ls-files', '--others', '--exclude-standard']) !== '') return null;
  // write-tree refuses an index with conflicts: then there is no tree to vouch for.
  return gitOrNull(['write-tree']);
}

/** @param {string} command */
function currentRun(command) {
  const lock = join(git(['rev-parse', '--show-toplevel']), 'node_modules', '.pnpm', 'lock.yaml');
  return {
    command,
    node: process.version,
    requireDb: process.env.LB_REQUIRE_TEST_DB ?? '',
    database: process.env.LB_TEST_DATABASE_URL ?? '',
    packages: existsSync(lock) ? sha256(readFileSync(lock)) : 'none',
  };
}

const stampFile = () => resolve(git(['rev-parse', '--git-path', 'lb-green-trees']));
const readStamps = (/** @type {string} */ file) =>
  existsSync(file) ? readFileSync(file, 'utf8') : null;

/**
 * After a green full run: records the tree, when the files on disk were it before and after.
 * @param {string} command
 * @param {string} before the snapshot taken right before the run ('' when there was none)
 * @returns {string} what happened, for the hook's output
 */
function record(command, before) {
  const tree = snapshot();
  if (before === '' || tree !== before) {
    return 'no stamp: unstaged or untracked files, or files changed during the run';
  }
  const file = stampFile();
  // An unreadable file is replaced: it counted for nothing anyway.
  const old = parseStamps(readStamps(file) ?? '') ?? [];
  const run = runKey(currentRun(command));
  const kept = old.filter((s) => s.tree !== tree || s.run !== run).slice(-(KEEP - 1));
  const text = [...kept, { tree, run, command }].map((s) => JSON.stringify(s)).join('\n');
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${text}\n`);
  renameSync(tmp, file);
  return `stamp: tree ${tree.slice(0, 7)} passed the full suite; a push of it skips a second run`;
}

/**
 * Pre-push: the trees of every commit the push adds — reachable from a pushed ref, not from what
 * the remote has (its old value for the ref, or any of its remote-tracking refs).
 * @param {{ local: string, remote: string }[]} refs
 * @param {string} remote the remote's name, as git passes it to the hook
 */
function pushedTrees(refs, remote) {
  if (refs.length === 0) return [];
  const known = refs
    .map((r) => r.remote)
    .filter((oid) => !ZERO.test(oid) && gitOrNull(['cat-file', '-e', `${oid}^{commit}`]) !== null);
  const local = refs.map((r) => r.local);
  const out = git(['log', '--format=%T', ...local, '--not', ...known, `--remotes=${remote}`]);
  return [...new Set(out.split('\n').filter(Boolean))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [action, command, arg] = process.argv.slice(2);
  try {
    if (action === 'snapshot') {
      process.stdout.write(snapshot() ?? '');
    } else if (action === 'record' && command) {
      console.log(`→ ${record(command, arg ?? '')}`);
    } else if (action === 'covered' && command && arg) {
      const verdict = decide({
        trees: pushedTrees(parsePushLines(readFileSync(0, 'utf8')), arg),
        stampText: readStamps(stampFile()),
        run: runKey(currentRun(command)),
      });
      console.log(`→ pre-push: ${verdict.reason}`);
      process.exit(verdict.skip ? 0 : 1);
    } else {
      console.error(
        'usage: green-tree.mjs snapshot | record <command> <tree> | covered <command> <remote>',
      );
      process.exit(2);
    }
  } catch (e) {
    // Anything unclear means the full suite: the hooks read a non-zero exit as "run it".
    console.log(`→ ${action}: ${e instanceof Error ? e.message : String(e)}; full suite`);
    process.exit(1);
  }
}
