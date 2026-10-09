// Licences of what the app ships (issue #493, docs/engineering-guards.md "Lizenzen").
//
// MIT, ISC, BSD and Apache ask for their notice to travel with the software. The app shows it
// under Einstellungen → „Über LearnBuddy“ → Lizenzen, from apps/mobile/lib/licences.json. That
// file is generated here, never written by hand:
//
//   - WHICH packages: those whose code is in the iOS or Android bundle (the source maps of an
//     `expo export --source-maps`), plus the app's own direct dependencies — their native code
//     is linked into the binary even where no JavaScript of theirs is in the bundle. Build tools
//     (Babel, Metro, the Expo CLI) are not shipped and not listed.
//   - name, version and licence: `pnpm licenses list` (built into pnpm).
//   - the text: the package's own licence file (plus a NOTICE, which Apache-2.0 asks to keep);
//     a package that ships none gets its licence's standard text (spdx-license-list, CC0) under
//     its declared author.
//
//   node tools/guards/licences.mjs                         guard: every listed licence is allowed
//   node tools/guards/licences.mjs <export-dir>            red when the list no longer matches
//   node tools/guards/licences.mjs <export-dir> --write    write the list anew
//
// The guard runs in `pnpm guards`; the comparison after the export in
// `pnpm -F @learnbuddy/mobile bundle:check` (pre-commit hook and CI).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import spdx from 'spdx-license-list/full.js';
import satisfies from 'spdx-satisfies';

import { REPO_ROOT } from './measure.mjs';

const MOBILE = join(REPO_ROOT, 'apps', 'mobile');
export const LIST = join(MOBILE, 'lib', 'licences.json');

/**
 * Permissive licences only (owner, 09.10.): no copyleft (GPL, LGPL, AGPL, MPL), nothing
 * non-commercial or no-derivatives, nothing unknown. An `OR` passes when one choice is here.
 */
export const ALLOWED = [
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'MIT-0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
];

/** @param {string} licence an SPDX expression as a package declares it */
export function allowed(licence) {
  try {
    return satisfies(licence, ALLOWED);
  } catch {
    return false; // not an SPDX expression ("Apache 2.0", "Unknown", "SEE LICENSE IN …")
  }
}

/**
 * @typedef {{ name: string, version: string, licence: string, text: number }} Entry
 * @typedef {{ packages: Entry[], texts: string[] }} Licences
 */

/** @param {Licences} list @returns {string[]} what is wrong with it */
export function problems(list) {
  const out = [];
  for (const p of list.packages) {
    const id = `${p.name}@${p.version}`;
    if (!allowed(p.licence)) out.push(`${id}: Lizenz „${p.licence}“ ist nicht freigegeben`);
    if (!list.texts[p.text]?.trim()) out.push(`${id}: kein Lizenztext`);
  }
  return out;
}

/** Package directories (absolute) whose code is in the exported native bundles. */
function bundled(/** @type {string} */ exportDir) {
  const dirs = new Set();
  for (const platform of ['ios', 'android']) {
    const dir = join(exportDir, '_expo', 'static', 'js', platform);
    const maps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.map')) : [];
    if (maps.length === 0) throw new Error(`keine Source-Map in ${dir} (--source-maps?)`);
    for (const map of maps) {
      for (const source of JSON.parse(readFileSync(join(dir, map), 'utf8')).sources) {
        const at = source.lastIndexOf('node_modules/');
        if (at < 0) continue;
        const [scope = '', name = ''] = source.slice(at + 'node_modules/'.length).split('/');
        const pkg = scope.startsWith('@') ? `${scope}/${name}` : scope;
        // Metro names sources from the monorepo root ("/node_modules/.pnpm/…").
        dirs.add(join(REPO_ROOT, source.slice(0, at), 'node_modules', pkg));
      }
    }
  }
  return dirs;
}

/** The app's direct dependencies (absolute package directories). */
function direct() {
  const manifest = JSON.parse(readFileSync(join(MOBILE, 'package.json'), 'utf8'));
  return Object.entries(manifest.dependencies)
    .filter(([, range]) => !String(range).startsWith('workspace:'))
    .map(([name]) => realpathSync(join(MOBILE, 'node_modules', name)));
}

