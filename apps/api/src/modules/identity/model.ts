// Identity: the adult account holder and the one learner profile they own.
// docs/privacy.md (consent, minors), docs/architecture.md §Identity.

import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

import type { Db } from '../../lib/db.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export type AccountRow = {
  id: string;
  auth_user_id: string;
  locale: string;
  consent_version: string;
  consent_at: Date;
  pin_hash: string | null;
  pin_failed_count: number;
  pin_locked_until: Date | null;
  deletion_due_at: Date | null;
};

export type LearnerRow = {
  id: string;
  account_id: string;
  relation: 'self' | 'child';
  display_name: string;
  birth_date: string;
  level: 'unknown' | 'school' | 'university' | 'adult';
  grade: number | null;
  locale: 'de' | 'en' | 'fr' | 'es' | 'it';
  version: number;
};

export const MINOR_AGE = 16;

/** Whole years between a birth date (YYYY-MM-DD) and `on` (UTC date). */
export function ageOn(birthDate: string, on: Date): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = on.getUTCFullYear() - y;
  const beforeBirthday =
    on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function isMinor(birthDate: string, on: Date): boolean {
  return ageOn(birthDate, on) < MINOR_AGE;
}

export async function findAccountByUser(db: Db, authUserId: string): Promise<AccountRow | null> {
  return db.maybeOne<AccountRow>(`select * from accounts where auth_user_id = $1`, [authUserId]);
}

export async function findLearner(db: Db, accountId: string): Promise<LearnerRow | null> {
  return db.maybeOne<LearnerRow>(`select * from learners where account_id = $1`, [accountId]);
}

// ─────────────── PIN (admin gate for minor profiles) ───────────────

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;
export const ADMIN_SESSION_MINUTES = 10;

/** Short-lived proof that the account holder entered the PIN on this device. */
export function issueAdminToken(
  secret: string,
  accountId: string,
  now: Date,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_MINUTES * 60_000);
  const payload = `${accountId}.${Math.floor(expiresAt.getTime() / 1000)}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

export function verifyAdminToken(
  secret: string,
  token: string,
  accountId: string,
  now: Date,
): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [acc, exp, sig] = parts as [string, string, string];
  if (acc !== accountId) return false;
  const expSeconds = Number(exp);
  if (!Number.isInteger(expSeconds) || expSeconds * 1000 <= now.getTime()) return false;
  const expected = createHmac('sha256', secret).update(`${acc}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
