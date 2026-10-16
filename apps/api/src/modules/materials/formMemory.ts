// The choice of forms a sheet's reading made, kept for the sheet's next readings (F5-2, #657).
// A clarification (#164) or a reading run again is its own job: it chose again from the same
// photos, one model call more for the same answer. docs/architecture.md §Schema budget.

import type { Db } from '../../lib/db.js';
import type { Keep } from '../practice/formChoice.js';

type Stored = { key: string; forms: string[]; figures: string[] };

/**
 * Under what a stored choice holds: the reading's prompt version (its schema is part of it) and
 * the forms switched off here. Either changing makes the choice stale, and it is made anew.
 */
export function choiceKey(promptVersion: string, off: ReadonlySet<string>): string {
  return `${promptVersion}|${[...off].sort().join(',')}`;
}

/** The sheet's stored choice under `key`, or null. */
export async function storedChoice(
  db: Db,
  materialId: string,
  key: string,
): Promise<{ forms: string[]; figures: string[] } | null> {
  const row = await db.maybeOne<{ form_choice: Stored | null }>(
    `select form_choice from materials where id = $1`,
    [materialId],
  );
  const c = row?.form_choice;
  return c && c.key === key ? { forms: c.forms, figures: c.figures } : null;
}

/** Keeps a choice the model made for this sheet. */
export async function storeChoice(
  db: Db,
  materialId: string,
  key: string,
  keep: Keep,
): Promise<void> {
  const value: Stored = { key, forms: [...keep.forms], figures: [...keep.figures] };
  await db.query(`update materials set form_choice = $2 where id = $1`, [
    materialId,
    JSON.stringify(value),
  ]);
}
