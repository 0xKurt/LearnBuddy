// provision: bring up the infrastructure of one Buddy app (issue #107 §3).
//
// Honest split. What this machine can do and verify, it does: generate the app's secrets,
// keep the state file, write the recorded project ids into app.json and eas.json, check
// /v1/health. Everything that needs a cloud account is a MANUAL step with the exact command
// or console path — printed, never executed and never reported as done. A manual step counts
// as "recorded" once its id was entered with --set; that is the owner's statement, and the
// output says so instead of "verified" (CLAUDE.md rule 5).
//
// Idempotent: a second run with nothing new changes no file. --plan writes nothing at all.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type BuddyConfig, KitError, missingForProduction } from './config.js';
import {
  ensureSecrets,
  type IdKey,
  readState,
  type RecordedIds,
  type SecretName,
  SECRET_NAMES,
  STATE_DIR,
  type State,
  writeState,
} from './state.js';

export type ManualStep = {
  id: string;
  area:
    | 'Supabase'
    | 'Vercel'
    | 'Expo'
    | 'Google Cloud'
    | 'Apple'
    | 'Google Play'
    | 'Domain'
    | 'Recht';
  title: string;
  /** Exact commands or console paths. Secrets are referenced by file, never inlined. */
  how: string[];
  /** Recorded once these ids are set (the owner's statement, not a check). */
  recordedBy?: IdKey[];
};

