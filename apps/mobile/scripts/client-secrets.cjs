// What may never reach the app's JS bundle (issue #290).
//
// Everything named EXPO_PUBLIC_* is baked into the bundle — inlined in a release build, and
// in a dev build carried as a plain object in front of the app code. An administrator token
// under that prefix once sat in every locally built bundle (`EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY`,
// a service-role JWT of a since-deleted Supabase project). This module is the one place that
// decides, mechanically, what counts as such a secret; three gates use it:
//
//   1. metro.config.js — Metro refuses to start (dev server, `expo export`, EAS build) while an
//      EXPO_PUBLIC_* variable, from the shell or from an .env file Expo would load, has a
//      secret's name or a secret's value.
//   2. `node scripts/client-secrets.cjs scan <dir|file>…` — reads a FINISHED bundle and fails on
//      any secret value or secret-named EXPO_PUBLIC_* in it (scripts/web-walkthrough.sh runs it
//      over every export, so `pnpm verify` and CI do).
//   3. `node scripts/client-secrets.cjs local-only <bundle> <origin>` — proves that a dev bundle
//      talks only to the local stack (issue #291, scripts/dev-local-stack.sh).
//
// No message ever prints a value — only its name, where it came from and why it was rejected.
// Plain CommonJS on purpose: Metro loads its config with `require`, before any transform.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Names that announce a secret. The anon key is public by design (its name carries ANON_KEY,
 * which is not listed); a generic TOKEN is not listed either — map tiles and the like have
 * public tokens — but tokens that authenticate a person or a server are.
 */
const SECRET_NAME =
  /(SERVICE|SECRET|PRIVATE|PASSWORD|PASSWD|ADMIN|CREDENTIAL|AUTH_TOKEN|ACCESS_TOKEN|REFRESH_TOKEN)/;

/** Roles a JWT may carry in a client bundle: only the public anon role. */
const PUBLIC_JWT_ROLES = new Set(['anon']);

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

/** Value shapes that are a secret whatever they are called. */
const SECRET_SHAPES = [
  { re: /sb_secret_[A-Za-z0-9_-]{8,}/, reason: 'Supabase secret API key (sb_secret_…)' },
  {
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
    reason: 'private key (PEM)',
  },
  { re: /"type"\s*:\s*"service_account"/, reason: 'Google service-account credentials' },
  { re: /sntrys_[A-Za-z0-9_-]{16,}/, reason: 'Sentry auth token (sntrys_…)' },
];

function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Why a name may not carry the EXPO_PUBLIC_ prefix, or null. */
function secretName(name) {
  if (!name.startsWith('EXPO_PUBLIC_')) return null;
  const hit = name.slice('EXPO_PUBLIC_'.length).match(SECRET_NAME);
  return hit ? `name contains "${hit[1]}"` : null;
}

/** Every reason a piece of text (a value, or a whole bundle) carries a secret. */
function secretValues(text) {
  const reasons = [];
  for (const match of text.matchAll(JWT)) {
    const payload = decodeJwtPayload(match[0]);
    if (!payload) continue;
    const role = typeof payload.role === 'string' ? payload.role : null;
    if (role !== null && !PUBLIC_JWT_ROLES.has(role)) {
      reasons.push(`JWT with role "${role}"`);
    }
  }
  for (const { re, reason } of SECRET_SHAPES) if (re.test(text)) reasons.push(reason);
  return [...new Set(reasons)];
}

