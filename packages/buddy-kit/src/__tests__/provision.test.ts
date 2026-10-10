// requires live verification in Claude Code session (checkHealth runs against a stubbed fetch;
// the real /v1/health of a provisioned app was never available here)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { inventory, migrationNeeds, renderInventory } from '../inventory.js';
import { checkHealth, provision, renderResult } from '../provision.js';
import { parseAssignment, readSecrets, readState, SECRET_NAMES, secretsPath } from '../state.js';
import { appTree, config, LEGAL } from './helpers.js';

const NOW = () => new Date('2026-10-02T10:00:00Z');

let root: string;
beforeEach(() => {
  root = appTree('prov');
});

const run = (over: Partial<Parameters<typeof provision>[0]> = {}) =>
  provision({ root, config: config(), env: 'development', write: true, now: NOW, ...over });

const IDS = [
  'expoOwner=zerox',
  'expoProjectId=0b6f0a52-5b1e-4f1e-9a63-3c3f4f0e2a11',
  'supabaseProjectRef=abcdefghijklmnopqrst',
  'supabasePublishableKey=sb_publishable_abc123',
  'apiUrl=https://fitbuddy-api.example.com',
];

describe('provision', () => {
  it('--dry-run shows the steps and writes nothing', () => {
    const before = readFileSync(join(root, 'apps/mobile/eas.json'), 'utf8');
    const r = run({ write: false, set: IDS.map(parseAssignment) });
    expect(existsSync(join(root, '.buddy'))).toBe(false);
    expect(existsSync(join(root, 'docs/legal'))).toBe(false);
    expect(readFileSync(join(root, 'apps/mobile/eas.json'), 'utf8')).toBe(before);
    expect(r.local.find((s) => s.id === 'secrets')?.changed).toBe(true);
    expect(r.local.find((s) => s.id === 'eas-env')?.changed).toBe(true);
    expect(renderResult(r, { write: false })).toContain('→ würde ändern');
    const fresh = renderResult(run({ write: false }), { write: false });
    expect(fresh).toContain('[Supabase] Projekt in Frankfurt anlegen');
    expect(fresh).toContain('--region eu-central-1');
    expect(fresh).toContain('supabase --workdir infra db push');
  });

  it('--dry-run names what would exist, read from this repository', () => {
    const m = migrationNeeds(root);
    expect(m.files[0]).toBe('0001_baseline.sql');
    expect(m.cronJobs).toContain('lb-tick');
    expect(m.vaultSecrets).toEqual(['lb_api_url', 'lb_tick_secret']);
    const text = renderInventory(inventory(root, config(), {}));
    expect(text).toContain(`${m.files.length} Migrationen`);
    expect(text).toContain('Projekt "fitbuddy-api": Root apps/api, Framework none, Region fra1');
    expect(text).toMatch(/Env, nur „Production": DATABASE_URL, .*TICK_SECRET/);
    expect(text).toContain('texttospeech.googleapis.com');
    expect(text).not.toContain('Firebase');
    expect(renderInventory(inventory(root, config({ capabilities: ['push'] }), {}))).toContain(
      'Firebase-Projekt, Android-App com.example.fitbuddy (FCM)',
    );
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
    run({ set: IDS.map(parseAssignment) });
    const files = [
      secretsPath(root),
      join(root, '.buddy/state.json'),
      join(root, 'apps/mobile/eas.json'),
      join(root, '.github/workflows/health.yml'),
      join(root, 'docs/legal/processors.md'),
    ];
    const before = files.map((f) => [readFileSync(f, 'utf8'), statSync(f).mtimeMs]);
    const again = run();
    expect(again.local.every((s) => !s.changed)).toBe(true);
    expect(again.secretsWritten).toEqual([]);
    expect(files.map((f) => [readFileSync(f, 'utf8'), statSync(f).mtimeMs])).toEqual(before);
  });

  it('gives two apps different secrets', () => {
    run();
    const other = appTree('prov2');
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

  it('writes recorded ids into app.json, eas.json and the health workflow; a manual step only counts as recorded', () => {
    const r = run({ set: IDS.map(parseAssignment), config: config({ legal: LEGAL }) });
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
        // A store build refuses to start without them (apps/mobile/lib/env.ts, issue #130).
        EXPO_PUBLIC_PRIVACY_URL: LEGAL.privacyUrl,
        EXPO_PUBLIC_IMPRINT_URL: LEGAL.imprintUrl,
      });
    expect(readFileSync(join(root, '.github/workflows/health.yml'), 'utf8')).toMatch(
      /^\s*HEALTH_URL: https:\/\/fitbuddy-api\.example\.com\/v1\/health$/m,
    );
    expect(readState(root).ids.supabaseProjectRef).toBe('abcdefghijklmnopqrst');
    const supabase = r.manual.find((m) => m.id === 'supabase-project');
    expect(supabase?.recorded).toBe(true);
    expect(renderResult(r, { write: true })).toContain('● aufgezeichnet (deine Angabe)');
    // A step without an id to record is never shown as done.
    expect(r.manual.find((m) => m.id === 'supabase-migrations')?.recorded).toBe(false);
  });

  it('says that a store build without legal URLs would not start', () => {
    const r = run({ set: IDS.map(parseAssignment) });
    expect(r.local.find((s) => s.id === 'eas-env')?.note).toContain(
      'production startet ohne EXPO_PUBLIC_PRIVACY_URL, EXPO_PUBLIC_IMPRINT_URL nicht',
    );
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
    expect(() => run({ env: 'production', config: config({ legal: LEGAL }) })).not.toThrow();
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
