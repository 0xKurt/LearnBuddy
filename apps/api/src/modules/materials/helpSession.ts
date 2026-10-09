// Homework questions go into the help session she works in. docs/architecture.md §Material.

import type { Db } from '../../lib/db.js';
import { createSession } from '../practice/service.js';

/**
 * New questions of a homework sheet belong in the help session she is working in (hints only,
 * never the solution). `joinOpen`: pages added to a sheet, and a task she settled afterwards
 * (issue #164), join the session that is still open — a question nobody can reach would be no
 * answer at all. A first reading has nothing to join and starts the session.
 */
export async function intoHelpSession(
  tx: Db,
  o: {
    learnerId: string;
    sheetId: string;
    goalId: string | null;
    title: string | null;
    itemIds: string[];
    now: Date;
    joinOpen: boolean;
  },
): Promise<void> {
  if (o.itemIds.length === 0) return;
  const open = o.joinOpen
    ? await tx.maybeOne<{ id: string; next: number }>(
        `select ps.id, coalesce(max(si.position) + 1, 0)::int as next
           from practice_sessions ps left join session_items si on si.session_id = ps.id
          where ps.material_id = $1 and ps.status = 'active'
          group by ps.id order by ps.started_at desc, ps.seq desc limit 1`,
        [o.sheetId],
      )
    : null;
  if (open) {
    for (const [i, itemId] of o.itemIds.entries()) {
      await tx.query(
        `insert into session_items (session_id, item_id, position) values ($1, $2, $3)`,
        [open.id, itemId, open.next + i],
      );
    }
    await tx.query(`update practice_sessions set last_activity_at = $2 where id = $1`, [
      open.id,
      o.now,
    ]);
    return;
  }
  await createSession(
    tx,
    o.learnerId,
    o.itemIds,
    {
      mode: 'help',
      stepId: null,
      goalId: o.goalId,
      materialId: o.sheetId,
      title: o.title,
      clientRequestId: null,
    },
    o.now,
  );
}