/** Minimal .env reader: KEY=VALUE lines, optional quotes, # comments. Values stay in memory. */
function parseEnvText(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2];
    const quoted = value.match(/^(['"`])([\s\S]*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '');
    out[m[1]] = value;
  }
  return out;
}

/** The .env files Expo loads for a mode (same list and order as @expo/env's getFiles). */
function envFileNames(mode) {
  return [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env'];
}

/**
 * Every EXPO_PUBLIC_* variable that is a secret, from the environment and — unless
 * EXPO_NO_DOTENV is set, in which case Expo reads none of them — the project's .env files.
 * Returns findings without values: { name, source, reasons }.
 *
 * @param {{ env?: Record<string, string | undefined>, projectRoot?: string, mode?: string }} [options]
 * @returns {{ name: string, source: string, reasons: string[] }[]}
 */
function findClientEnvSecrets({ env = process.env, projectRoot, mode } = {}) {
  const sources = [['environment', env]];
  const dotenvOff = /^(1|true|yes)$/i.test(String(env.EXPO_NO_DOTENV ?? ''));
  if (projectRoot && !dotenvOff) {
    const m = mode ?? env.NODE_ENV ?? 'development';
    for (const file of envFileNames(m)) {
      const full = path.join(projectRoot, file);
      if (!fs.existsSync(full)) continue;
      sources.push([file, parseEnvText(fs.readFileSync(full, 'utf8'))]);
    }
  }
  const findings = [];
  for (const [source, vars] of sources) {
    for (const [name, value] of Object.entries(vars)) {
      if (!name.startsWith('EXPO_PUBLIC_')) continue;
      const reasons = [];
      const byName = secretName(name);
      if (byName) reasons.push(byName);
      if (typeof value === 'string') reasons.push(...secretValues(value));
      if (reasons.length > 0) findings.push({ name, source, reasons });
    }
  }
  return findings;
}

function describe(findings) {
  return findings.map((f) => `  - ${f.name} (${f.source}): ${f.reasons.join('; ')}`).join('\n');
}

/**
 * Throws when anything secret is about to be bundled. Called from metro.config.js.
 *
 * @param {{ env?: Record<string, string | undefined>, projectRoot?: string, mode?: string }} [options]
 */
function assertClientEnvClean(options) {
  const findings = findClientEnvSecrets(options);
  if (findings.length === 0) return;
  throw new Error(
    `Refusing to bundle: these EXPO_PUBLIC_* variables would land in the app's JS bundle, ` +
      `and they look like secrets (issue #290):\n${describe(findings)}\n` +
      `Every EXPO_PUBLIC_* value is readable by anyone who has the app. Delete the line (an ` +
      `administrator or server key belongs only in apps/api/.env.local or the server's own ` +
      `environment), then start Metro again. Values are never printed here.`,
  );
}

/** Secrets found in bundle text: secret-named EXPO_PUBLIC_* identifiers and secret values. */
function scanBundleText(text) {
  const reasons = [];
  for (const m of text.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
    const why = secretName(m[0]);
    if (why) reasons.push(`${m[0]}: ${why}`);
  }
  reasons.push(...secretValues(text));
  return [...new Set(reasons)];
}

function bundleFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...bundleFiles(full));
    else if (/\.(js|hbc|html|json|map)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Scans exported files; returns findings per file without values. */
function scanBundles(targets) {
  const findings = [];
  for (const target of targets) {
    for (const file of bundleFiles(target)) {
      // Source maps carry the sources, not the bundle; they are scanned like the bundle
      // because they ship next to it (web) or are uploaded (Sentry).
      const reasons = scanBundleText(fs.readFileSync(file, 'latin1'));
      if (reasons.length > 0) findings.push({ file, reasons });
    }
  }
  return findings;
}

/** Hosts the dev build reaches as "this machine" (adb reverse, simulator, emulator loopback). */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/**
 * Proof for issue #291: a DEV bundle served by Metro talks only to the local stack.
 * - no .env file is bundled as a module (Expo's dev-only `expo/virtual/env` used to pull
 *   .env.local in and let it win over the shell);
 * - every EXPO_PUBLIC_*_URL the bundle carries is local, and the API URL is `origin`;
 * - no secret in it at all.
 */
function checkLocalOnly(text, origin, extraHosts = []) {
  const problems = [];
  const envModules = text.match(
    /"(?:[^"\n]*\/)?\.env(?:\.(?:local|development|production)(?:\.local)?)?"\);/g,
  );
  if (envModules) problems.push(`bundles an .env file as a module (${envModules.length}×)`);
  const values = {};
  const prelude =
    /"(EXPO_PUBLIC_[A-Z0-9_]+)":\s*\{\s*enumerable:\s*true,\s*value:\s*("(?:[^"\\]|\\.)*")/g;
  for (const m of text.matchAll(prelude)) values[m[1]] = JSON.parse(m[2]);
  if (Object.keys(values).length === 0) {
    problems.push('carries no EXPO_PUBLIC_* values at all (not a dev bundle?)');
  }
  const allowed = new Set([...LOCAL_HOSTS, ...extraHosts]);
  for (const [name, value] of Object.entries(values)) {
    if (!name.endsWith('_URL') || value === '') continue;
    let host = null;
    try {
      host = new URL(value).hostname;
    } catch {
      problems.push(`${name} is not a URL`);
      continue;
    }
    if (!allowed.has(host)) problems.push(`${name} points at "${host}", not this machine`);
  }
  if (values.EXPO_PUBLIC_API_URL !== origin) {
    problems.push(`EXPO_PUBLIC_API_URL is not ${origin}`);
  }
  for (const reason of scanBundleText(text)) problems.push(`secret in bundle: ${reason}`);
  return { problems, names: Object.keys(values).sort() };
}

module.exports = {
  SECRET_NAME,
  secretName,
  secretValues,
  parseEnvText,
  findClientEnvSecrets,
  assertClientEnvClean,
  scanBundleText,
  scanBundles,
  checkLocalOnly,
};

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'scan' && args.length > 0) {
    const findings = scanBundles(args);
    if (findings.length > 0) {
      console.error('client-secrets: the bundle carries secrets (issue #290):');
      for (const f of findings) console.error(`  - ${f.file}: ${f.reasons.join('; ')}`);
      process.exit(1);
    }
    console.log(`client-secrets: no secret in ${args.join(', ')}`);
  } else if (command === 'local-only' && args.length >= 2) {
    const [file, origin, ...hosts] = args;
    const { problems, names } = checkLocalOnly(fs.readFileSync(file, 'utf8'), origin, hosts);
    if (problems.length > 0) {
      console.error('client-secrets: the dev bundle does NOT talk only to the local stack:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`client-secrets: dev bundle talks only to ${origin} (${names.join(', ')})`);
  } else {
    console.error(
      'usage: client-secrets.cjs scan <dir|file>… | local-only <bundle> <origin> [host…]',
    );
    process.exit(2);
  }
}
