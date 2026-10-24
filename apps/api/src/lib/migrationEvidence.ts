// Candidate migrations need positive evidence, including names unknown to this build (#915).
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { recordedMigrations } from './migrations.js';

export function parseExpectedMigrations(values: string[]): string[] {
  const raw = values[0] ?? '';
  const names = raw.split(',');
  if (
    values.length !== 1 ||
    raw.length > 2019 ||
    names.length > 20 ||
    names.some((name) => !/^\d{4}_[a-z0-9][a-z0-9_]{0,94}$/.test(name)) ||
    new Set(names.map((name) => name.slice(0, 4))).size !== names.length
  )
    throw new AppError('invalid_input', 'Expected 1–20 unique migration names');
  return names;
}

export async function migrationEvidence(db: Db, expected: string[]): Promise<string[] | null> {
  try {
    const rows = await recordedMigrations(
      db,
      expected.map((name) => name.slice(0, 4)),
    );
    if (rows === null) return null;
    // A reused number is not proof, even if one of its records has the requested name.
    return expected.filter((name) => {
      const sameNumber = rows.filter((row) => row.slice(0, 4) === name.slice(0, 4));
      return sameNumber.length === 1 && sameNumber[0] === name;
    });
  } catch {
    return null;
  }
}
