// `provision --dry-run`: exactly what this app's infrastructure consists of, read from this
// repository — the migration set, the cron job and Vault secrets it needs, the API's region
// and variables, the build profiles. Nothing is created and nothing is called (issue #107 §3).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type BuddyConfig, KitError } from './config.js';
import { easEnv } from './local.js';
import { SECRET_NAMES, STATE_DIR, type RecordedIds } from './state.js';
import { API_ROLE, vercelEnv, vercelProject } from './steps.js';

export type Resource = { area: string; items: string[] };

const MIGRATIONS = 'infra/supabase/migrations';

/** What the migrations need from outside: the pg_cron jobs and the Vault secrets they read. */
export function migrationNeeds(root: string): {
  files: string[];
  cronJobs: string[];
  vaultSecrets: string[];
} {
  const dir = join(root, MIGRATIONS);
  if (!existsSync(dir)) throw new KitError(`${MIGRATIONS} is missing`);
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();
  const sql = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const all = (re: RegExp) => [...new Set([...sql.matchAll(re)].map((m) => m[1]!))].sort();
  return {
    files,
    cronJobs: all(/cron\.schedule\(\s*'([^']+)'/g),
    vaultSecrets: all(/decrypted_secrets\s+where\s+name\s*=\s*'([^']+)'/g),
  };
}

function vercelRegions(root: string): string[] {
  const file = join(root, 'apps/api/vercel.json');
  if (!existsSync(file)) return [];
  const json = JSON.parse(readFileSync(file, 'utf8')) as { regions?: unknown };
  return Array.isArray(json.regions) ? json.regions.map(String) : [];
}

export function inventory(root: string, config: BuddyConfig, ids: RecordedIds): Resource[] {
  const { id, name, bundleId, scheme } = config.identity;
  const caps = config.wiring.capabilities;
  const m = migrationNeeds(root);
  const regions = vercelRegions(root);
  const eas = easEnv(config, ids);
  const easNames = eas
    ? Object.keys(eas)
    : [
        'EXPO_PUBLIC_API_URL',
        'EXPO_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        'EXPO_PUBLIC_PRIVACY_URL',
        'EXPO_PUBLIC_IMPRINT_URL',
        'EXPO_PUBLIC_SUPPORT_EMAIL',
      ];
  return [
    {
      area: 'Supabase',
      items: [
        `Projekt "${id}" in ${config.policy.supabaseRegion}`,
        `${m.files.length} Migrationen aus ${MIGRATIONS}: ${m.files[0]} … ${m.files.at(-1)}`,
        `pg_cron: ${m.cronJobs.join(', ') || '—'} (aus den Migrationen)`,
        `Vault-Secrets: ${m.vaultSecrets.join(', ') || '—'}`,
        `Datenbankrolle ${API_ROLE} (infra/supabase/templates/api-role.sql)`,
        `Auth: Redirect ${scheme}://**, Site-URL, eigenes SMTP`,
      ],
    },
    {
      area: 'Vercel',
      items: [
        `Projekt "${vercelProject(config)}": Root apps/api, Framework none, Region ${regions.join(', ') || '—'} (apps/api/vercel.json), Deployment Protection an`,
        `Env, nur „Production": ${vercelEnv(config, ids)
          .map(([n]) => n)
          .join(', ')}`,
      ],
    },
    {
      area: 'Expo / EAS',
      items: [
        `Projekt "${id}" (${name}), iOS/Android ${bundleId}, Scheme ${scheme}://`,
        'Android-Keystore (von EAS erzeugt)',
        `eas.json preview + production: ${easNames.join(', ')}`,
      ],
    },
    {
      area: 'Google Cloud',
      items: [
        `Projekt mit aiplatform.googleapis.com${caps.includes('voice') ? ', texttospeech.googleapis.com (EU-Endpunkt)' : ''}, Vertex ${config.policy.vertexLocation}`,
        'Service Account (nur für Vercel), Budget-Alarm',
        ...(caps.includes('push') ? [`Firebase-Projekt, Android-App ${bundleId} (FCM)`] : []),
      ],
    },
    {
      area: 'GitHub',
      items: [
        `Repository ${config.identity.repo ?? `<owner>/${id}`}; Health-Workflow auf ${ids.apiUrl ? `${ids.apiUrl}/v1/health` : '<apiUrl>/v1/health'}`,
      ],
    },
    {
      area: 'Lokal (dieses Projekt)',
      items: [
        `${STATE_DIR}/secrets.env (0600): ${SECRET_NAMES.join(', ')} — Werte werden nie ausgegeben`,
        `${STATE_DIR}/state.json: nur Ids`,
        'apps/mobile/app.json (owner, projectId, updates.url), apps/mobile/eas.json, .github/workflows/health.yml, docs/legal/processors.md',
      ],
    },
  ];
}

export function renderInventory(resources: Resource[]): string {
  const lines = ['Würde anlegen (--dry-run: nichts angelegt, nichts aufgerufen):'];
  for (const r of resources) {
    lines.push(`  ${r.area}`);
    for (const i of r.items) lines.push(`    - ${i}`);
  }
  return lines.join('\n');
}
