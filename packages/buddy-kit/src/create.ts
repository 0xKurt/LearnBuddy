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
// What it does NOT do yet: leave the learning domain out. The generic core still imports it
// (tools/guards/boundaries.mjs measures how much); once the cuts of #107 are through, the copy
// takes the generic core by construction. Until then the report counts what of the domain is in
// the copy, so that work stays visible instead of hidden behind a renamed home screen.

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
import { type BuddyConfig, KitError } from './config.js';
import { processorsMarkdown } from './processors.js';
import { REWRITES, rewriteEverywhere } from './rewrite.js';
import { findForeign, readSource } from './source.js';

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
};

/** Text files are rewritten and scanned; binaries are copied as they are. */
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
  };
  const copied: string[] = [];
  for (const file of opts.files) {
    if (!isCopied(file)) {
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
