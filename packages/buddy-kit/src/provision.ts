// provision: bring up the infrastructure of one Buddy app (issue #107 §3).
//
// Honest split. What this machine can do and verify, it does (local.ts): generate the app's
// secrets, keep the state file, write the recorded project ids into app.json, eas.json and the
// health workflow, regenerate the processor list, check /v1/health. Everything that needs a
// cloud account is a MANUAL step with the exact command or console path (steps.ts) — printed,
// never executed and never reported as done. A manual step counts as "recorded" once its id was
// entered with --set; that is the owner's statement, and the output says so instead of
// "verified" (CLAUDE.md rule 5). `--dry-run` adds what would exist in the end (inventory.ts).
//
// Idempotent: a second run with nothing new changes no file. --dry-run writes nothing at all.

import { type BuddyConfig, KitError, missingForProduction } from './config.js';
import {
  easEnvStep,
  expoConfigStep,
  gitignoreStep,
  healthStep,
  type LocalStep,
  processorsStep,
} from './local.js';
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
import { type ManualStep, manualSteps } from './steps.js';

export type ProvisionResult = {
  local: LocalStep[];
  manual: Array<ManualStep & { recorded: boolean }>;
  /** Secret names generated or rotated in this run (names only). */
  secretsWritten: SecretName[];
  /** The ids as they stand after this run (recorded, never secrets). */
  ids: RecordedIds;
};

export function provision(opts: {
  root: string;
  config: BuddyConfig;
  env: 'development' | 'production';
  /** false = --dry-run: compute everything, write nothing. */
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
  local.push(easEnvStep(opts.root, opts.config, ids, opts.write));
  local.push(healthStep(opts.root, ids, opts.write));
  local.push(processorsStep(opts.root, opts.config, opts.write));

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
  return { local, manual, secretsWritten, ids };
}

/** Where a rotated secret has to be replaced — the value itself is never shown. */
const ROTATION_TARGETS: Record<SecretName, string> = {
  ADMIN_TOKEN_SECRET: 'Vercel env ADMIN_TOKEN_SECRET (production); offene Eltern-Sitzungen enden',
  TICK_SECRET:
    'Vercel env TICK_SECRET und Supabase Vault lb_tick_secret — beide, sonst läuft kein Tick',
  LB_API_DB_PASSWORD: 'alter role lb_api password …; DATABASE_URL in Vercel',
};

export function renderResult(result: ProvisionResult, opts: { write: boolean }): string {
  const lines: string[] = [];
  lines.push(opts.write ? 'Lokal (ausgeführt):' : 'Lokal (--dry-run, nichts geschrieben):');
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
