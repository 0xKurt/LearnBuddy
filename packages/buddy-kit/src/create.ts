// create-buddy: a new, independent project from this repository (issue #107 §2, "Weg b").
//
// What it does, and only this:
// - copies the tracked files (never .git, never the source's secrets or store identity, never
//   its history like docs/legacy or reports, never the generator itself);
// - gives the copy its own identity (rewrite.ts) and cuts every tie to the source's
//   infrastructure: Expo project, update URL, the builds' API/Supabase addresses, the health
//   probe, the local Supabase stack, the repository CLAUDE.md files issues in;
// - checks that no such tie is left (source.ts `findForeign`): the identifiers are read from
//   the source's own files, so a new tie of the source is caught, not missed;
// - writes buddy.config.json, docs/legal/processors.md and BUDDY-SETUP.md (the checklist).
//
// With `core` (create-buddy --core, issue #107 cut 10) the copy takes the generic core by
// construction: the learning domain stays out and its two seams register nothing (core.ts).
// Without it the copy keeps the domain, and the report counts what of it is in the copy, so that
// work stays visible instead of hidden behind a renamed home screen.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { checklistMarkdown } from './checklist.js';
import {
  CONTRACTS_BARREL,
  CORE_ASSEMBLY,
  CORE_ASSEMBLY_TEXT,
  CORE_SEAMS,
  coreBarrel,
  corePackageJson,
  supportReachingGaps,
  type DomainSignals,
} from './core.js';
import { type BuddyConfig, KitError } from './config.js';
import { processorsMarkdown } from './processors.js';
import { REWRITES, rewriteEverywhere } from './rewrite.js';
import { findForeign, readSource } from './source.js';
import { BASELINE, COPY_BASELINE, coreMigrationList, isMigration } from './baseline.js';

/** Never copied: history, research, the local state of provision. */
const EXCLUDED_PREFIXES = [
  '.git/',
  'docs/legacy/',
  'docs/decisions/',
  'reports/',
  'research_notes/',
  'design-examples/',
  // `.buddy/` is a project's own local state and secrets (provision) — never another app's.
  '.buddy/',
];
const EXCLUDED_FILES = new Set([
  // The source's Firebase app: the new Buddy registers its own (issue #107 §3).
  'apps/mobile/google-services.json',
  'apps/mobile/GoogleService-Info.plist',
  // Audits and measurements of the source's own production.
  'docs/issue-audit-2026-10-01.md',
  'docs/speed-audit.md',
]);
/**
 * The generator itself: a new app provisions itself (provision stays), but does not make further
 * apps from its own tree. create.test.ts holds the list against the package.
 */
export const KIT_ONLY = [
  'packages/buddy-kit/reference.config.json',
  'packages/buddy-kit/src/checklist.ts',
  'packages/buddy-kit/src/create.ts',
  'packages/buddy-kit/src/rewrite.ts',
  'packages/buddy-kit/src/source.ts',
  'packages/buddy-kit/src/cli/create-buddy.ts',
  'packages/buddy-kit/src/__tests__/create.test.ts',
  'packages/buddy-kit/src/__tests__/create-cli.test.ts',
  // The core copy and its check (issue #107, cut 10) make further apps from this tree too.
  'packages/buddy-kit/core-gaps.json',
  'packages/buddy-kit/src/core.ts',
  'packages/buddy-kit/src/cli/core-check.ts',
  'packages/buddy-kit/src/__tests__/core.test.ts',
];
const EXCLUDED_PATTERN = /\.(jks|keystore|p8|p12|key|mobileprovision)$|(^|\/)\.env(\.|$)/;