/** The manual steps, in order — with the stumbling blocks of 28.09. written into them. */
export function manualSteps(config: BuddyConfig, ids: RecordedIds): ManualStep[] {
  const { id, scheme } = config.identity;
  const ref = ids.supabaseProjectRef ?? '<project-ref>';
  const api = ids.apiUrl ?? 'https://<api-host>';
  const secrets = `${STATE_DIR}/secrets.env`;
  return [
    {
      id: 'supabase-project',
      area: 'Supabase',
      title: 'Projekt in Frankfurt anlegen',
      how: [
        `supabase projects create ${id} --region ${config.policy.supabaseRegion} --org-id <org>`,
        'Eine andere Region ist nicht zulässig (buddy.config.json erlaubt nur eu-central-1).',
        `danach: pnpm provision --set supabaseProjectRef=<ref> --set supabasePublishableKey=<sb_publishable_…>`,
      ],
      recordedBy: ['supabaseProjectRef', 'supabasePublishableKey'],
    },
    {
      id: 'supabase-pooler',
      area: 'Supabase',
      title: 'Pooler-Host ablesen, nicht raten',
      how: [
        'Dashboard → Connect → Session pooler: den Host abschreiben (aws-0 oder aws-1 — bei LearnBuddy war die Vermutung falsch).',
        'pnpm provision --set supabasePoolerHost=<aws-N-eu-central-1.pooler.supabase.com>',
      ],
      recordedBy: ['supabasePoolerHost'],
    },
    {
      id: 'supabase-migrations',
      area: 'Supabase',
      title: 'Migrationen anwenden (ein Mechanismus)',
      how: [`supabase link --project-ref ${ref}`, 'supabase db push'],
    },
    {
      id: 'supabase-api-role',
      area: 'Supabase',
      title: 'API-Datenbankrolle aus der versionierten Vorlage',
      how: [
        `set -a; . ./${secrets}; set +a`,
        `psql "<admin-connection-string>" -v api_role=lb_api -v api_password="$LB_API_DB_PASSWORD" -f infra/supabase/templates/api-role.sql`,
        'Getestet gegen Postgres 16 (apps/api/src/__tests__/api-role.int.test.ts). Ob Supabase BYPASSRLS an eine eigene Rolle vergibt, ist nicht live geprüft — schlägt der Befehl dort fehl, steht der Ausweg in der Vorlage.',
      ],
    },
    {
      id: 'supabase-vault',
      area: 'Supabase',
      title: 'Vault-Secrets für den minütlichen Tick (pg_cron lb-tick)',
      how: [
        `set -a; . ./${secrets}; set +a`,
        `psql "<admin-connection-string>" -v url="${api}/v1" -v secret="$TICK_SECRET" -c "select vault.create_secret(:'url', 'lb_api_url'); select vault.create_secret(:'secret', 'lb_tick_secret');"`,
      ],
    },
    {
      id: 'supabase-auth',
      area: 'Supabase',
      title: 'Auth-Einstellungen',
      how: [
        `Redirect-URL ${scheme}://** und Site-URL eintragen`,
        'eigenes SMTP (EU-Anbieter); Mail-Vorlagen aus docs/consent-email-templates.md',
        'E-Mail-Bestätigung an; Leaked-Password-Schutz an',
      ],
    },
    {
      id: 'vercel-project',
      area: 'Vercel',
      title:
        'Projekt anlegen: Root apps/api, Framework none, Region fra1, Deployment Protection an',
      how: [
        'vercel link (im Ordner apps/api), Region steht in apps/api/vercel.json (fra1)',
        'Settings → Deployment Protection: an. Die App nutzt die Produktions-Domain, nie den Team-Alias.',
        'pnpm provision --set vercelProjectId=<prj_…> --set apiUrl=<https://…>',
      ],
      recordedBy: ['vercelProjectId', 'apiUrl'],
    },
    {
      id: 'vercel-env',
      area: 'Vercel',
      title: 'Env-Variablen nur für „Production" (nie „Preview")',
      how: [
        `set -a; . ./${secrets}; set +a`,
        ...(['ADMIN_TOKEN_SECRET', 'TICK_SECRET'] as const).map(
          (n) => `printf %s "$${n}" | vercel env add ${n} production`,
        ),
        'DATABASE_URL (Pooler-Host oben, Rolle lb_api, Passwort $LB_API_DB_PASSWORD), DATABASE_CA_CERT, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
        `LLM_BACKEND=vertex, GOOGLE_CLOUD_PROJECT, GOOGLE_VERTEX_LOCATION=${config.policy.vertexLocation}, GOOGLE_APPLICATION_CREDENTIALS_JSON`,
        `SPEECH_BACKEND=${config.wiring.capabilities.includes('voice') ? 'google' : 'disabled'}, PUSH_BACKEND=disabled (an erst nach rechtlicher Prüfung), CONSENT_VERSION, MIN_APP_VERSION`,
      ],
    },
    {
      id: 'expo-project',
      area: 'Expo',
      title: 'EAS-Projekt anlegen',
      how: [
        'eas init (im Ordner apps/mobile)',
        'pnpm provision --set expoOwner=<owner> --set expoProjectId=<uuid> — provision schreibt owner, projectId und updates.url in app.json',
        'eas credentials: Android-Keystore von EAS erzeugen lassen',
        'Metro-Cache pro App; Export immer mit --clear (ein geteilter Cache schleuste am 28.09. fremde EXPO_PUBLIC_*-Werte ein)',
        'npx expo install --check',
      ],
      recordedBy: ['expoOwner', 'expoProjectId'],
    },
    {
      id: 'gcp-project',
      area: 'Google Cloud',
      title: 'Eigenes Projekt: Vertex AI (und TTS) in der EU, Budget-Alarm',
      how: [
        `gcloud projects create <id>; gcloud services enable aiplatform.googleapis.com${config.wiring.capabilities.includes('voice') ? ' texttospeech.googleapis.com' : ''}`,
        'Service Account mit minimalen Rechten (besser Workload Identity); Schlüssel nur in Vercel, nie im Repo',
        'Budget-Alarm anlegen (deckelt nicht, warnt nur)',
        'pnpm provision --set gcpProjectId=<id>',
      ],
      recordedBy: ['gcpProjectId'],
    },
    ...(config.wiring.capabilities.includes('push')
      ? [
          {
            id: 'firebase',
            area: 'Google Cloud' as const,
            title: 'Firebase-Projekt mit Android-App (FCM)',
            how: [
              `Android-App mit Paket ${config.identity.bundleId} anlegen, google-services.json nach apps/mobile/ (nicht von LearnBuddy übernehmen)`,
              'FCM-V1-Schlüssel nur zu Expo hochladen (eas credentials), nie ins Repo',
              'pnpm provision --set firebaseProjectId=<id>',
            ],
            recordedBy: ['firebaseProjectId' as const],
          },
        ]
      : []),
    {
      id: 'apple',
      area: 'Apple',
      title:
        'Team, Bundle-IDs (inkl. Share-Extension, App Group), APNs-Schlüssel, App-Store-Eintrag',
      how: ['Apple Developer als Organisation (D-U-N-S-Nummer nötig)'],
    },
    {
      id: 'play',
      area: 'Google Play',
      title: 'Eintrag, erster Upload, Closed Testing',
      how: ['Google Play Console als Organisation'],
    },
    {
      id: 'domain',
      area: 'Domain',
      title: 'apple-app-site-association und assetlinks.json hosten',
      how: ['nur wenn Universal Links / App Links gebraucht werden'],
    },
    {
      id: 'legal',
      area: 'Recht',
      title: 'Rechtspaket dieser App',
      how: [
        'DPIA oder Screening für den neuen Zweck (Vorlage: docs/dpia.md — für diese App neu schreiben, nicht übernehmen)',
        'Datenschutzerklärung, Impressum, Einwilligungstext mit eigener CONSENT_VERSION, Art.-30-Eintrag',
        'AV-Verträge laut docs/legal/processors.md',
        'Store-Angaben: Data Safety, Privacy Label, Altersfreigabe',
      ],
    },
  ];
}

