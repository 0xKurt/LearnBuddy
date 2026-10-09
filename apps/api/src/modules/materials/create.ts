// A sheet is reserved: the material and signed upload URLs (idempotent per client id), and
// "Passt so" for pages that stay missing. docs/architecture.md §Material.

import type { CreateMaterialRequest, MaterialView } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { PDF_MIME } from './pdf.js';
import { materialView } from './view.js';

export async function createMaterial(
  deps: Deps,
  learner: { id: string; account_id: string },
  input: CreateMaterialRequest,
): Promise<{
  material: MaterialView;
  uploads: Array<{ position: number; path: string; url: string; token: string }>;
}> {
  // Everything referenced must belong to this learner.
  const step = input.step_id
    ? await deps.db.maybeOne<{ id: string; goal_id: string | null }>(
        `select id, goal_id from buddy_steps where id = $1 and learner_id = $2 and kind = 'capture'`,
        [input.step_id, learner.id],
      )
    : null;
  if (input.step_id && !step) throw new AppError('not_found', 'Step not found');
  // A study sheet sent without a link (the composer camera, "Mein Stoff") while exactly one
  // photo is asked for (an open capture step) is that photo: it completes the step and joins
  // its goal, whichever way she took it (audit H-16). With two or more open, none is guessed.
  const asked =
    !step && !input.goal_id && !input.completes && input.purpose !== 'homework'
      ? await deps.db.query<{ id: string; goal_id: string | null }>(
          `select id, goal_id from buddy_steps
            where learner_id = $1 and kind = 'capture' and state = 'planned' limit 2`,
          [learner.id],
        )
      : [];
  const captureStep = step ?? (asked.length === 1 ? asked[0]! : null);
  // Pages photographed again for an earlier material keep its goal and purpose.
  // `id`: the notice answered (this material); `root`: the sheet the pages join.
  const completes = input.completes
    ? await deps.db.maybeOne<{
        id: string;
        root: string;
        goal_id: string | null;
        purpose: 'study' | 'homework';
      }>(
        `select m.id, coalesce(m.merged_into, m.id) as root, r.goal_id, r.purpose
           from materials m join materials r on r.id = coalesce(m.merged_into, m.id)
          where m.id = $1 and m.learner_id = $2 and m.archived_at is null and r.archived_at is null`,
        [input.completes, learner.id],
      )
    : null;
  if (input.completes && !completes) throw new AppError('not_found', 'Material not found');
  const goalId = input.goal_id ?? captureStep?.goal_id ?? completes?.goal_id ?? null;
  const purpose = completes?.purpose ?? input.purpose;
  const goal = goalId
    ? await deps.db.maybeOne<{ subject_id: string | null }>(
        `select subject_id from buddy_goals where id = $1 and learner_id = $2`,
        [goalId, learner.id],
      )
    : null;
  if (goalId && !goal) throw new AppError('not_found', 'Goal not found');
  const material = await deps.db.tx(async (tx) => {
    const existing = await tx.maybeOne<{ id: string; archived_at: Date | null }>(
      `select id, archived_at from materials where learner_id = $1 and client_request_id = $2
        for update`,
      [learner.id, input.client_request_id],
    );
    if (existing && !existing.archived_at) return existing.id;
    if (existing) {
      // The earlier send was given up (photos never all arrived within a day) or its sheet
      // was deleted: the photos still on her phone become a new sheet, never an endless
      // "Das gibt es nicht mehr" (audit H-13). The old row gives up the request id (a new
      // random one: the column is required and nothing else knows it).
      await tx.query(`update materials set client_request_id = gen_random_uuid() where id = $1`, [
        existing.id,
      ]);
    }
    // One row per client request id, also when two sends race: the loser of the insert
    // waits for the winner and answers with its material (create-material-idempotency-race).
    const row = await tx.maybeOne<{ id: string }>(
      `insert into materials (learner_id, client_request_id, goal_id, step_id, subject_id, photo_count,
                              created_at, purpose, completes_material_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (learner_id, client_request_id) do nothing
       returning id`,
      [
        learner.id,
        input.client_request_id,
        goalId,
        captureStep?.id ?? null,
        goal?.subject_id ?? null,
        input.photo_mimes.length,
        deps.now(),
        purpose,
        completes?.root ?? null,
      ],
    );
    if (!row) {
      const existing = await tx.one<{ id: string }>(
        `select id from materials where learner_id = $1 and client_request_id = $2`,
        [learner.id, input.client_request_id],
      );
      return existing.id;
    }
    if (completes) {
      // The notice about the missing pages has been answered.
      await tx.query(
        `update materials set pages_resolved_at = coalesce(pages_resolved_at, $2) where id = $1`,
        [completes.id, deps.now()],
      );
      await bumpContext(tx, learner.id);
    }
    for (const [position, mime] of input.photo_mimes.entries()) {
      const ext = mime === 'image/png' ? 'png' : mime === PDF_MIME ? 'pdf' : 'jpg';
      await tx.query(
        `insert into material_photos (material_id, position, storage_path, mime) values ($1, $2, $3, $4)`,
        [row.id, position, `${learner.account_id}/${row.id}/${position}.${ext}`, mime],
      );
    }
    return row.id;
  });
  // "Senden" (issue #56): from now on these pages are on their way, so the home may say so.
  if (input.sending)
    await deps.db.query(
      `update materials set send_requested_at = coalesce(send_requested_at, $2) where id = $1`,
      [material, deps.now()],
    );

  // Pages she took after the reservation (issue #56: every page goes up as soon as it is
  // ready, so sending only has to finish). The same request id, more mimes: the missing
  // positions are added as long as nothing has been submitted. Fewer or changed pages are
  // not an extension — the app gives that reservation up and starts a new one.
  await deps.db.tx(async (tx) => {
    const m = await tx.one<{ status: string; photo_count: number }>(
      `select status, photo_count from materials where id = $1 for update`,
      [material],
    );
    if (m.status !== 'awaiting_upload' || input.photo_mimes.length <= m.photo_count) return;
    for (const [position, mime] of input.photo_mimes.entries()) {
      if (position < m.photo_count) continue;
      const ext = mime === 'image/png' ? 'png' : mime === PDF_MIME ? 'pdf' : 'jpg';
      await tx.query(
        `insert into material_photos (material_id, position, storage_path, mime)
         values ($1, $2, $3, $4) on conflict (material_id, position) do nothing`,
        [material, position, `${learner.account_id}/${material}/${position}.${ext}`, mime],
      );
    }
    await tx.query(`update materials set photo_count = $2 where id = $1`, [
      material,
      input.photo_mimes.length,
    ]);
  });

  const view = await materialView(deps.db, learner.id, material);
  // A repeated request after the photos went through has nothing left to upload.
  const photos =
    view.status === 'awaiting_upload'
      ? await deps.db.query<{ position: number; storage_path: string }>(
          `select position, storage_path from material_photos where material_id = $1 order by position`,
          [material],
        )
      : [];
  const uploads = [];
  for (const p of photos) {
    const target = await deps.storage.createUploadTarget(p.storage_path);
    uploads.push({
      position: p.position,
      path: p.storage_path,
      url: target.url,
      token: target.token,
    });
  }
  return { material: view, uploads };
}

/** "Passt so": the missing pages are fine as they are; the notice ends. Idempotent. */
export async function acceptMissingPages(
  deps: Deps,
  learnerId: string,
  materialId: string,
): Promise<void> {
  await deps.db.tx(async (tx) => {
    const m = await tx.maybeOne<{ pages_resolved_at: Date | null }>(
      `select pages_resolved_at from materials
        where id = $1 and learner_id = $2 and archived_at is null for update`,
      [materialId, learnerId],
    );
    if (!m) throw new AppError('not_found', 'Material not found');
    if (m.pages_resolved_at) return;
    await tx.query(`update materials set pages_resolved_at = $2 where id = $1`, [
      materialId,
      deps.now(),
    ]);
    await bumpContext(tx, learnerId);
  });
}
