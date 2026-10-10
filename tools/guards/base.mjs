// The Ausnahmelisten are measured on main, not kept in files (issue #452,
// docs/engineering-guards.md).
//
// Until #452 every list was a JSON file in tools/guards/baselines/ that had to follow the code
// down in the same PR (`pnpm guards:shrink`). Almost every PR shrank something, so two parallel
// PRs met in the same file — a conflict only a local merge driver could resolve. GitHub runs
// none: the PR was "dirty" and got no CI. Now these lists are no files at all. What a file or
// the repository may have is what it has on the BASE — the commit of main this branch stands
// on — measured with today's guards:
//
//   · a shrink needs no commit: once it is on main, it is the new measure;
//   · more than main has is red, unless this branch grants it in a file of its own under
//     tools/guards/growth/ (two branches never write the same file) and a commit says why with
//     `Ausnahmeliste-Zuwachs: #<issue> <Grund>` (no-growth.mjs). A grant counts only on the
//     branch that adds or changes it; once merged, main's measurement carries it.
//
// The base is the merge base of HEAD and origin/main — while a merge is in progress, that of
// MERGE_HEAD when it is newer. In CI on a pull request HEAD is the PR merged into main, so the
// base is main's tip. Measurements are cached per base commit and guard version in
// node_modules/.cache/lb-guards/.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_LINES,
  PRESSABLE_DIRS,
  RAW_PRESSABLES,
  REPO_ROOT,
  UI_DIRS,
  countedLines,
  importsRawPressable,
  styleNumbers,
} from './measure.mjs';

/** The branch whose state is the measure. */
const BASE_BRANCH = 'origin/main';
/** Where a branch grants itself more than main has: one JSON file per grant. */
export const GROWTH_DIR = 'tools/guards/growth';
const CACHE = join(REPO_ROOT, 'node_modules', '.cache', 'lb-guards');
/** Cached measurements older than this go when a new one is written. */
const CACHE_DAYS = 7;
/** main's tree is unpacked under this name in the temp directory (inTree). */
const TREE_PREFIX = 'lb-guards-main-';
const SOURCE = /\.(ts|tsx|mjs|js)$/;
const TS = /\.tsx?$/;

/**
 * @typedef {{
 *   maxLines: Record<string, number>,
 *   styleNumbers: Record<string, number>,
 *   pressable: string[],
 * }} FileLists
 * @typedef {FileLists & { clones: Record<string, number>, knip: string[], boundaries: string[] }} Lists
 * @typedef {{ issue: string, reason: string } & Partial<Lists>} Grant
 */

// ─────────────── git ───────────────

/**
 * git in `cwd`, raw. Another repository (the tests' throwaway one) gets none of the GIT_*
 * variables a hook exports — inherited, they would point its commands at this one.
 * @param {string[]} args @param {string} cwd @param {string} [input] @returns {Buffer}
 */