export type LocalStep = { id: string; title: string; changed: boolean; note?: string };

export type ProvisionResult = {
  local: LocalStep[];
  manual: Array<ManualStep & { recorded: boolean }>;
  /** Secret names generated or rotated in this run (names only). */
  secretsWritten: SecretName[];
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Writes `next` only when it differs: an unchanged file keeps its bytes and its mtime. */
function writeIfChanged(path: string, next: string, write: boolean): boolean {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === next) return false;
  if (write) writeFileSync(path, next);
  return true;
}

function expoConfigStep(root: string, ids: RecordedIds, write: boolean): LocalStep {
  const title = 'Expo-Projekt in apps/mobile/app.json eintragen';
  if (!ids.expoOwner || !ids.expoProjectId)
    return {
      id: 'expo-config',
      title,
      changed: false,
      note: 'wartet auf expoOwner, expoProjectId',
    };
  const path = join(root, 'apps/mobile/app.json');
  const root_ = JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
  const expo = root_.expo;
  if (!isObject(expo)) throw new KitError('apps/mobile/app.json has no "expo" object');
  expo.owner = ids.expoOwner;
  const updates = isObject(expo.updates) ? expo.updates : {};
  expo.updates = { ...updates, url: `https://u.expo.dev/${ids.expoProjectId}` };
  const extra = isObject(expo.extra) ? expo.extra : {};
  expo.extra = { ...extra, eas: { projectId: ids.expoProjectId } };
  const changed = writeIfChanged(path, `${JSON.stringify(root_, null, 2)}\n`, write);
  return { id: 'expo-config', title, changed };
}

function easEnvStep(root: string, ids: RecordedIds, write: boolean): LocalStep {
  const title = 'Build-Profile in apps/mobile/eas.json auf die eigenen Projekte zeigen lassen';
  if (!ids.apiUrl || !ids.supabaseProjectRef || !ids.supabasePublishableKey)
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
  // The publishable key is public by design (it ships in the app); it is not a secret.
  const env = {
    EXPO_PUBLIC_API_URL: ids.apiUrl,
    EXPO_PUBLIC_SUPABASE_URL: `https://${ids.supabaseProjectRef}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: ids.supabasePublishableKey,
  };
  for (const name of ['preview', 'production']) {
    const profile = isObject(build[name]) ? build[name] : {};
    const current = isObject(profile.env) ? profile.env : {};
    build[name] = { ...profile, env: { ...current, ...env } };
  }
  const changed = writeIfChanged(path, `${JSON.stringify(eas, null, 2)}\n`, write);
  return { id: 'eas-env', title, changed };
}

function gitignoreStep(root: string, write: boolean): LocalStep {
  const path = join(root, '.gitignore');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = /^\.buddy\/$/m.test(text)
    ? text
    : `${text}${text.endsWith('\n') || !text ? '' : '\n'}.buddy/\n`;
  return {
    id: 'gitignore',
    title: '.buddy/ ist gitignored',
    changed: writeIfChanged(path, next, write),
  };
}

export function provision(opts: {
  root: string;
  config: BuddyConfig;
  env: 'development' | 'production';
  /** --plan: compute everything, write nothing. */
  write: boolean;
  set?: Array<{ key: IdKey; value: string }>;
  rotate?: readonly SecretName[];
  now: () => Date;
}): ProvisionResult {
  if (opts.env === 'production') {
    const missing = missingForProduction(opts.config);
    if (missing.length > 0)
      throw new KitError(
        `production needs the legal details first (issue #107 §4) — missing in buddy.config.json: ${missing.join(', ')}. Nothing was changed.`,
      );
  }
  for (const r of opts.rotate ?? []) {
    if (!(SECRET_NAMES as readonly string[]).includes(r))
      throw new KitError(`unknown secret "${r}" — known: ${SECRET_NAMES.join(', ')}`);
  }
  const state: State = readState(opts.root);
  const ids: RecordedIds = { ...state.ids };
  for (const { key, value } of opts.set ?? []) ids[key] = value;

  const local: LocalStep[] = [];
  local.push(gitignoreStep(opts.root, opts.write));
  const secretsWritten = ensureSecrets(opts.root, {
    write: opts.write,
    ...(opts.rotate ? { rotate: opts.rotate } : {}),
  });
  local.push({
    id: 'secrets',
    title: `Secrets erzeugen (${STATE_DIR}/secrets.env, 0600)`,
    changed: secretsWritten.length > 0,
    ...(secretsWritten.length > 0 ? { note: `neu: ${secretsWritten.join(', ')}` } : {}),
  });
  local.push(expoConfigStep(opts.root, ids, opts.write));
  local.push(easEnvStep(opts.root, ids, opts.write));

  const nextState: State = { version: 1, ids, done: { ...state.done } };
  for (const step of local) {
    if (step.changed) nextState.done[step.id] = opts.now().toISOString();
  }
  const stateChanged = JSON.stringify(nextState) !== JSON.stringify(state);
  if (opts.write && stateChanged) writeState(opts.root, nextState);

  const manual = manualSteps(opts.config, ids).map((m) => ({
    ...m,
    recorded: (m.recordedBy ?? []).length > 0 && (m.recordedBy ?? []).every((k) => !!ids[k]),
  }));
  return { local, manual, secretsWritten };
}

