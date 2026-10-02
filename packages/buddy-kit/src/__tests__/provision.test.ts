// requires live verification in Claude Code session (checkHealth runs against a stubbed fetch;
// the real /v1/health of a provisioned app was never available here)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { createBuddy } from '../create.js';
import { checkHealth, provision, renderResult } from '../provision.js';
import { parseAssignment, readSecrets, readState, SECRET_NAMES, secretsPath } from '../state.js';
import { config, REPO, repoFiles, tmp } from './helpers.js';

const NOW = () => new Date('2026-10-02T10:00:00Z');
const FILES = repoFiles().filter(
  (f) => f.startsWith('apps/mobile/') && /\.(json|ts)$/.test(f) && !f.includes('/__tests__/'),
);
const legal = {
  controller: 'Zero X Ventures',
  controllerAddress: 'Musterstraße 1, 10115 Berlin',
  privacyUrl: 'https://example.com/privacy',
  imprintUrl: 'https://example.com/imprint',
  supportEmail: 'support@example.com',
};

let root: string;
beforeEach(() => {
  root = join(tmp('prov'), 'app');
  createBuddy({ sourceRoot: REPO, targetRoot: root, files: FILES, config: config() });
});

const run = (over: Partial<Parameters<typeof provision>[0]> = {}) =>
  provision({ root, config: config(), env: 'development', write: true, now: NOW, ...over });

