// No secret may reach the app's JS bundle (issue #290), and a dev bundle started for the local
// stack must talk only to it (issue #291). The rules live in scripts/client-secrets.cjs (plain
// CommonJS: Metro loads it with `require` before any transform); these tests prove each gate
// fires on a planted value and stays silent on everything the app really carries.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertClientEnvClean,
  checkLocalOnly,
  findClientEnvSecrets,
  parseEnvText,
  scanBundleText,
  secretName,
  secretValues,
} from '../../scripts/client-secrets.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, '../..');

function b64url(json: object): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url');
}
/** A JWT of the shape Supabase hands out — signature fake, never a real key. */
function jwt(role: string): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', ref: 'planted0test', role })}.planted-signature`;
}
const SERVICE_JWT = jwt('service_role');

describe('what counts as a secret', () => {
  it('rejects secret-sounding EXPO_PUBLIC_* names', () => {
    for (const name of [
      'EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY',
      'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
      'EXPO_PUBLIC_ADMIN_TOKEN_SECRET',
      'EXPO_PUBLIC_DB_PASSWORD',
      'EXPO_PUBLIC_GOOGLE_PRIVATE_KEY',
      'EXPO_PUBLIC_SENTRY_AUTH_TOKEN',
    ]) {
      expect(secretName(name), name).not.toBeNull();
    }
  });

  it('accepts every EXPO_PUBLIC_* name the app reads, the example lists and eas.json sets', () => {
    const sources = [
      readFileSync(join(mobile, 'lib/env.ts'), 'utf8'),
      readFileSync(join(mobile, '.env.example'), 'utf8'),
      readFileSync(join(mobile, 'eas.json'), 'utf8'),
    ].join('\n');
    const names = [...new Set(sources.match(/EXPO_PUBLIC_[A-Z0-9_]+/g) ?? [])];
    expect(names).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    for (const name of names) expect(secretName(name), name).toBeNull();
  });

  it('carries no secret value in eas.json, whose values go into every cloud build', () => {
    expect(secretValues(readFileSync(join(mobile, 'eas.json'), 'utf8'))).toEqual([]);
  });

  it('rejects a JWT with any role but anon, and other secret shapes', () => {
    expect(secretValues(SERVICE_JWT)).toEqual(['JWT with role "service_role"']);
    expect(secretValues(jwt('supabase_admin'))).toEqual(['JWT with role "supabase_admin"']);
    expect(secretValues(jwt('anon'))).toEqual([]);
    expect(secretValues('sb_secret_planted0123456789')).toHaveLength(1);
    expect(secretValues('sb_publishable_planted0123456789')).toEqual([]);
    expect(secretValues('-----BEGIN PRIVATE KEY-----\nMIIE')).toHaveLength(1);
    expect(secretValues('{"type": "service_account", "project_id": "x"}')).toHaveLength(1);
    expect(secretValues('http://localhost:8787')).toEqual([]);
  });

  it('reads .env lines the way Expo does for the names that matter', () => {
    expect(
      parseEnvText(
        '# comment\nEXPO_PUBLIC_A=1\nexport EXPO_PUBLIC_B="two words"\nEXPO_PUBLIC_C=x # note\n',
      ),
    ).toEqual({ EXPO_PUBLIC_A: '1', EXPO_PUBLIC_B: 'two words', EXPO_PUBLIC_C: 'x' });
  });
});

