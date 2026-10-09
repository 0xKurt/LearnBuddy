// create-buddy: a new, independent project from this repository (issue #107 §2, "Weg b").
//
// What it does, and only this:
// - copies the tracked files (never .git, never LearnBuddy's own secrets or store identity,
//   never history like docs/legacy or reports);
// - gives the copy its own identity: app name, slug, scheme, bundle id/package, share
//   extension names — and removes LearnBuddy's Expo project, update URL and the preview
//   build's API/Supabase URLs, so the new app can never talk to LearnBuddy's backend;
// - writes buddy.config.json, docs/legal/processors.md and BUDDY-SETUP.md (the checklist).
//
// What it deliberately does NOT do: take the learning domain out. That is the extraction in
// #107 §6 (8–12 PRs by the issue's own estimate) and the owner parked it (29.09.: "LearnBuddy
// kopieren, die Lern-Teile entfernen … von Hand"). The report counts every remaining
// "LearnBuddy" so that work is visible instead of hidden behind a renamed home screen.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { type BuddyConfig, KitError } from './config.js';
import { checklistMarkdown } from './checklist.js';
import { processorsMarkdown } from './processors.js';

/** Never copied: history, research, and LearnBuddy's own credentials and store identity. */
const EXCLUDED_PREFIXES = [
  '.git/',
  'docs/legacy/',
  'reports/',
  'research_notes/',
  'design-examples/',
  // `.buddy/` is a project's own local state and secrets (provision) — never another app's.
  '.buddy/',
];
const EXCLUDED_FILES = new Set([
  // LearnBuddy's Firebase Android app: the new Buddy registers its own (issue #107 §3).
  'apps/mobile/google-services.json',
  'apps/mobile/GoogleService-Info.plist',
]);
const EXCLUDED_PATTERN = /\.(jks|keystore|p8|p12|key|mobileprovision)$|(^|\/)\.env(\.|$)/;

export function isCopied(path: string): boolean {
  if (EXCLUDED_FILES.has(path)) return false;
  if (EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return false;
  if (EXCLUDED_PATTERN.test(path) && !path.endsWith('.env.example')) return false;
  return true;
}

export type CreateReport = {
  copied: number;
  skipped: string[];
  rewritten: string[];
  /** Files that still say "LearnBuddy" (the domain extraction that is left), most first. */
  leftovers: Array<{ file: string; count: number }>;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pascal(id: string): string {
  return id
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/** apps/mobile/app.json with the new identity and none of LearnBuddy's project links. */
function rewriteAppJson(text: string, config: BuddyConfig): string {
  const root = JSON.parse(text) as JsonObject;
  const expo = root.expo;
  if (!isObject(expo)) throw new KitError('apps/mobile/app.json has no "expo" object');
  const { id, name, bundleId, scheme } = config.identity;
  expo.name = name;
  expo.slug = id;
  expo.scheme = scheme;
  // Owner, update URL and EAS project belong to LearnBuddy's Expo account; `provision`
  // writes the new ones once the project exists (pnpm provision --set expoProjectId=…).
  delete expo.owner;
  delete expo.updates;
  if (isObject(expo.extra)) {
    delete expo.extra.eas;
    if (Object.keys(expo.extra).length === 0) delete expo.extra;
  }
  if (isObject(expo.ios)) expo.ios.bundleIdentifier = bundleId;
  if (isObject(expo.android)) {
    expo.android.package = bundleId;
    // google-services.json is LearnBuddy's Firebase app and is not copied.
    delete expo.android.googleServicesFile;
  }
  // Share extension names inside plugin options ("LearnBuddy Share", "LearnBuddyShare").
  const rename = (v: Json): Json => {
    if (typeof v === 'string') {
      if (v === 'LearnBuddy') return name;
      if (v === 'LearnBuddy Share') return `${name} Share`;
      if (v === 'LearnBuddyShare') return `${pascal(id)}Share`;
      return v;
    }
    if (Array.isArray(v)) return v.map(rename);
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)]));
    return v;
  };
  if (Array.isArray(expo.plugins)) expo.plugins = expo.plugins.map(rename);
  return `${JSON.stringify(root, null, 2)}\n`;
}

