// What the conversation says about her sheets (issue #632): her message for a sheet she sent, with
// where its reading stands now, and the start of the practice Buddy's background message
// announces. Both are read from the rows that decide them every time the thread is read — the
// message itself stores nothing but the material it points at (migration 0106), so it can never
// say more than the material does (CLAUDE.md rule 5).

import type { AnnouncedPractice, SheetMessage } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import type { ThreadPage } from '../buddy/provider.js';
import { minutesFor } from '../practice/selection.js';

type Stage = SheetMessage['stage'];

type SheetRow = {
  id: string;
  status: 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed';
  read_stage: 'opening' | 'reading' | null;
  photo_count: number;
  archived: boolean;
  /** A reading run for it is queued or running. */
  reading: boolean;
  /** Read, and the check its reading woke is making practice from it right now. */
  building: boolean;
};

/** Where a sheet stands, from its row; null where nothing alive is working on it. */
export function sheetStage(r: Omit<SheetRow, 'id' | 'photo_count'>): Stage {
  if (r.status === 'failed') return 'failed';
  if (r.archived) return 'deleted';
  if (r.status === 'ready') return r.building ? 'building' : 'ready';
  // Queued or being read, but no run alive: "Buddy liest" would be a claim nothing makes true.
  if ((r.status === 'queued' || r.status === 'processing') && r.reading)
    return r.status === 'processing' && r.read_stage === 'reading' ? 'reading' : 'waiting';
  return null;
}

/** Her sheet messages on this page, by message id. */
export async function sheetMessages(
  db: Db,
  learnerId: string,
  page: ThreadPage,
  now: Date,
): Promise<Map<string, SheetMessage>> {
  const ids = page.messages.flatMap((m) => (m.material_id ? [m.material_id] : []));
  if (ids.length === 0) return new Map();
  const rows = await db.query<SheetRow>(
    `select m.id, m.status, m.read_stage, m.photo_count, m.archived_at is not null as archived,
            exists (select 1 from jobs j
                     where j.learner_id = $1 and j.kind = 'extract_material'
                       and j.payload ->> 'material_id' = m.id::text
                       and j.status in ('queued', 'running')) as reading,
            exists (select 1 from buddy_events e
                      join jobs j on j.learner_id = $1 and j.kind = 'buddy_check'
                                 and j.status in ('queued', 'running')
                                 and j.payload ->> 'event_id' = e.id::text
                                 and j.run_at <= $3::timestamptz + interval '1 minute'
                     where e.learner_id = $1 and e.type = 'material_ready' and e.ref_id = m.id)
              as building
       from materials m
      where m.learner_id = $1 and m.id = any($2::uuid[])`,
    [learnerId, ids, now],
  );
  const byMaterial = new Map(rows.map((r) => [r.id, r]));
  const out = new Map<string, SheetMessage>();
  for (const m of page.messages) {
    const r = m.material_id ? byMaterial.get(m.material_id) : undefined;
    if (!r) continue;
    out.set(m.id, {
      material_id: r.id,
      pages: Math.max(1, r.photo_count),
      stage: sheetStage(r),
    });
  }
  return out;
}

/**
 * The practice each of Buddy's background messages on this page announces, while it still waits
 * (issue #632): "Neues Arbeitsblatt bereit … jederzeit eine kleine Übung dazu starten" stood with
 * nothing to tap — the check had prepared the practice, and its start lay only in the bar on top,
 * if at all. Code picks it, never the words: the step the message is linked to, or the practice
 * the same decision prepared. Started, done or replaced since: nothing to start, no card.
 */
export async function announcedPractice(
  db: Db,
  learnerId: string,
  page: ThreadPage,
): Promise<Map<string, AnnouncedPractice>> {
  const background = page.messages.filter((m) => m.outreach_id !== null);
  if (background.length === 0) return new Map();
  const links = await db.query<{ id: string; step_id: string | null }>(
    `select id, step_id from buddy_outreach where learner_id = $1 and id = any($2::uuid[])`,
    [learnerId, background.map((m) => m.outreach_id)],
  );
  const candidates = new Map<string, string[]>();
  for (const m of background) {
    const linked = links.find((o) => o.id === m.outreach_id)?.step_id ?? null;
    const own = page.actions.filter((a) => a.decision_id === m.decision_id);
    // Already shown with its start by the decision itself.
    if (own.some((a) => a.result.tool === 'show_ready')) continue;
    const prepared = own.flatMap((a) =>
      a.status === 'applied' && a.result.tool === 'prepare_practice' ? [a.result.step_id] : [],
    );
    const steps = [...(linked ? [linked] : []), ...prepared];
    if (steps.length > 0) candidates.set(m.id, steps);
  }
  const all = [...new Set([...candidates.values()].flat())];
  if (all.length === 0) return new Map();
  const waiting = await db.query<{
    id: string;
    title: string;
    payload: { item_ids?: string[]; est_minutes?: number };
  }>(
    `select id, title, payload from buddy_steps
      where learner_id = $1 and id = any($2::uuid[]) and kind = 'practice' and state = 'prepared'`,
    [learnerId, all],
  );
  const out = new Map<string, AnnouncedPractice>();
  for (const [messageId, steps] of candidates) {
    const step = steps.map((id) => waiting.find((w) => w.id === id)).find((w) => w !== undefined);
    if (!step) continue;
    const count = step.payload.item_ids?.length ?? 0;
    out.set(messageId, {
      step_id: step.id,
      title: step.title,
      question_count: count,
      est_minutes: step.payload.est_minutes ?? minutesFor(count),
    });
  }
  return out;
}