describe('the gate in metro.config.js', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });
  function project(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'lb-client-secrets-'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  }

  it('fires on a planted service key in .env.local and never prints its value', () => {
    const root = project({
      '.env.local': `EXPO_PUBLIC_API_URL=https://api.example\nEXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY=${SERVICE_JWT}\n`,
    });
    const findings = findClientEnvSecrets({ env: {}, projectRoot: root, mode: 'development' });
    expect(findings).toEqual([
      {
        name: 'EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY',
        source: '.env.local',
        reasons: ['name contains "SERVICE"', 'JWT with role "service_role"'],
      },
    ]);
    let message = '';
    try {
      assertClientEnvClean({ env: {}, projectRoot: root, mode: 'development' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY');
    expect(message).not.toContain(SERVICE_JWT);
    expect(message).not.toContain(SERVICE_JWT.split('.')[1]);
  });

  it('fires on an innocent name carrying an administrator token, from the shell too', () => {
    const findings = findClientEnvSecrets({ env: { EXPO_PUBLIC_SUPABASE_ANON_KEY: SERVICE_JWT } });
    expect(findings).toEqual([
      {
        name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
        source: 'environment',
        reasons: ['JWT with role "service_role"'],
      },
    ]);
  });

  it('is silent for what the app really carries, and for server-only names', () => {
    const root = project({
      '.env.local': `EXPO_PUBLIC_API_URL=https://api.example\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${jwt('anon')}\nSENTRY_AUTH_TOKEN=x\nSUPABASE_SERVICE_ROLE_KEY=${SERVICE_JWT}\n`,
    });
    expect(findClientEnvSecrets({ env: {}, projectRoot: root, mode: 'development' })).toEqual([]);
    expect(() =>
      assertClientEnvClean({ env: {}, projectRoot: root, mode: 'production' }),
    ).not.toThrow();
  });

  it('ignores the .env files when EXPO_NO_DOTENV is set — Expo then reads none of them', () => {
    const root = project({ '.env.local': `EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY=${SERVICE_JWT}\n` });
    expect(
      findClientEnvSecrets({
        env: { EXPO_NO_DOTENV: '1' },
        projectRoot: root,
        mode: 'development',
      }),
    ).toEqual([]);
  });

  it('is wired into Metro, and Metro reads process.env instead of bundling .env files', () => {
    const metro = readFileSync(join(mobile, 'metro.config.js'), 'utf8');
    expect(metro).toContain('assertClientEnvClean({ projectRoot })');
    expect(metro).toMatch(/moduleName === 'expo\/virtual\/env'/);
    expect(readFileSync(join(mobile, 'lib/processEnv.ts'), 'utf8')).toMatch(
      /export const env = process\.env;/,
    );
  });
});

describe('the bundle scan', () => {
  it('fires on a planted secret and on a secret-named variable in bundle text', () => {
    expect(scanBundleText(`var a=1;var k="${SERVICE_JWT}";`)).toEqual([
      'JWT with role "service_role"',
    ]);
    expect(scanBundleText('process.env.EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY')).toEqual([
      'EXPO_PUBLIC_DEV_SUPABASE_SERVICE_KEY: name contains "SERVICE"',
    ]);
  });

  it('is silent on an ordinary bundle', () => {
    expect(
      scanBundleText(`var u="http://localhost:8787",k="${jwt('anon')}";env.EXPO_PUBLIC_API_URL`),
    ).toEqual([]);
  });
});

describe('the local-stack proof (issue #291)', () => {
  const origin = 'http://localhost:8787';
  function prelude(values: Record<string, string>): string {
    const props = Object.entries(values)
      .map(([k, v]) => `${JSON.stringify(k)}: { enumerable: true, value: ${JSON.stringify(v)} }`)
      .join(',');
    return `/* HMR env vars from Expo CLI (dev-only) */ process.env=Object.defineProperties(process.env, {${props}});\n`;
  }
  const local = {
    EXPO_PUBLIC_API_URL: origin,
    EXPO_PUBLIC_SUPABASE_URL: origin,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'dev-anon-key',
  };

  it('accepts a dev bundle that names only the local stack', () => {
    expect(checkLocalOnly(prelude(local), origin).problems).toEqual([]);
  });

  it('rejects the bundle of the bug: .env.local bundled as a module', () => {
    const bug = `${prelude(local)}__d(function(){var _default={"EXPO_PUBLIC_API_URL":"https://hosted.example"};},1261,[],".env.local");`;
    expect(checkLocalOnly(bug, origin).problems).toEqual(['bundles an .env file as a module (1×)']);
  });

  it('rejects a hosted URL, a wrong API port and a planted secret', () => {
    const { problems } = checkLocalOnly(
      prelude({
        ...local,
        EXPO_PUBLIC_API_URL: 'http://localhost:9999',
        EXPO_PUBLIC_SUPABASE_URL: 'https://planted.supabase.co',
        EXPO_PUBLIC_X: SERVICE_JWT,
      }),
      origin,
    );
    expect(problems).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL points at "planted.supabase.co", not this machine',
      'EXPO_PUBLIC_API_URL is not http://localhost:8787',
      'secret in bundle: JWT with role "service_role"',
    ]);
  });

  it('accepts a LAN host only when it was named', () => {
    const lan = 'http://192.168.1.20:8787';
    const bundle = prelude({ ...local, EXPO_PUBLIC_API_URL: lan, EXPO_PUBLIC_SUPABASE_URL: lan });
    expect(checkLocalOnly(bundle, lan).problems).toHaveLength(2);
    expect(checkLocalOnly(bundle, lan, ['192.168.1.20']).problems).toEqual([]);
  });
});