/** apps/mobile/app.config.ts: the dev variant's name and id. */
function rewriteAppConfig(text: string, config: BuddyConfig): string {
  return text
    .replaceAll("'LearnBuddy Dev'", `'${config.identity.name.replaceAll("'", "\\'")} Dev'`)
    .replaceAll('com.learnbuddy.app.dev', `${config.identity.bundleId}.dev`);
}

/**
 * apps/mobile/eas.json without LearnBuddy's API and Supabase URLs: a preview build of the new
 * app must never reach LearnBuddy's backend. `provision` fills them from the new projects.
 */
function rewriteEasJson(text: string): string {
  const root = JSON.parse(text) as JsonObject;
  const build = root.build;
  if (isObject(build)) {
    for (const profile of Object.values(build)) {
      if (!isObject(profile) || !isObject(profile.env)) continue;
      for (const key of Object.keys(profile.env)) {
        if (key.startsWith('EXPO_PUBLIC_')) delete profile.env[key];
      }
    }
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

function ensureGitignored(text: string): string {
  if (/^\.buddy\/$/m.test(text)) return text;
  const sep = text.endsWith('\n') || text === '' ? '' : '\n';
  return `${text}${sep}\n# create-buddy / provision: local ids and secrets of this app (never committed)\n.buddy/\n`;
}

const REWRITES: Record<string, (text: string, config: BuddyConfig) => string> = {
  'apps/mobile/app.json': rewriteAppJson,
  'apps/mobile/app.config.ts': rewriteAppConfig,
  'apps/mobile/eas.json': (text) => rewriteEasJson(text),
  '.gitignore': (text) => ensureGitignored(text),
};

/** Text files are scanned for leftovers; binaries are not. */
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|sql|ya?ml|sh|txt|html|css)$/;

export function createBuddy(opts: {
  sourceRoot: string;
  targetRoot: string;
  /** The files to consider, relative to sourceRoot (the CLI passes `git ls-files`). */
  files: string[];
  config: BuddyConfig;
}): CreateReport {
  const source = resolve(opts.sourceRoot);
  const target = resolve(opts.targetRoot);
  const rel = relative(source, target);
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/')))
    throw new KitError(`the target ${target} lies inside the source ${source}`);
  if (existsSync(target) && readdirSync(target).length > 0)
    throw new KitError(`the target ${target} exists and is not empty — nothing was written`);

  const report: CreateReport = { copied: 0, skipped: [], rewritten: [], leftovers: [] };
  for (const file of opts.files) {
    if (!isCopied(file)) {
      report.skipped.push(file);
      continue;
    }
    const from = join(source, file);
    if (!existsSync(from)) continue; // deleted in the working tree but still tracked
    const to = join(target, file);
    mkdirSync(dirname(to), { recursive: true });
    const rewrite = REWRITES[file];
    if (rewrite) {
      writeFileSync(to, rewrite(readFileSync(from, 'utf8'), opts.config));
      report.rewritten.push(file);
    } else {
      writeFileSync(to, readFileSync(from));
    }
    report.copied++;
  }
  if (!report.rewritten.includes('.gitignore')) {
    writeFileSync(join(target, '.gitignore'), ensureGitignored(''));
    report.rewritten.push('.gitignore');
  }

  writeFileSync(join(target, 'buddy.config.json'), `${JSON.stringify(opts.config, null, 2)}\n`);
  mkdirSync(join(target, 'docs/legal'), { recursive: true });
  writeFileSync(join(target, 'docs/legal/processors.md'), processorsMarkdown(opts.config));

  for (const file of opts.files) {
    if (!isCopied(file) || !TEXT.test(file) || !existsSync(join(target, file))) continue;
    const count = (readFileSync(join(target, file), 'utf8').match(/learn ?buddy/gi) ?? []).length;
    if (count > 0) report.leftovers.push({ file, count });
  }
  report.leftovers.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  writeFileSync(join(target, 'BUDDY-SETUP.md'), checklistMarkdown(opts.config, report));
  return report;
}