describe('provision', () => {
  it('--plan shows the steps and writes nothing', () => {
    const r = run({ write: false });
    expect(existsSync(join(root, '.buddy'))).toBe(false);
    expect(r.local.find((s) => s.id === 'secrets')?.changed).toBe(true);
    const text = renderResult(r, { write: false });
    expect(text).toContain('→ würde ändern');
    expect(text).toContain('[Supabase] Projekt in Frankfurt anlegen');
    expect(text).toContain('--region eu-central-1');
  });

  it('generates the secrets once, 0600, and never shows them', () => {
    const r = run();
    const secrets = readSecrets(root);
    expect(Object.keys(secrets).sort()).toEqual([...SECRET_NAMES].sort());
    expect(statSync(secretsPath(root)).mode & 0o777).toBe(0o600);
    const shown =
      renderResult(r, { write: true }) + readFileSync(join(root, '.buddy/state.json'), 'utf8');
    for (const value of Object.values(secrets)) {
      expect(value.length).toBeGreaterThanOrEqual(40);
      expect(shown).not.toContain(value);
    }
  });

  it('is idempotent: a second run changes no file', () => {
    run();
    const before = {
      secrets: readFileSync(secretsPath(root), 'utf8'),
      state: readFileSync(join(root, '.buddy/state.json'), 'utf8'),
      stateMtime: statSync(join(root, '.buddy/state.json')).mtimeMs,
    };
    const again = run();
    expect(again.local.every((s) => !s.changed)).toBe(true);
    expect(again.secretsWritten).toEqual([]);
    expect(readFileSync(secretsPath(root), 'utf8')).toBe(before.secrets);
    expect(readFileSync(join(root, '.buddy/state.json'), 'utf8')).toBe(before.state);
    expect(statSync(join(root, '.buddy/state.json')).mtimeMs).toBe(before.stateMtime);
  });

  it('gives two apps different secrets', () => {
    run();
    const other = join(tmp('prov2'), 'app');
    createBuddy({ sourceRoot: REPO, targetRoot: other, files: FILES, config: config() });
    provision({ root: other, config: config(), env: 'development', write: true, now: NOW });
    expect(readSecrets(other).TICK_SECRET).not.toBe(readSecrets(root).TICK_SECRET);
  });

  it('rotates exactly the named secret and says where it must go, not what it is', () => {
    run();
    const before = readSecrets(root);
    const r = run({ rotate: ['TICK_SECRET'] });
    const after = readSecrets(root);
    expect(after.TICK_SECRET).not.toBe(before.TICK_SECRET);
    expect(after.ADMIN_TOKEN_SECRET).toBe(before.ADMIN_TOKEN_SECRET);
    const text = renderResult(r, { write: true });
    expect(text).toContain(
      'TICK_SECRET: neuer Wert muss nach Vercel env TICK_SECRET und Supabase Vault',
    );
    expect(text).not.toContain(after.TICK_SECRET!);
    expect(() => run({ rotate: ['DATABASE_URL' as never] })).toThrow(/unknown secret/);
  });

  it('writes recorded ids into app.json and eas.json, and a manual step only counts as recorded', () => {
    const ids = [
      'expoOwner=zerox',
      'expoProjectId=0b6f0a52-5b1e-4f1e-9a63-3c3f4f0e2a11',
      'supabaseProjectRef=abcdefghijklmnopqrst',
      'supabasePublishableKey=sb_publishable_abc123',
      'apiUrl=https://fitbuddy-api.example.com',
    ].map(parseAssignment);
    const r = run({ set: ids });
    const expo = (
      JSON.parse(readFileSync(join(root, 'apps/mobile/app.json'), 'utf8')) as {
        expo: Record<string, unknown>;
      }
    ).expo;
    expect(expo.owner).toBe('zerox');
    expect(expo.updates).toMatchObject({
      url: 'https://u.expo.dev/0b6f0a52-5b1e-4f1e-9a63-3c3f4f0e2a11',
    });
    const eas = JSON.parse(readFileSync(join(root, 'apps/mobile/eas.json'), 'utf8')) as {
      build: Record<string, { env: Record<string, string> }>;
    };
    for (const profile of ['preview', 'production'])
      expect(eas.build[profile]!.env).toMatchObject({
        EXPO_PUBLIC_API_URL: 'https://fitbuddy-api.example.com',
        EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      });
    expect(readState(root).ids.supabaseProjectRef).toBe('abcdefghijklmnopqrst');
    const supabase = r.manual.find((m) => m.id === 'supabase-project');
    expect(supabase?.recorded).toBe(true);
    expect(renderResult(r, { write: true })).toContain('● aufgezeichnet (deine Angabe)');
    // A step without an id to record is never shown as done.
    expect(r.manual.find((m) => m.id === 'supabase-migrations')?.recorded).toBe(false);
  });

  it('refuses unknown ids, malformed values and non-EU pooler hosts, without echoing the value', () => {
    expect(() => parseAssignment('dbPassword=hunter2')).toThrow(/unknown id/);
    expect(() => parseAssignment('supabasePoolerHost=aws-0-us-east-1.pooler.supabase.com')).toThrow(
      /eu-central-1/,
    );
    let message = '';
    try {
      parseAssignment('supabaseProjectRef=sb_secret_THISISASECRET');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('value not shown');
    expect(message).not.toContain('THISISASECRET');
  });

  it('refuses production without the legal details and changes nothing', () => {
    expect(() => run({ env: 'production' })).toThrow(/legal\.controller.*Nothing was changed/);
    expect(existsSync(join(root, '.buddy'))).toBe(false);
    const withLegal = config({ legal });
    expect(() => run({ env: 'production', config: withLegal })).not.toThrow();
  });
});

describe('checkHealth', () => {
  it('reports what /v1/health answered, and an unreachable API as not ok', async () => {
    const ok = await checkHealth('https://api.example.com', async (url) => {
      expect(String(url)).toBe('https://api.example.com/v1/health');
      return new Response(JSON.stringify({ ok: true, database: true, scheduler: { ok: true } }));
    });
    expect(ok).toEqual({
      ok: true,
      line: '/v1/health → 200: ok=true database=true scheduler=true',
    });
    const down = await checkHealth(
      'https://api.example.com',
      async () =>
        new Response(JSON.stringify({ ok: false, database: true, scheduler: { ok: false } }), {
          status: 503,
        }),
    );
    expect(down.ok).toBe(false);
    const gone = await checkHealth('https://api.example.com', async () => {
      throw new TypeError('fetch failed');
    });
    expect(gone).toEqual({ ok: false, line: '/v1/health nicht erreichbar: TypeError' });
  });
});
