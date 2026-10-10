// provision's local steps: what this machine can do and check without a cloud account
// (issue #107 §3). Each writes only when its file would change, so a second run with nothing
// new changes no file (and no mtime). With `write: false` (--dry-run) nothing is written.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type BuddyConfig, KitError } from './config.js';
import { processorsMarkdown } from './processors.js';
import type { RecordedIds } from './state.js';

export type LocalStep = { id: string; title: string; changed: boolean; note?: string };

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Writes `next` only when it differs: an unchanged file keeps its bytes and its mtime. */
function writeIfChanged(path: string, next: string, write: boolean): boolean {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === next) return false;
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
  }
  return true;
}

const HEALTH_URL = /^(\s*HEALTH_URL:)[ \t]*.*$/m;

/** The health workflow probing `url` ('' = no API yet: the probe says so and stays green). */
export function withHealthUrl(text: string, url: string): string {
  if (!HEALTH_URL.test(text)) throw new KitError('health.yml has no HEALTH_URL line');
  return text.replace(HEALTH_URL, `$1 ${url ? url : "''"}`);
}

/** A .gitignore that keeps `.buddy/` (this app's ids and secrets) out of the repository. */
export function withBuddyIgnored(text: string): string {
  if (/^\.buddy\/$/m.test(text)) return text;
  const sep = text.endsWith('\n') || text === '' ? '' : '\n';
  return `${text}${sep}\n# create-buddy / provision: local ids and secrets of this app (never committed)\n.buddy/\n`;
}

export function gitignoreStep(root: string, write: boolean): LocalStep {
  const path = join(root, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return {
    id: 'gitignore',
    title: '.buddy/ ist gitignored',
    changed: writeIfChanged(path, withBuddyIgnored(text), write),
  };
}

export function expoConfigStep(root: string, ids: RecordedIds, write: boolean): LocalStep {
  const title = 'Expo-Projekt in apps/mobile/app.json eintragen (owner, projectId, updates.url)';
  if (!ids.expoOwner || !ids.expoProjectId)
    return {
      id: 'expo-config',
      title,
      changed: false,
      note: 'wartet auf expoOwner, expoProjectId',
    };
  const path = join(root, 'apps/mobile/app.json');
  const file = JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
  const expo = file.expo;
  if (!isObject(expo)) throw new KitError('apps/mobile/app.json has no "expo" object');
  expo.owner = ids.expoOwner;
  const updates = isObject(expo.updates) ? expo.updates : {};
  expo.updates = { ...updates, url: `https://u.expo.dev/${ids.expoProjectId}` };
  const extra = isObject(expo.extra) ? expo.extra : {};
  expo.extra = { ...extra, eas: { projectId: ids.expoProjectId } };
  const changed = writeIfChanged(path, `${JSON.stringify(file, null, 2)}\n`, write);
  return { id: 'expo-config', title, changed };
}

/**
 * What each build profile needs (apps/mobile/lib/env.ts). A release build refuses to start
 * without the three addresses, and a store build also without the privacy and imprint URLs
 * (issue #130); only the internal preview (EXPO_PUBLIC_INTERNAL_BUILD) may go without those.
 * The publishable key is public by design (it ships in the app); it is not a secret.
 */
export function easEnv(config: BuddyConfig, ids: RecordedIds): Record<string, string> | null {
  if (!ids.apiUrl || !ids.supabaseProjectRef || !ids.supabasePublishableKey) return null;
  const backend = {
    EXPO_PUBLIC_API_URL: ids.apiUrl,
    EXPO_PUBLIC_SUPABASE_URL: `https://${ids.supabaseProjectRef}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: ids.supabasePublishableKey,
  };
  const { privacyUrl, imprintUrl, supportEmail } = config.legal;
  const legal: Record<string, string> = {
    ...(privacyUrl ? { EXPO_PUBLIC_PRIVACY_URL: privacyUrl } : {}),
    ...(imprintUrl ? { EXPO_PUBLIC_IMPRINT_URL: imprintUrl } : {}),
    ...(supportEmail ? { EXPO_PUBLIC_SUPPORT_EMAIL: supportEmail } : {}),
  };
  return { ...backend, ...legal };
}

export function easEnvStep(
  root: string,
  config: BuddyConfig,
  ids: RecordedIds,
  write: boolean,
): LocalStep {
  const title = 'Build-Profile in apps/mobile/eas.json auf die eigenen Projekte zeigen lassen';
  const env = easEnv(config, ids);
  if (!env)
    return {
      id: 'eas-env',
      title,
      changed: false,
      note: 'wartet auf apiUrl, supabaseProjectRef, supabasePublishableKey',
    };
  const path = join(root, 'apps/mobile/eas.json');
  const eas = JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
  const build = isObject(eas.build) ? eas.build : {};
  eas.build = build;
  for (const name of ['preview', 'production'] as const) {
    const profile = isObject(build[name]) ? build[name] : {};
    const current = isObject(profile.env) ? profile.env : {};
    build[name] = { ...profile, env: { ...current, ...env } };
  }
  const changed = writeIfChanged(path, `${JSON.stringify(eas, null, 2)}\n`, write);
  const missing = ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_IMPRINT_URL'].filter((k) => !(k in env));
  return {
    id: 'eas-env',
    title,
    changed,
    ...(missing.length > 0
      ? {
          note: `production startet ohne ${missing.join(', ')} nicht (legal.* in buddy.config.json)`,
        }
      : {}),
  };
}

export function healthStep(root: string, ids: RecordedIds, write: boolean): LocalStep {
  const title = 'Health-Workflow (.github/workflows/health.yml) prüft die eigene API';
  const path = join(root, '.github/workflows/health.yml');
  if (!existsSync(path))
    return { id: 'health-url', title, changed: false, note: 'keine health.yml' };
  if (!ids.apiUrl) return { id: 'health-url', title, changed: false, note: 'wartet auf apiUrl' };
  const next = withHealthUrl(readFileSync(path, 'utf8'), `${ids.apiUrl}/v1/health`);
  return { id: 'health-url', title, changed: writeIfChanged(path, next, write) };
}

export function processorsStep(root: string, config: BuddyConfig, write: boolean): LocalStep {
  const path = join(root, 'docs/legal/processors.md');
  return {
    id: 'processors',
    title: 'Auftragsverarbeiter aus den Fähigkeiten (docs/legal/processors.md)',
    changed: writeIfChanged(path, processorsMarkdown(config), write),
  };
}
