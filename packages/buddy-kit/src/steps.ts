// provision's cloud steps (issue #107 §3): each one an exact command or console path, printed and
// never executed — there is no account here, and a step that never ran against the real API
// would be a claim (CLAUDE.md rule 5). The stumbling blocks of 28.09. are written into them.

import type { BuddyConfig } from './config.js';
import { STATE_DIR, type IdKey, type RecordedIds } from './state.js';

export type ManualStep = {
  id: string;
  area:
    | 'Supabase'
    | 'Vercel'
    | 'Expo'
    | 'Google Cloud'
    | 'GitHub'
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

/** The API's database role (infra/supabase/templates/api-role.sql). */
export const API_ROLE = 'lb_api';

/** The Vercel project of the API, by the app id. */
export const vercelProject = (config: BuddyConfig) => `${config.identity.id}-api`;

/**
 * Every variable the API reads in production (apps/api/src/config.ts), with where its value
 * comes from. Production only — never "Preview", or previews run against the production
 * database. drift.test.ts holds this list against config.ts.
 */
export function vercelEnv(config: BuddyConfig, ids: RecordedIds): Array<[string, string]> {
  const ref = ids.supabaseProjectRef ?? '<project-ref>';
  const pooler = ids.supabasePoolerHost ?? '<pooler-host>';
  const caps = config.wiring.capabilities;
  return [
    [
      'DATABASE_URL',
      `postgres://${API_ROLE}.${ref}:$LB_API_DB_PASSWORD@${pooler}:6543/postgres (Transaction pooler; Format nicht live geprüft)`,
    ],
    ['DATABASE_CA_CERT', 'Supabase → Database → SSL configuration (PEM)'],
    ['SUPABASE_URL', `https://${ref}.supabase.co`],
    ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase → Project Settings → API keys (secret)'],
    ['ADMIN_TOKEN_SECRET', `${STATE_DIR}/secrets.env`],
    ['TICK_SECRET', `${STATE_DIR}/secrets.env (dasselbe wie Vault lb_tick_secret)`],
    ['CONSENT_VERSION', 'Datum des Einwilligungstexts dieser App (nicht der Default der Quelle)'],
    ['MIN_APP_VERSION', 'leer lassen, bis eine alte App-Version gesperrt werden muss'],
    ['LLM_BACKEND', 'vertex'],
    ['GOOGLE_CLOUD_PROJECT', ids.gcpProjectId ?? '<gcp-project-id>'],
    ['GOOGLE_VERTEX_LOCATION', config.policy.vertexLocation],
    ['GOOGLE_APPLICATION_CREDENTIALS_JSON', 'Service-Account-JSON (nur hier, nie im Repo)'],
    ['SPEECH_BACKEND', caps.includes('voice') ? 'google' : 'disabled'],
    ['PUSH_BACKEND', 'disabled (an erst nach rechtlicher Prüfung)'],
    ...(caps.includes('push')
      ? [
          ['EXPO_ACCESS_TOKEN', 'Expo → Access tokens (erst wenn PUSH_BACKEND=expo)'] as [
            string,
            string,
          ],
        ]
      : []),
  ];
}

/** The manual steps, in order. */
export function manualSteps(config: BuddyConfig, ids: RecordedIds): ManualStep[] {
  const { id, scheme, bundleId } = config.identity;
  const caps = config.wiring.capabilities;
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
        'Dashboard → Connect → Transaction pooler: den Host abschreiben (aws-0 oder aws-1 — bei LearnBuddy war die Vermutung falsch).',
        'pnpm provision --set supabasePoolerHost=<aws-N-eu-central-1.pooler.supabase.com>',
      ],
      recordedBy: ['supabasePoolerHost'],
    },
    {
      id: 'supabase-migrations',
      area: 'Supabase',
      title: 'Migrationen anwenden (ein Mechanismus: die Supabase-CLI)',
      how: [
        // The CLI looks for <workdir>/supabase/config.toml: here infra/supabase/config.toml.
        `supabase --workdir infra link --project-ref ${ref}`,
        'supabase --workdir infra db push',
      ],
    },
    {
      id: 'supabase-api-role',
      area: 'Supabase',
      title: 'API-Datenbankrolle aus der versionierten Vorlage',
      how: [
        `set -a; . ./${secrets}; set +a`,
        `psql "<admin-connection-string>" -v api_role=${API_ROLE} -v api_password="$LB_API_DB_PASSWORD" -f infra/supabase/templates/api-role.sql`,
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
      title: `Projekt ${vercelProject(config)}: Root apps/api, Framework none, Region fra1, Deployment Protection an`,
      how: [
        `vercel link --project ${vercelProject(config)} (im Ordner apps/api); Region und Rewrites stehen in apps/api/vercel.json`,
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
        ...vercelEnv(config, ids)
          .filter(([n]) => n !== 'ADMIN_TOKEN_SECRET' && n !== 'TICK_SECRET')
          .map(([n, v]) => `${n} = ${v}`),
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
        `gcloud projects create <id>; gcloud services enable aiplatform.googleapis.com${caps.includes('voice') ? ' texttospeech.googleapis.com' : ''}`,
        'Service Account mit minimalen Rechten (besser Workload Identity); Schlüssel nur in Vercel, nie im Repo',
        'Budget-Alarm anlegen (deckelt nicht, warnt nur)',
        'pnpm provision --set gcpProjectId=<id>',
      ],
      recordedBy: ['gcpProjectId'],
    },
    ...(caps.includes('push')
      ? [
          {
            id: 'firebase',
            area: 'Google Cloud' as const,
            title: 'Firebase-Projekt mit Android-App (FCM)',
            how: [
              `Android-App mit Paket ${bundleId} anlegen, google-services.json nach apps/mobile/ (nicht aus der Quelle übernehmen)`,
              'FCM-V1-Schlüssel nur zu Expo hochladen (eas credentials), nie ins Repo',
              'pnpm provision --set firebaseProjectId=<id>',
            ],
            recordedBy: ['firebaseProjectId' as const],
          },
        ]
      : []),
    {
      id: 'github',
      area: 'GitHub',
      title: `Eigenes Repository ${config.identity.repo ?? `<owner>/${id}`}`,
      how: [
        'git remote add origin <url>; git push -u origin main — ab dann messen die Wächter auf origin/main',
        'Branch-Schutz für main; der Health-Workflow prüft die eigene API, sobald apiUrl eingetragen ist',
      ],
    },
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
