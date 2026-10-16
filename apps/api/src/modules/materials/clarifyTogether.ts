// The answers of one sheet are read together (issue #683, KI-Audit K10). docs/architecture.md
// §Material.
//
// Every clarification was a full reading of all the sheet's photos, and a sheet may ask about up
// to six spots — she answers them a few seconds apart, so each answer started a reading of its
// own beside the others. Now one reading of a sheet runs at a time: it takes every spot of the
// sheet she has answered by then, and an answer given while it runs waits for it and is then
// read together with whatever else came meanwhile.

import type { Db } from '../../lib/db.js';
import type { StoredItem } from '../practice/items.js';
import type { JobRow } from '../scheduler/jobs.js';

/**
 * This job's claim on reading the sheet's answers, or the moment the reading that holds it ends
 * (its lease) when another one does. Serialised per sheet by a transaction-scoped advisory lock,
 * so two jobs that start at the same moment cannot both take the sheet.
 */
export async function takeSheet(
  tx: Db,
  job: JobRow,
  sheetId: string,
  now: Date,
): Promise<{ busyUntil: Date } | null> {
  await tx.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [`clarify:${sheetId}`]);
  const other = await tx.maybeOne<{ lease_until: Date }>(
    `select lease_until from jobs
      where kind = 'extract_material' and status = 'running' and id <> $1
        and payload ->> 'clarifying' = $2 and lease_until > $3
      order by lease_until desc limit 1`,
    [job.id, sheetId, now],
  );
  if (other) return { busyUntil: other.lease_until };
  await tx.query(
    `update jobs set payload = payload || jsonb_build_object('clarifying', $2::text)
      where id = $1 and lease_token = $3`,
    [job.id, sheetId, job.lease_token],
  );
  return null;
}

/**
 * The readings that waited for this one may run now: their answers are either read already (then
 * they end at once, without a model call) or came while this one ran. True when one waits.
 */
export async function releaseWaiting(tx: Db, sheetId: string, now: Date): Promise<boolean> {
  const rows = await tx.query(
    `update jobs j set run_at = $2
       from material_unclear_spots s
      where j.kind = 'extract_material' and j.status = 'queued'
        and s.id::text = j.payload ->> 'unclear_spot_id' and s.sheet_id = $1
      returning j.id`,
    [sheetId, now],
  );
  return rows.length > 0;
}

/** Her reading as it stands in a question: the same token, case aside. */
function holds(text: string, reading: string): boolean {
  const fold = (x: string) => x.normalize('NFC').toLocaleLowerCase();
  const at = fold(text);
  const want = fold(reading.trim());
  if (want === '') return false;
  let from = 0;
  for (;;) {
    const i = at.indexOf(want, from);
    if (i < 0) return false;
    const before = at[i - 1];
    const after = at[i + want.length];
    const edge = (c: string | undefined) => c === undefined || !/[\p{L}\p{N}]/u.test(c);
    if (edge(before) && edge(after)) return true;
    from = i + 1;
  }
}

/**
 * How many new questions each spot read together got. One spot gets them all, as before. Of
 * several, a spot gets the questions that hold its reading — the reading was told to write her
 * reading in place of the unsettled part — and every question that holds none of the readings,
 * which may be its own. A spot gets 0 only when no new question holds its reading and every new
 * question holds another spot's: then nothing was written for it, and Buddy says so (rule 5).
 */
export function creditOf(
  spots: ReadonlyArray<{ id: string; answer: string }>,
  fresh: readonly StoredItem[],
): Map<string, number> {
  if (spots.length === 1) return new Map([[spots[0]!.id, fresh.length]]);
  const textOf = (it: StoredItem) => `${it.prompt}\n${it.answer}`;
  const unclaimed = fresh.filter((it) => !spots.some((s) => holds(textOf(it), s.answer))).length;
  return new Map(
    spots.map((s) => [s.id, fresh.filter((it) => holds(textOf(it), s.answer)).length + unclaimed]),
  );
}
