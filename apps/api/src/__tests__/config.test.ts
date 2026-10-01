// Boot checks on the database connection (audit H-33 supabase-region-london-not-eu,
// M-7 database-tls-not-enforced; docs/privacy.md §Processors). Pure: no database needed.

import { describe, expect, it } from 'vitest';

import { bootWarnings, databaseRegionWarning, databaseTlsIssue, loadConfig } from '../config.js';
import { connectionOptions, isLocalDatabaseHost } from '../lib/db.js';

const base = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
  // The natural voice is a boot warning of its own since issue #176; these cases are about
  // the database, so they are set up with it on.
  SPEECH_BACKEND: 'google',
  GOOGLE_CLOUD_PROJECT: 'learnbuddy-test',
};
const LONDON = 'postgres://postgres.ref:pw@aws-1-eu-west-2.pooler.supabase.com:6543/postgres';
const FRANKFURT = 'postgres://postgres.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

describe('database TLS', () => {
  it('connects to a remote host only with verified TLS, whatever the URL says', () => {
    expect(connectionOptions(FRANKFURT).ssl).toEqual({ rejectUnauthorized: true });
    const opts = connectionOptions(`${FRANKFURT}?sslmode=require&application_name=api`, 'PEM');
    expect(opts.ssl).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
    // node-pg lets URL parameters override `ssl`, so they are removed; others are kept.
    expect(opts.connectionString).not.toContain('sslmode');
    expect(opts.connectionString).toContain('application_name=api');
  });

  it('keeps local test and dev databases without TLS', () => {
    for (const url of [
      'postgres://postgres:postgres@127.0.0.1:5438/postgres',
      'postgres://postgres@localhost/db',
      'postgres://postgres@[::1]:5432/db',
      'postgres:///db?host=/var/run/postgresql',
    ]) {
      expect(connectionOptions(url).ssl).toBe(false);
    }
    expect(isLocalDatabaseHost('db.example.com')).toBe(false);
    expect(isLocalDatabaseHost('127.0.0.1')).toBe(true);
  });

  it('refuses to boot when the URL asks for plaintext or no verification on a remote host', () => {
    expect(databaseTlsIssue(`${FRANKFURT}?sslmode=disable`)).toMatch(/sslmode=disable/);
    expect(databaseTlsIssue(`${FRANKFURT}?sslmode=no-verify`)).toMatch(/unverified/);
    expect(databaseTlsIssue(`${FRANKFURT}?sslmode=verify-full`)).toBeNull();
    expect(databaseTlsIssue('postgres://127.0.0.1/db?sslmode=disable')).toBeNull();
    expect(() => loadConfig({ ...base, DATABASE_URL: `${FRANKFURT}?sslmode=disable` })).toThrow(
      /DATABASE_URL: sslmode=disable/,
    );
    expect(() => loadConfig({ ...base, DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/);
  });
});

describe('database region', () => {
  it('warns about a non-EU pooler region (London) without refusing to boot (D-4)', () => {
    expect(databaseRegionWarning(LONDON)).toMatch(/eu-west-2.*not an EU member state/);
    expect(databaseRegionWarning(FRANKFURT)).toBeNull();
    expect(
      databaseRegionWarning('postgres://p@aws-0-eu-central-2.pooler.supabase.com:6543/postgres'),
    ).toMatch(/eu-central-2/);
    const config = loadConfig({ ...base, DATABASE_URL: LONDON });
    expect(bootWarnings(config).join('\n')).toMatch(/eu-west-2/);
  });

  it('asks for confirmation when the host does not tell the region', () => {
    expect(databaseRegionWarning('postgres://p@db.abcdefgh.supabase.co:5432/postgres')).toMatch(
      /cannot be read/,
    );
    expect(databaseRegionWarning('postgres://p@127.0.0.1:5432/postgres')).toBeNull();
  });

  it('says at boot when Buddy has no natural voice (issue #176)', () => {
    // Off, every reply is read with the phone's own voice — the robot everyone found
    // creepy. The fallback stays; being quiet about it is what was wrong.
    const off = loadConfig({
      ...base,
      DATABASE_URL: FRANKFURT,
      DATABASE_CA_CERT: 'PEM',
      SPEECH_BACKEND: 'disabled',
    });
    expect(bootWarnings(off)).toEqual([expect.stringMatching(/SPEECH_BACKEND/)]);
    const on = loadConfig({ ...base, DATABASE_URL: FRANKFURT, DATABASE_CA_CERT: 'PEM' });
    expect(bootWarnings(on)).toEqual([]);
  });

  it('points at the missing CA certificate for a remote database', () => {
    const without = loadConfig({ ...base, DATABASE_URL: FRANKFURT });
    expect(bootWarnings(without)).toEqual([expect.stringMatching(/DATABASE_CA_CERT/)]);
    const withCa = loadConfig({ ...base, DATABASE_URL: FRANKFURT, DATABASE_CA_CERT: 'PEM' });
    expect(bootWarnings(withCa)).toEqual([]);
  });
});