export function isCopied(path: string): boolean {
  if (EXCLUDED_FILES.has(path) || KIT_ONLY.includes(path)) return false;
  if (EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return false;
  if (EXCLUDED_PATTERN.test(path) && !path.endsWith('.env.example')) return false;
  return true;
}

export type CreateReport = {
  copied: number;
  skipped: string[];
  rewritten: string[];
  /** Ties to the source's infrastructure still in the copy — must be empty (the CLI fails). */
  links: Array<{ file: string; line: number; what: string }>;
  /** Copied files of the learning domain, per pattern of boundaries.config.mjs. */
  domain: Array<{ pattern: string; files: number }>;
  /** Files that still say "LearnBuddy", most first (the extraction that is left). */
  leftovers: Array<{ file: string; count: number }>;
  /** `core`: files of the domain left out, and tests, evals or scripts that reach them. */
  core: { domain: number; support: string[] } | null;
};

/** Text files are rewritten and scanned; binaries are copied as they are. */
/** The API's list of expected migrations; a core copy expects its one baseline. */
const MIGRATION_LIST = 'apps/api/src/lib/migrations.ts';

const TEXT =
  /\.(ts|tsx|js|mjs|cjs|json|md|sql|ya?ml|sh|txt|html|css|toml)$|(^|\/)\.(gitignore|[a-z]+rc)$/;

export function createBuddy(opts: {
  sourceRoot: string;
  targetRoot: string;
  /** The files to consider, relative to sourceRoot (the CLI passes `git ls-files`). */
  files: string[];
  config: BuddyConfig;
  /** The domain patterns (tools/guards/boundaries.config.mjs `DOMAIN`), for the report. */
  domain?: readonly string[];
  /** Leave the domain out: the generic core by construction (core.ts). Needs `domain`. */
  core?: boolean;
  /** What tells a test of the domain where no import does (core.ts `namesDomain`). */
  signals?: DomainSignals;
}): CreateReport {
  const source = resolve(opts.sourceRoot);
  const target = resolve(opts.targetRoot);
  const rel = relative(source, target);
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/')))
    throw new KitError(`the target ${target} lies inside the source ${source}`);
  if (existsSync(target) && readdirSync(target).length > 0)
    throw new KitError(`the target ${target} exists and is not empty — nothing was written`);
  const identity = readSource(source);

  const report: CreateReport = {
    copied: 0,
    skipped: [],
    rewritten: [],
    links: [],
    domain: [],
    leftovers: [],
    core: null,
  };
  const domain = (opts.domain ?? []).map((p) => new RegExp(p));
  if (opts.core && domain.length === 0) throw new KitError('--core needs the domain patterns');
  const ofDomain = (f: string) => opts.core === true && domain.some((r) => r.test(f));
  // The core copy: the domain stays out, then every test, eval or script that reaches it.
  const support = opts.core
    ? supportReachingGaps(
        source,
        [
          ...opts.files.filter((f) => isCopied(f) && !ofDomain(f)),
          ...Object.keys(CORE_SEAMS),
          CORE_ASSEMBLY,
        ],
        opts.signals,
      )
    : [];
  const leftOut = new Set(support);
  if (opts.core) report.core = { domain: opts.files.filter(ofDomain).length, support };
  const copied: string[] = [];
  for (const file of opts.files) {
    // A core copy migrates from its own baseline, not the source's migrations (baseline.ts).
    if (
      !isCopied(file) ||
      ofDomain(file) ||
      leftOut.has(file) ||
      (opts.core && isMigration(file))
    ) {
      report.skipped.push(file);
      continue;
    }
    const from = join(source, file);
    if (!existsSync(from)) continue; // deleted in the working tree but still tracked
    const to = join(target, file);
    mkdirSync(dirname(to), { recursive: true });
    if (TEXT.test(file)) {
      const before = readFileSync(from, 'utf8');
      const whole = REWRITES[file];
      const after = rewriteEverywhere(
        whole ? whole(before, opts.config, identity) : before,
        file,
        opts.config,
        identity,
      );
      writeFileSync(to, after);
      if (after !== before) report.rewritten.push(file);
    } else {
      writeFileSync(to, readFileSync(from));
    }
    chmodSync(to, statSync(from).mode); // hooks and scripts stay executable
    copied.push(file);
    report.copied++;
  }
  if (opts.core) {
    const written: Array<[string, string]> = [
      ...Object.entries(CORE_SEAMS),
      [CORE_ASSEMBLY, CORE_ASSEMBLY_TEXT],
      [COPY_BASELINE, readFileSync(join(source, BASELINE), 'utf8')],
      [MIGRATION_LIST, coreMigrationList(readFileSync(join(target, MIGRATION_LIST), 'utf8'))],
    ];
    for (const [file, text] of written) {
      mkdirSync(dirname(join(target, file)), { recursive: true });
      writeFileSync(join(target, file), text);
      copied.push(file);
    }
    const present = new Set(copied);
    const barrel = join(target, CONTRACTS_BARREL);
    writeFileSync(barrel, coreBarrel(readFileSync(barrel, 'utf8'), present));
    for (const file of copied.filter((f) => f.endsWith('package.json'))) {
      const at = join(target, file);
      writeFileSync(at, corePackageJson(readFileSync(at, 'utf8'), present));
    }
  }
  writeFileSync(join(target, 'buddy.config.json'), `${JSON.stringify(opts.config, null, 2)}\n`);
  mkdirSync(join(target, 'docs/legal'), { recursive: true });
  writeFileSync(join(target, 'docs/legal/processors.md'), processorsMarkdown(opts.config));

  const texts = copied.filter((f) => TEXT.test(f));
  report.links = findForeign(target, texts, identity.foreign);
  report.domain = (opts.domain ?? []).map((pattern) => ({
    pattern,
    files: copied.filter((f) => new RegExp(pattern).test(f)).length,
  }));
  const word = new RegExp(identity.name.replace(/(?<=[a-z])(?=[A-Z])/g, ' ?'), 'gi');
  for (const file of texts) {
    const count = (readFileSync(join(target, file), 'utf8').match(word) ?? []).length;
    if (count > 0) report.leftovers.push({ file, count });
  }
  report.leftovers.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  writeFileSync(join(target, 'BUDDY-SETUP.md'), checklistMarkdown(opts.config, report));
  return report;
}
