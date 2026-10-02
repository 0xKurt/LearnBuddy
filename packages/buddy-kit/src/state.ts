// .buddy/ — this app's local provisioning state (issue #107 §3, "Status-Datei nur mit IDs").
//
// Two files, both gitignored:
// - state.json: ids of the cloud projects as the owner recorded them (`--set key=value`) and
//   which local steps ran. Never a secret: every key is validated, and a value that looks like
//   a secret is refused.
// - secrets.env: generated per app (crypto.randomBytes), mode 0600, never printed or logged.

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { KitError } from './config.js';

export const STATE_DIR = '.buddy';

/** Ids the owner records after creating a project by hand. Formats checked, nothing guessed. */
export const RecordedIds = z
  .object({
    supabaseProjectRef: z.string().regex(/^[a-z]{20}$/, '20 lower-case letters'),
    supabasePublishableKey: z
      .string()
      .regex(/^sb_publishable_[A-Za-z0-9_-]+$/, 'a publishable key (sb_publishable_…)'),
    /**
     * The session pooler host from the dashboard (Connect → Session pooler) — read, never
     * guessed: LearnBuddy's was aws-0, the guess aws-1 failed with "tenant not found" (#107).
     * Frankfurt only.
     */
    supabasePoolerHost: z
      .string()
      .regex(/^aws-[0-9]+-eu-central-1\.pooler\.supabase\.com$/, 'aws-N-eu-central-1 pooler host'),
    apiUrl: z
      .string()
      .url()
      .regex(/^https:\/\/[^/]+$/, 'https://host, without a path'),
    vercelProjectId: z.string().regex(/^prj_[A-Za-z0-9]+$/, 'prj_…'),
    expoOwner: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, 'an Expo account or organisation'),
    expoProjectId: z.string().uuid(),
    gcpProjectId: z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Google Cloud project id'),
    firebaseProjectId: z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'a Firebase project id'),
  })
  .partial()
  .strict();
export type RecordedIds = z.infer<typeof RecordedIds>;
export type IdKey = keyof RecordedIds;

export const State = z
  .object({
    version: z.literal(1),
    ids: RecordedIds,
    /** Local steps that completed, with when (ISO). */
    done: z.record(z.string(), z.string()),
  })
  .strict();
export type State = z.infer<typeof State>;

export function readState(root: string): State {
  const path = join(root, STATE_DIR, 'state.json');
  if (!existsSync(path)) return { version: 1, ids: {}, done: {} };
  const parsed = State.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new KitError(`${path} is not valid: ${parsed.error.message}`);
  return parsed.data;
}

export function writeState(root: string, state: State): void {
  ensureDir(root);
  writeFileSync(
    join(root, STATE_DIR, 'state.json'),
    `${JSON.stringify(State.parse(state), null, 2)}\n`,
  );
}

/** Parses `key=value` for `--set`, validated against RecordedIds. */
export function parseAssignment(arg: string): { key: IdKey; value: string } {
  const eq = arg.indexOf('=');
  if (eq <= 0) throw new KitError(`--set expects key=value, got "${arg}"`);
  const key = arg.slice(0, eq);
  const value = arg.slice(eq + 1).trim();
  const shape = RecordedIds.shape;
  if (!(key in shape))
    throw new KitError(`unknown id "${key}" — known: ${Object.keys(shape).join(', ')}`);
  const check = shape[key as IdKey].safeParse(value);
  // The value is not echoed: if someone pasted a secret into the wrong key, it stays off
  // the terminal and out of logs.
  if (!check.success)
    throw new KitError(`${key}: ${check.error.issues[0]?.message ?? 'invalid'} (value not shown)`);
  return { key: key as IdKey, value };
}

// ─────────────── secrets ───────────────

/** Generated per app; never the same in two apps, never printed. */
export const SECRET_NAMES = ['ADMIN_TOKEN_SECRET', 'TICK_SECRET', 'LB_API_DB_PASSWORD'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

function ensureDir(root: string): void {
  const dir = join(root, STATE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function secretsPath(root: string): string {
  return join(root, STATE_DIR, 'secrets.env');
}

export function readSecrets(root: string): Partial<Record<SecretName, string>> {
  const path = secretsPath(root);
  if (!existsSync(path)) return {};
  const out: Partial<Record<SecretName, string>> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line);
    if (m && (SECRET_NAMES as readonly string[]).includes(m[1]!)) out[m[1] as SecretName] = m[2]!;
  }
  return out;
}

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Makes sure every secret exists; generates only the missing ones (a second run changes
 * nothing). `rotate` replaces exactly the named ones. Returns the names that were written —
 * names, never values.
 */
export function ensureSecrets(
  root: string,
  opts: { rotate?: readonly SecretName[]; write: boolean },
): SecretName[] {
  const current = readSecrets(root);
  const changed: SecretName[] = [];
  const next: Partial<Record<SecretName, string>> = { ...current };
  for (const name of SECRET_NAMES) {
    if (!current[name] || opts.rotate?.includes(name)) {
      next[name] = newSecret();
      changed.push(name);
    }
  }
  if (changed.length > 0 && opts.write) {
    ensureDir(root);
    const body = SECRET_NAMES.map((n) => `${n}=${next[n]}`).join('\n');
    const path = secretsPath(root);
    writeFileSync(
      path,
      `# Generated by provision. Never commit, never paste into a chat.\n${body}\n`,
      { mode: 0o600 },
    );
    // writeFileSync keeps the mode of an existing file; make sure it is 0600 either way.
    chmodSync(path, 0o600);
  }
  return changed;
}
