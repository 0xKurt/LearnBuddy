// provision describes this repository's setup — and stays true to it (issue #107: the kit rotted
// once while the app moved on). Each check reads the file the setup really lives in.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { easEnv } from '../local.js';
import { inventory, migrationNeeds } from '../inventory.js';
import { API_ROLE, manualSteps, vercelEnv } from '../steps.js';
import { config, LEGAL, REPO } from './helpers.js';

const read = (file: string) => readFileSync(join(REPO, file), 'utf8');

/** The keys of the API's Config schema, and which of them have neither a default nor optional. */
function apiConfigKeys(): { all: string[]; required: string[] } {
  const text = read('apps/api/src/config.ts');
  const body = text.slice(text.indexOf('const Config = z'), text.indexOf('.superRefine('));
  const entries = [
    ...body.matchAll(/^ {4}([A-Z][A-Z0-9_]+): ([\s\S]*?)(?=^ {4}[A-Z][A-Z0-9_]+: |^ {2}\})/gm),
  ];
  return {
    all: entries.map((m) => m[1]!),
    required: entries.filter((m) => !/\.optional\(\)|\.default\(/.test(m[2]!)).map((m) => m[1]!),
  };
}

describe('provision matches this repository', () => {
  it('sets exactly variables the API reads, and every one it requires', () => {
    const keys = apiConfigKeys();
    expect(keys.all.length).toBeGreaterThan(10);
    const names = vercelEnv(config({ capabilities: ['voice', 'push'] }), {}).map(([n]) => n);
    for (const n of names) expect(keys.all, `${n} liest die API nicht`).toContain(n);
    // Required in the schema, and the ones the schema requires in production or with Vertex.
    for (const n of [...keys.required, 'TICK_SECRET', 'GOOGLE_CLOUD_PROJECT'])
      expect(names, `${n} fehlt in provision`).toContain(n);
  });

  it('gives each build what the app refuses to start without (apps/mobile/lib/env.ts)', () => {
    const env = read('apps/mobile/lib/env.ts');
    const named = [...env.matchAll(/\['(EXPO_PUBLIC_[A-Z_]+)',/g)].map((m) => m[1]!);
    expect(named).toEqual(
      expect.arrayContaining(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_PRIVACY_URL']),
    );
    const given = easEnv(config({ legal: LEGAL }), {
      apiUrl: 'https://api.example.com',
      supabaseProjectRef: 'abcdefghijklmnopqrst',
      supabasePublishableKey: 'sb_publishable_x',
    });
    for (const n of named) expect(Object.keys(given ?? {}), n).toContain(n);
    for (const n of Object.keys(given ?? {}))
      expect(env, `${n} liest die App nicht`).toContain(`process.env.${n}`);
  });

  it('names the migrations, the cron job, the Vault secrets and the role this repository has', () => {
    const m = migrationNeeds(REPO);
    expect(m.files.length).toBeGreaterThan(0);
    expect(m.cronJobs.length).toBeGreaterThan(0);
    const steps = JSON.stringify(manualSteps(config(), {}));
    for (const job of m.cronJobs) expect(steps).toContain(job);
    for (const secret of m.vaultSecrets) expect(steps).toContain(`'${secret}'`);
    const role = 'infra/supabase/templates/api-role.sql';
    expect(existsSync(join(REPO, role))).toBe(true);
    expect(steps).toContain(`api_role=${API_ROLE}`);
    // The Supabase CLI finds <workdir>/supabase/config.toml.
    expect(existsSync(join(REPO, 'infra/supabase/config.toml'))).toBe(true);
    expect(steps).toContain('supabase --workdir infra db push');
  });

  it('takes the API region from apps/api/vercel.json', () => {
    const regions = (JSON.parse(read('apps/api/vercel.json')) as { regions: string[] }).regions;
    expect(regions).toEqual([config().policy.vercelRegion]);
    const vercel = inventory(REPO, config(), {}).find((r) => r.area === 'Vercel')!;
    expect(vercel.items[0]).toContain(`Region ${regions.join(', ')}`);
  });
});