function gitRaw(args, cwd, input) {
  const env =
    cwd === REPO_ROOT
      ? process.env
      : Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return execFileSync('git', args, {
    cwd,
    env,
    input,
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd = REPO_ROOT) => gitRaw(args, cwd).toString('utf8');

/** @param {string} ref @param {string} cwd @returns {string | null} */
function commitOf(ref, cwd) {
  try {
    return git(['rev-parse', '--verify', '-q', `${ref}^{commit}`], cwd).trim();
  } catch {
    return null;
  }
}

/** @param {string} a @param {string} b @param {string} cwd */
function isAncestor(a, b, cwd) {
  try {
    git(['merge-base', '--is-ancestor', a, b], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * The branch the lists are measured on: origin/main — or, in a repository without an `origin`
 * (a new app from create-buddy that was never pushed, issue #107), its own main.
 * @param {string} cwd @returns {string}
 */
export function baseBranch(cwd) {
  try {
    git(['remote', 'get-url', 'origin'], cwd);
    return BASE_BRANCH;
  } catch {
    return 'main';
  }
}

/**
 * The commit of main the lists are measured on: where HEAD left main — or, while a merge is in
 * progress, where MERGE_HEAD left it when that is newer: what main grew with its own reasons is
 * not the merging branch's growth.
 * @param {string} [cwd] the repository (the tests pass a throwaway one)
 * @param {string} [branch]
 */
export function baseSha(cwd = REPO_ROOT, branch = baseBranch(cwd)) {
  const main = commitOf(branch, cwd);
  if (main === null) {
    throw new Error(
      `Die Ausnahmelisten werden auf ${branch} gemessen, aber ${branch} ist hier unbekannt — \`git fetch origin main\` (Issue #452).`,
    );
  }
  const bases = ['HEAD', 'MERGE_HEAD']
    .filter((tip) => commitOf(tip, cwd) !== null)
    .map((tip) => git(['merge-base', tip, main], cwd).trim());
  if (bases.length === 0)
    throw new Error(`Kein Commit in ${cwd}: nichts, das auf ${branch} steht.`);
  return bases.reduce((a, b) => (isAncestor(a, b, cwd) ? b : a));
}

// ─────────────── measuring a commit ───────────────

/**
 * Every source file of `sha` under `dirs` with its text: one `git ls-tree`, one
 * `git cat-file --batch`.
 * @param {string} sha @param {string[]} dirs @param {string} cwd @returns {Map<string, string>}
 */
function filesAt(sha, dirs, cwd) {
  /** @type {Array<[string, string]>} [blob, file] */
  const blobs = [];
  for (const line of git(['ls-tree', '-r', '-z', sha, '--', ...dirs], cwd).split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
    if (m !== null && m[1] !== undefined && m[2] !== undefined && SOURCE.test(m[2])) {
      blobs.push([m[1], m[2]]);
    }
  }
  /** @type {Map<string, string>} */
  const out = new Map();
  if (blobs.length === 0) return out;
  const raw = gitRaw(['cat-file', '--batch'], cwd, blobs.map(([b]) => b).join('\n') + '\n');
  let at = 0;
  for (const [, file] of blobs) {
    // "<blob> blob <size>\n<content>\n"
    const eol = raw.indexOf(10, at);
    const size = Number(raw.subarray(at, eol).toString('utf8').split(' ')[2]);
    out.set(file, raw.subarray(eol + 1, eol + 1 + size).toString('utf8'));
    at = eol + 1 + size + 1;
  }
  return out;
}

// A text without these words cannot have a hit: it is not parsed (the check only lets more
// through to the exact measurement, never less).
const MAY_STYLE = /padding|margin|[gG]ap|fontSize|lineHeight|Radius/;
const MAY_PRESS = new RegExp([...new Set(Object.values(RAW_PRESSABLES).flat())].join('|'));

/**
 * The per-file lists of a commit, exactly what ESLint checks: files over the line limit with
 * their size, free style numbers per UI file, the files that import a raw Pressable.
 * @param {string} sha @param {string} [cwd] @returns {FileLists}
 */
export function measureFiles(sha, cwd = REPO_ROOT) {
  /** @type {FileLists} */
  const lists = { maxLines: {}, styleNumbers: {}, pressable: [] };
  for (const [dir, limit] of Object.entries(MAX_LINES)) {
    for (const [file, text] of filesAt(sha, [dir], cwd)) {
      // Counted lines are never more than raw lines: a short file needs no parse.
      if (text.split('\n').length <= limit) continue;
      const n = countedLines(text, file);
      if (n > limit) lists.maxLines[file] = n;
    }
  }
  for (const [file, text] of filesAt(sha, UI_DIRS, cwd)) {
    if (!TS.test(file) || file.includes('/__tests__/') || !MAY_STYLE.test(text)) continue;
    const n = styleNumbers(text, file);
    if (n > 0) lists.styleNumbers[file] = n;
  }
  for (const [file, text] of filesAt(sha, PRESSABLE_DIRS, cwd)) {
    if (!TS.test(file) || file.startsWith('apps/mobile/components/lb/')) continue;
    if (MAY_PRESS.test(text) && importsRawPressable(text, file)) lists.pressable.push(file);
  }
  lists.pressable.sort();
  return lists;
}

/**
 * Runs `measure` on the whole tree of `sha` (jscpd and knip look at the repository, not at one
 * file): the commit unpacked into a temporary directory, this checkout's node_modules linked in
 * — knip resolves imports through them. In the temp directory, not under node_modules/.cache:
 * knip run in a tree below a node_modules folder fails to load its plugins' files (.husky/*,
 * tried for #452).
 * @template T
 * @param {string} sha @param {(root: string) => T} measure @returns {T}
 */
function inTree(sha, measure) {
  removeStale(tmpdir(), TREE_PREFIX, 1);
  const root = mkdtempSync(join(tmpdir(), TREE_PREFIX));
  const tar = `${root}.tar`;
  try {
    git(['archive', '--format=tar', '-o', tar, sha]);
    execFileSync('tar', ['-xf', tar, '-C', root]);
    for (const pkg of git(['ls-tree', '-r', '--name-only', sha]).split('\n')) {
      if (!/(^|\/)package\.json$/.test(pkg)) continue;
      const modules = join(REPO_ROOT, dirname(pkg), 'node_modules');
      if (existsSync(modules)) symlinkSync(modules, join(root, dirname(pkg), 'node_modules'));
    }
    return measure(root);
  } finally {
    // rmSync removes a symlink, never what it points to.
    rmSync(tar, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Deletes what in `dir` starts with `prefix` and is older than `days`: the tree of a guard run
 * that was killed, the measurement of a main tip long gone.
 * @param {string} dir @param {string} prefix @param {number} days
 */
function removeStale(dir, prefix, days) {
  const old = Date.now() - days * 86_400_000;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix)) continue;
    try {
      const path = join(dir, name);
      if (statSync(path).mtimeMs < old) rmSync(path, { recursive: true, force: true });
    } catch {
      // Another guard process removed it first.
    }
  }
}

// ─────────────── cache ───────────────

/** @type {string | null} */
let version = null;
/** The guards' own code and the tool versions: a changed rule measures main anew. */
function guardVersion() {
  if (version !== null) return version;
  const hash = createHash('sha256');
  const dir = join(REPO_ROOT, 'tools', 'guards');
  for (const f of readdirSync(dir).sort()) {
    if (f.endsWith('.mjs') && !f.endsWith('.test.mjs')) {
      hash.update(f).update(readFileSync(join(dir, f)));
    }
  }
  hash.update(readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml')));
  version = hash.digest('hex').slice(0, 12);
  return version;
}

/**
 * A measurement of main, measured once per base commit and guard version.
 * @template T
 * @param {string} key @param {() => T} measure @returns {T}
 */
function cached(key, measure) {
  const file = join(CACHE, `${key}-${guardVersion()}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const value = measure();
  mkdirSync(CACHE, { recursive: true });
  removeStale(CACHE, '', CACHE_DAYS);
  // Written whole or not at all: guards running in parallel read it.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
  return value;
}

// ─────────────── grants ───────────────

/** The lists a grant may raise: numbers per entry, or entries. */
const GRANTABLE = /** @type {const} */ ({
  maxLines: 'numbers',
  styleNumbers: 'numbers',
  clones: 'numbers',
  pressable: 'entries',
  knip: 'entries',
  boundaries: 'entries',
});

/** @param {string} name @param {string} text @returns {Grant} */
function parseGrant(name, text) {
  const where = `${GROWTH_DIR}/${name}`;
  /** @type {Record<string, unknown>} */
  const grant = JSON.parse(text);
  if (typeof grant.issue !== 'string' || !/^#\d+$/.test(grant.issue)) {
    throw new Error(`${where}: "issue" fehlt ("#<Nummer>")`);
  }
  if (typeof grant.reason !== 'string' || grant.reason.trim().length < 5) {
    throw new Error(`${where}: "reason" fehlt (warum der Zuwachs sein muss)`);
  }
  for (const [key, value] of Object.entries(grant)) {
    if (key === 'issue' || key === 'reason') continue;
    const kind = GRANTABLE[/** @type {keyof typeof GRANTABLE} */ (key)];
    const ok =
      kind === 'entries'
        ? Array.isArray(value) && value.every((v) => typeof v === 'string')
        : kind === 'numbers' &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value).every((v) => Number.isInteger(v) && v > 0);
    if (!ok) {
      throw new Error(
        `${where}: "${key}" — erlaubt sind ${Object.entries(GRANTABLE)
          .map(([k, v]) => `${k} (${v === 'numbers' ? '{ Eintrag: Zahl }' : '[Einträge]'})`)
          .join(', ')}`,
      );
    }
  }
  return /** @type {Grant} */ (grant);
}

/**
 * The grants this branch adds or changes: a file under GROWTH_DIR whose text main (the base)
 * does not have. One that main already has is inside main's measurement and counts no more.
 * @param {string} sha the base @param {string} [cwd] @returns {Grant[]}
 */
export function activeGrants(sha, cwd = REPO_ROOT) {
  const dir = join(cwd, GROWTH_DIR);
  if (!existsSync(dir)) return [];
  /** @type {Grant[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const text = readFileSync(join(dir, name), 'utf8');
    /** @type {string | null} */
    let onMain = null;
    try {
      onMain = git(['show', `${sha}:${GROWTH_DIR}/${name}`], cwd);
    } catch {
      // Not on main: new on this branch.
    }
    if (text !== onMain) out.push(parseGrant(name, text));
  }
  return out;
}

/**
 * The measure plus what the grants add: the larger number per entry, the union of entries.
 * Only the lists present in `lists` are touched.
 * @template {Partial<Lists>} L
 * @param {L} lists @param {Grant[]} grants @returns {L}
 */
export function withGrants(lists, grants) {
  /** @type {Record<string, Record<string, number> | string[]>} */
  const out = {};
  for (const [key, have] of Object.entries(lists)) {
    out[key] = Array.isArray(have) ? [...have] : { ...have };
  }
  for (const grant of grants) {
    for (const [key, have] of Object.entries(out)) {
      const more = /** @type {Record<string, number> | string[] | undefined} */ (
        grant[/** @type {keyof Lists} */ (key)]
      );
      if (more === undefined) continue;
      if (Array.isArray(have) && Array.isArray(more)) {
        out[key] = [...new Set([...have, ...more])].sort();
      } else if (!Array.isArray(have) && !Array.isArray(more)) {
        for (const [entry, n] of Object.entries(more)) have[entry] = Math.max(have[entry] ?? 0, n);
      }
    }
  }
  return /** @type {L} */ (out);
}

// ─────────────── what the guards ask ───────────────

/** main's per-file lists. @param {string} sha the base */
const filesOnMain = (sha) => cached(`${sha}-files`, () => measureFiles(sha));

/** What ESLint allows per file today: main's per-file lists plus this branch's grants. */
export function fileAllowance() {
  const sha = baseSha();
  return withGrants(filesOnMain(sha), activeGrants(sha));
}

/**
 * What a whole-repository guard allows today: what `measure` finds on main's tree, plus this
 * branch's grants for `list`.
 * @template {Record<string, number> | string[]} T
 * @param {'clones' | 'knip' | 'boundaries'} list @param {(root: string) => T} measure @returns {T}
 */
export function treeAllowance(list, measure) {
  const sha = baseSha();
  const onMain = cached(`${sha}-${list}`, () => inTree(sha, measure));
  return /** @type {T} */ (withGrants({ [list]: onMain }, activeGrants(sha))[list]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // `node tools/guards/base.mjs`: main's per-file lists, the numbers in the docs' table.
  // (Copies and dead code: `pnpm guards` prints them.)
  const sha = baseSha();
  const { maxLines, styleNumbers: style, pressable } = filesOnMain(sha);
  const sum = Object.values(style).reduce((a, b) => a + b, 0);
  console.log(`Gemessen auf ${sha.slice(0, 7)} (Basis auf ${BASE_BRANCH}):`);
  console.log(`  Dateien über der Zeilengrenze: ${Object.keys(maxLines).length}`);
  console.log(`  freie Stilzahlen: ${sum} in ${Object.keys(style).length} Dateien`);
  console.log(`  Dateien mit rohem Pressable: ${pressable.length}`);
}
