// The smallest clarification a sheet needs (issue #164 point 1): the spots a reading could not
// settle, and her answer to one. docs/architecture.md §Material.

import type { ClarifyUnclearRequest, MaterialView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { samePrompt } from '../practice/items.js';
import { enqueueJob } from '../scheduler/jobs.js';
import { MOST_UNCLEAR_SPOTS, type UnclearReport } from './extract.js';
import { materialView } from './view.js';

/**
 * How long an unsettled spot is asked about (issue #164 point 1): the same day-long window the
 * page notice uses, because it rests on the same fact — the sheet is still at hand. After it the
 * ask is gone and the sheet is exactly what it was: a question that was never written, and a page
 * report she can still act on. Nothing nags and nothing is counted (CLAUDE.md rule 6).
 */
const UNCLEAR_TTL_MS = 24 * 3_600_000;
/** A clarified reading is one more look at the same photos: two tries, then it stays unwritten. */
const MAX_CLARIFY_ATTEMPTS = 2;

export type UnclearSpotRow = {
  id: string;
  learner_id: string;
  material_id: string;
  sheet_id: string;
  ref: string;
  page: number;
  task: string;
  about: string;
  readings: string[];
  status: 'open' | 'answered' | 'read' | 'dismissed' | 'expired';
  answer: string | null;
  items_added: number;
  asked_at: Date;
  expires_at: Date;
};

/**
 * The spots a reading could not settle, kept so the learner can be asked the SMALLEST question
 * (migration 0070). Before this, one unreadable digit made the whole page "partly read" and the
 * task's question was never written; she was told to photograph the page again without ever
 * learning where it stuck.
 *
 * Three things are enforced here, not in the prompt (CLAUDE.md rule 1): the alias she answers
 * with is issued by the server, a page the model invented is dropped (it would point her at
 * another page of her own sheet), and the same spot is never asked about twice — a continued
 * reading sees the same photos and names it again, exactly as it does with `not_practicable`.
 */
export async function insertUnclearSpots(
  tx: Db,
  o: {
    learnerId: string;
    materialId: string;
    sheetId: string;
    spots: readonly UnclearReport[];
    photoCount: number;
    now: Date;
  },
): Promise<void> {
  if (o.spots.length === 0) return;
  const known = await tx.query<{ ref: string; task: string }>(
    `select ref, task from material_unclear_spots where sheet_id = $1`,
    [o.sheetId],
  );
  const asked = new Set(known.map((k) => samePrompt(k.task)));
  const expires = new Date(o.now.getTime() + UNCLEAR_TTL_MS);
  let next = known.length + 1;
  for (const s of o.spots) {
    // A sheet asks about at most as many spots as one reading may name: more unsettled than
    // that is a page that was not read, and the page report is the honest step for it.
    if (next > MOST_UNCLEAR_SPOTS) break;
    if (s.page > o.photoCount || asked.has(samePrompt(s.task))) continue;
    await tx.query(
      `insert into material_unclear_spots
         (learner_id, material_id, sheet_id, ref, page, task, about, readings, asked_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       on conflict (sheet_id, ref) do nothing`,
      [
        o.learnerId,
        o.materialId,
        o.sheetId,
        `u${next}`,
        s.page,
        s.task,
        s.about,
        JSON.stringify(s.readings),
        o.now,
        expires,
      ],
    );
    asked.add(samePrompt(s.task));
    next++;
  }
}

/**
 * Her answer to one spot: the reading she confirmed, or "weiß ich nicht" (`reading: null`).
 *
 * Nothing the model wrote decides anything here. Both aliases were issued by the server and are
 * resolved by it (rule 2); the confirmed reading is copied out of the row, so the question that
 * follows can only ever be built on a reading the app itself offered her. An ask that is no
 * longer open — answered before, let go, or past its day — says so instead of being answered
 * twice, and an ignored one has cost the sheet nothing.
 */
export async function clarifyUnclearSpot(
  deps: Deps,
  learnerId: string,
  materialId: string,
  input: ClarifyUnclearRequest,
): Promise<{ view: MaterialView; jobId: string | null }> {
  const now = deps.now();
  // Another learner's sheet (and a deleted one) is not found here, before anything else.
  await materialView(deps.db, learnerId, materialId);
  const jobId = await deps.db.tx(async (tx) => {
    const spot = await tx.maybeOne<UnclearSpotRow>(
      `select s.* from material_unclear_spots s
         join materials m on m.id = s.sheet_id and m.learner_id = s.learner_id
        where s.sheet_id = $1 and s.learner_id = $2 and s.ref = $3 and m.archived_at is null
        for update of s`,
      [materialId, learnerId, input.spot],
    );
    if (!spot) throw new AppError('not_found', 'Unclear spot not found');
    if (spot.status === 'open' && spot.expires_at <= now) {
      await tx.query(`update material_unclear_spots set status = 'expired' where id = $1`, [
        spot.id,
      ]);
      throw new AppError('conflict', 'This question is no longer open', {
        reason: 'no_longer_open',
      });
    }
    if (spot.status !== 'open')
      throw new AppError('conflict', 'This question is no longer open', {
        reason: 'no_longer_open',
      });
    if (input.reading === null) {
      // "Weiß ich nicht": the ask closes and no question is written for that task. The page
      // report is still there for her, and nothing comes back asking again.
      await tx.query(
        `update material_unclear_spots set status = 'dismissed', answered_at = $2 where id = $1`,
        [spot.id, now],
      );
      await bumpContext(tx, learnerId);
      return null;
    }
    const at = Number(input.reading.slice(1)) - 1;
    const answer = spot.readings[at];
    if (answer === undefined)
      throw new AppError('invalid_input', 'That is not one of the readings', {
        reason: 'unknown_reading',
      });
    await tx.query(
      `update material_unclear_spots set status = 'answered', answer = $2, answered_at = $3
        where id = $1`,
      [spot.id, answer, now],
    );
    // The reading of the rest of this sheet is long done, so this is one more look at the same
    // photos — the continued-reading machinery of issue #150 with one fact added, not a second
    // mechanism. Its own dedupe key, so answering twice can never read twice.
    const jobId = await enqueueJob(tx, {
      learnerId,
      kind: 'extract_material',
      runAt: now,
      dedupeKey: `clarify:${spot.id}`,
      payload: { material_id: spot.material_id, unclear_spot_id: spot.id },
      maxAttempts: MAX_CLARIFY_ATTEMPTS,
    });
    await bumpContext(tx, learnerId);
    return jobId;
  });
  return { view: await materialView(deps.db, learnerId, materialId), jobId };
}
