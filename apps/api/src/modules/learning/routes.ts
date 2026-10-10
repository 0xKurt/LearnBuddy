// The learning domain's taps on Buddy's surface (/buddy/…): starting a prepared practice, her
// answer to a proposed deletion of a sheet, ending a roleplay, a recorded rehearsal. Mounted at
// /buddy behind Buddy's guards by modules/learning/register.ts (issue #107); the core never
// names them. docs/architecture.md §API.

import {
  AnswerConfirmationRequest,
  type EndRoleplayResponse,
  RehearseRequest,
  type RehearseResponse,
  Uuid,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import { depsOf, type AppEnv } from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { AppError } from '../../lib/errors.js';
import { bumpContext } from '../buddy/plan.js';
import { rehearse } from '../buddy/rehearse.js';
import { endRoleplayByTap } from '../buddy/roleplay.js';
import { home, underContext } from '../buddy/routes.js';
import { archiveMaterial, archiveMaterialItem } from '../materials/archive.js';
import { startFromStep } from '../practice/service.js';
import { sessionView } from '../practice/sessionView.js';

export const learningBuddyRoutes = new Hono<AppEnv>();

// She ends the roleplay with the card's button (issue #244): with turns played, the checked
// feedback lands in the thread; another learner's id is 404, an ended one 409.
learningBuddyRoutes.post('/roleplays/:id/end', async (c) => {
  const id = check(Uuid, c.req.param('id'));
  const l = c.get('learner');
  await endRoleplayByTap(depsOf(c), l, id);
  const body: EndRoleplayResponse = { home: await home(c) };
  return c.json(body);
});

// She recorded on Buddy's rehearsal card (issue #264): the recording is measured, never kept, and
// the result lands in the thread as his message. Another learner's card is 404; the same recording
// sent twice is one rehearsal.
learningBuddyRoutes.post('/rehearsals', async (c) => {
  const input = await readBody(c, RehearseRequest);
  const rehearsal = await rehearse(depsOf(c), c.get('learner'), input);
  const body: RehearseResponse = { rehearsal, home: await home(c) };
  return c.json(body);
});

learningBuddyRoutes.post('/steps/:id/start', async (c) => {
  const stepId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const sessionId = await startFromStep(deps, learnerId, stepId);
  // The session comes along: the app shows its first question at once (gaps.md #2).
  return c.json({
    session_id: sessionId,
    session: await sessionView(deps.db, learnerId, sessionId, deps.storage, deps.now()),
  });
});

/**
 * Her answer to a proposed deletion (issue #151). The tap is the consent — the model only
 * ever proposed, and nothing was deleted while this card waited.
 *
 * Bound to exactly this proposal: one answer, within its window, on an object that has not
 * changed underneath it. A second tap answers nothing (the row is no longer open), and a
 * card left over from last week has expired.
 */
learningBuddyRoutes.post('/confirmations/:id', async (c) => {
  const pendingId = check(Uuid, c.req.param('id'));
  const input = check(AnswerConfirmationRequest, await c.req.json());
  await underContext(c, async (tx, learnerId, now) => {
    const pending = await tx.maybeOne<{
      id: string;
      operation: 'delete_material' | 'delete_item';
      material_id: string;
      item_id: string | null;
      status: string;
      expires_at: Date;
    }>(
      `select id, operation, material_id, item_id, status, expires_at
         from buddy_pending_actions where id = $1 and learner_id = $2 for update`,
      [pendingId, learnerId],
    );
    if (!pending) throw new AppError('not_found', 'Nothing to answer');
    if (pending.status !== 'open')
      throw new AppError('conflict', 'This was answered already', { reason: 'already_answered' });
    if (pending.expires_at.getTime() <= now.getTime()) {
      await tx.query(
        `update buddy_pending_actions set status = 'expired', decided_at = $2 where id = $1`,
        [pendingId, now],
      );
      throw new AppError('conflict', 'This question is too old to answer now', {
        reason: 'expired',
      });
    }
    if (!input.confirm) {
      await tx.query(
        `update buddy_pending_actions set status = 'declined', decided_at = $2 where id = $1`,
        [pendingId, now],
      );
      return;
    }
    // The same erasure the library button plans, not a second half-done path.
    const inTx = { db: tx, now: () => now };
    if (pending.operation === 'delete_material') {
      await archiveMaterial(inTx, learnerId, pending.material_id);
    } else if (pending.item_id) {
      await archiveMaterialItem(inTx, learnerId, pending.material_id, pending.item_id);
    }
    await tx.query(
      `update buddy_pending_actions set status = 'confirmed', decided_at = $2 where id = $1`,
      [pendingId, now],
    );
    await bumpContext(tx, learnerId);
  });
  return c.json(await home(c));
});
