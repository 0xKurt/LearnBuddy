// What ties the source repository to ITS infrastructure (issue #107: "keine geteilte Infra",
// "no buddy should know anything about other buddies"). Read from the source's own files —
// app.json, eas.json, the health workflow, the local Supabase config, the git remote — never
// written down here, so a new Expo project, Supabase project or API host of the source is
// caught by the next run without anyone updating a list.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { KitError } from './config.js';
import { isObject, type Json, type JsonObject } from './local.js';

/** One identifier that belongs to the source's infrastructure. */
export type Foreign = {
  text: string;
  what: string;
  /** Instead of a plain substring: a provenance link (github.com/<slug>/issues/…) is no tie. */
  match?: RegExp;
  /** Only these files may not carry it (the repository slug is fine as a provenance link). */
  only?: RegExp;
};

export type SourceIdentity = {
  /** App name as the store shows it, e.g. "LearnBuddy". */
  name: string;
  /** iOS bundle id = Android package, e.g. "com.learnbuddy.app". */
  bundleId: string;
  /** GitHub "owner/name" of the source, when it has an origin. */
  repoSlug: string | null;
  /** The value of `project_id` in infra/supabase/config.toml (local Docker stack). */
  supabaseLocalId: string | null;
  foreign: Foreign[];
};

function readJson(root: string, file: string): JsonObject {
  const value = JSON.parse(readFileSync(join(root, file), 'utf8')) as Json;
  if (!isObject(value)) throw new KitError(`${file} is not a JSON object`);
  return value;
}

const str = (v: Json | undefined): string | null => (typeof v === 'string' && v ? v : null);

/** Files that act (instructions, workflows, hooks, scripts) — where the slug may not appear. */
const ACTING = /^(CLAUDE\.md|package\.json|\.github\/|\.husky\/|\.claude\/|scripts\/|tools\/)/;

/** The env names in eas.json that are no link to a backend (a build flag, not an address). */
export const BUILD_FLAGS = new Set(['EXPO_PUBLIC_INTERNAL_BUILD']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function originSlug(root: string): string | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    // https://github.com/o/r(.git), git@github.com:o/r(.git), and proxies that keep "/o/r" last.
    const m = /[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(\.git)?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch {
    return null;
  }
}

export function readSource(root: string): SourceIdentity {
  const expo = readJson(root, 'apps/mobile/app.json').expo;
  if (!isObject(expo)) throw new KitError('apps/mobile/app.json has no "expo" object');
  const ios = isObject(expo.ios) ? expo.ios : {};
  const name = str(expo.name);
  const bundleId = str(ios.bundleIdentifier);
  if (!name || !bundleId) throw new KitError('apps/mobile/app.json has no name or bundle id');

  const foreign: Foreign[] = [{ text: bundleId, what: 'Bundle-ID der Quelle' }];
  const owner = str(expo.owner);
  if (owner) foreign.push({ text: `"owner": "${owner}"`, what: 'Expo-Konto der Quelle' });
  const extra = isObject(expo.extra) ? expo.extra : {};
  const projectId = isObject(extra.eas) ? str(extra.eas.projectId) : null;
  if (projectId) foreign.push({ text: projectId, what: 'EAS-Projekt der Quelle' });

  const eas = readJson(root, 'apps/mobile/eas.json');
  const build = isObject(eas.build) ? eas.build : {};
  for (const profile of Object.values(build)) {
    if (!isObject(profile) || !isObject(profile.env)) continue;
    for (const [key, value] of Object.entries(profile.env)) {
      const v = str(value);
      if (!v || !key.startsWith('EXPO_PUBLIC_') || BUILD_FLAGS.has(key)) continue;
      const host = hostOf(v);
      foreign.push({ text: host ?? v, what: `${key} der Quelle (eas.json)` });
      // The project ref alone names the database too (dashboards, psql, decision records).
      const ref = host?.endsWith('.supabase.co') ? host.split('.')[0] : undefined;
      if (ref) foreign.push({ text: ref, what: 'Supabase-Projekt der Quelle' });
    }
  }

  const health = join(root, '.github/workflows/health.yml');
  if (existsSync(health)) {
    const url = /HEALTH_URL:\s*(https:\/\/\S+)/.exec(readFileSync(health, 'utf8'))?.[1];
    const host = url ? hostOf(url) : null;
    if (host) foreign.push({ text: host, what: 'Produktions-API der Quelle (health.yml)' });
  }

  const repoSlug = originSlug(root);
  if (repoSlug)
    foreign.push({
      text: repoSlug,
      what: 'Repository der Quelle',
      only: ACTING,
      match: new RegExp(`(?<!github\\.com/)${escapeRegExp(repoSlug)}`),
    });

  const toml = join(root, 'infra/supabase/config.toml');
  const supabaseLocalId = existsSync(toml)
    ? (/^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(toml, 'utf8'))?.[1] ?? null)
    : null;
  if (supabaseLocalId)
    foreign.push({
      text: `project_id = "${supabaseLocalId}"`,
      what: 'lokaler Supabase-Stack der Quelle (geteilte Docker-Volumes)',
    });

  // The same text twice (preview and production name the same host) is one identifier.
  const seen = new Set<string>();
  return {
    name,
    bundleId,
    repoSlug,
    supabaseLocalId,
    foreign: foreign.filter((f) => !seen.has(f.text) && seen.add(f.text)),
  };
}

/** Every place in `files` (relative to `root`) that still names the source's infrastructure. */
export function findForeign(
  root: string,
  files: readonly string[],
  foreign: readonly Foreign[],
): Array<{ file: string; line: number; what: string }> {
  const out: Array<{ file: string; line: number; what: string }> = [];
  for (const file of files) {
    const lines = readFileSync(join(root, file), 'utf8').split('\n');
    for (const f of foreign) {
      if (f.only && !f.only.test(file)) continue;
      lines.forEach((l, i) => {
        if (f.match ? f.match.test(l) : l.includes(f.text))
          out.push({ file, line: i + 1, what: f.what });
      });
    }
  }
  return out;
}