/** `pnpm licenses list` for the app's production tree, by package directory. */
function pnpmLicences() {
  const run = spawnSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
    cwd: MOBILE,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`pnpm licenses list: ${run.stderr}`);
  /** @type {Map<string, { name: string, version: string, licence: string, author: string }>} */
  const byDir = new Map();
  for (const [licence, packages] of Object.entries(JSON.parse(run.stdout))) {
    for (const p of packages) {
      p.paths.forEach((/** @type {string} */ dir, /** @type {number} */ i) =>
        byDir.set(dir, { name: p.name, version: p.versions[i], licence, author: p.author ?? '' }),
      );
    }
  }
  return byDir;
}

const LICENCE_FILE = /^(licen[cs]e|copying)([-._].*)?$/i;
const NOTICE_FILE = /^notice(\..*)?$/i;
/** `license.js` and the like are code, not a licence text. */
const CODE_FILE = /\.(c|m)?[jt]sx?$|\.json$|\.map$/i;

/** The package's own licence text, or the standard text of its licence. */
function textOf(
  /** @type {string} */ dir,
  /** @type {string} */ licence,
  /** @type {string} */ author,
) {
  const files = readdirSync(dir).sort();
  const read = (/** @type {RegExp} */ re) =>
    files
      .filter((f) => re.test(f) && !CODE_FILE.test(f))
      .map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trim());
  const own = [...read(LICENCE_FILE), ...read(NOTICE_FILE)].filter(Boolean);
  if (own.length > 0) return own.join('\n\n');
  const standard = spdx[licence]?.licenseText?.trim();
  if (!standard) return '';
  return author ? standard.replace('<year> <copyright holders>', author) : standard;
}

/** @returns {Licences} */
export function generate(/** @type {string} */ exportDir) {
  const known = pnpmLicences();
  const dirs = new Set([...bundled(exportDir), ...direct()]);
  /** @type {(Omit<Entry, 'text'> & { body: string })[]} */
  const rows = [];
  for (const dir of dirs) {
    const meta = known.get(dir) ?? known.get(realpathSync(dir));
    if (!meta) throw new Error(`${dir}: nicht in \`pnpm licenses list --prod\``);
    rows.push({ ...meta, body: textOf(dir, meta.licence, meta.author) });
  }
  // By code point, not localeCompare: the order must not depend on the machine's locale (CI).
  const order = (/** @type {string} */ x, /** @type {string} */ y) => (x < y ? -1 : x > y ? 1 : 0);
  rows.sort((a, b) => order(a.name, b.name) || order(a.version, b.version));
  // One copy of each text: the Expo packages, Babel's and the like share theirs word for word.
  /** @type {string[]} */
  const texts = [];
  const packages = rows.map(({ name, version, licence, body }) => {
    if (!texts.includes(body)) texts.push(body);
    return { name, version, licence, text: texts.indexOf(body) };
  });
  return { packages, texts };
}

function main() {
  const [exportDir, flag] = process.argv.slice(2);
  /** @type {Licences} */
  const committed = JSON.parse(readFileSync(LIST, 'utf8'));
  const list = exportDir === undefined ? committed : generate(exportDir);
  if (flag === '--write') {
    writeFileSync(LIST, JSON.stringify(list, null, 2) + '\n');
    console.log(`Lizenzen: ${list.packages.length} Pakete nach ${LIST} geschrieben`);
  } else if (JSON.stringify(list) !== JSON.stringify(committed)) {
    console.error(
      `✗ Lizenzen: apps/mobile/lib/licences.json passt nicht mehr zu dem, was die App ausliefert.\n` +
        `  Neu schreiben: node tools/guards/licences.mjs ${resolve(exportDir ?? '')} --write`,
    );
    process.exit(1);
  }
  const wrong = problems(list);
  if (wrong.length > 0) {
    console.error(`✗ Lizenzen (ausgeliefert):\n  ${wrong.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✓ Lizenzen: ${list.packages.length} ausgelieferte Pakete, alle freigegeben`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