/** Where a rotated secret has to be replaced — the value itself is never shown. */
export const ROTATION_TARGETS: Record<SecretName, string> = {
  ADMIN_TOKEN_SECRET: 'Vercel env ADMIN_TOKEN_SECRET (production); offene Eltern-Sitzungen enden',
  TICK_SECRET:
    'Vercel env TICK_SECRET und Supabase Vault lb_tick_secret — beide, sonst läuft kein Tick',
  LB_API_DB_PASSWORD: 'alter role lb_api password …; DATABASE_URL in Vercel',
};

export function renderResult(result: ProvisionResult, opts: { write: boolean }): string {
  const lines: string[] = [];
  lines.push(opts.write ? 'Lokal (ausgeführt):' : 'Lokal (--plan, nichts geschrieben):');
  for (const s of result.local) {
    const mark = s.changed ? (opts.write ? '✓ geändert' : '→ würde ändern') : '· unverändert';
    lines.push(`  ${mark}  ${s.title}${s.note ? ` — ${s.note}` : ''}`);
  }
  for (const name of result.secretsWritten) {
    lines.push(`  ! ${name}: neuer Wert muss nach ${ROTATION_TARGETS[name]}`);
  }
  lines.push('');
  lines.push('Von Hand (nicht ausgeführt, nichts davon ist geprüft):');
  for (const m of result.manual) {
    const mark = m.recorded ? '● aufgezeichnet (deine Angabe)' : '○ offen';
    lines.push(`  ${mark}  [${m.area}] ${m.title}`);
    if (!m.recorded) for (const h of m.how) lines.push(`        ${h}`);
  }
  return lines.join('\n');
}

/** Checks /v1/health of the recorded API — a real request, reported as it came back. */
export async function checkHealth(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; line: string }> {
  try {
    const res = await fetchImpl(`${apiUrl}/v1/health`, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as {
      ok?: unknown;
      database?: unknown;
      scheduler?: { ok?: unknown };
    };
    const ok = res.ok && body.ok === true;
    return {
      ok,
      line: `/v1/health → ${res.status}: ok=${String(body.ok)} database=${String(body.database)} scheduler=${String(body.scheduler?.ok)}`,
    };
  } catch (err) {
    return {
      ok: false,
      line: `/v1/health nicht erreichbar: ${err instanceof Error ? err.name : 'error'}`,
    };
  }
}

/** What cannot be deleted again once created (issue #107 §3, deprovision --dry-run). */
export const NOT_DELETABLE = [
  'Bundle-ID / Android-Paketname: bei Apple und Google Play dauerhaft vergeben',
  'Google-Cloud- und Firebase-Projekt-IDs: nach dem Löschen 30 Tage gesperrt, danach nie wieder vergeben',
  'Android-Upload-Keystore bei EAS: verloren = keine Updates mehr für dieselbe App',
  'Expo-Slug und Projekt-ID: an das Konto gebunden',
];
