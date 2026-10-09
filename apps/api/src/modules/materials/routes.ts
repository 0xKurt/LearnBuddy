// Material HTTP surface. docs/architecture.md §Material.

import {
  ClarifyUnclearRequest,
  CreateMaterialRequest,
  RenameMaterialRequest,
  Uuid,
  type CreateMaterialResponse,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppContext,
  type AppEnv,
} from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { runQueuedExtraction } from '../scheduler/tick.js';
import { archiveMaterial, archiveMaterialItem } from './archive.js';
import { acceptMissingPages, createMaterial } from './create.js';
import { libraryView, renameMaterial } from './library.js';
import { retryMaterial, submitMaterial } from './submit.js';
import { clarifyUnclearSpot } from './unclear.js';
import { materialView } from './view.js';
import { materialItems } from './questions.js';

export const materialRoutes = new Hono<AppEnv>();
materialRoutes.use('*', requireUser, requireAccount, requireLearner);

materialRoutes.get('/', async (c) => c.json(await libraryView(depsOf(c).db, c.get('learner').id)));

materialRoutes.post('/', async (c) => {
  const input = await readBody(c, CreateMaterialRequest);
  const learner = c.get('learner');
  const body: CreateMaterialResponse = await createMaterial(depsOf(c), learner, input);
  return c.json(body, 201);
});

materialRoutes.get('/:id', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  return c.json(await materialView(depsOf(c).db, c.get('learner').id, materialId));
});

/** The learner renames it. */
materialRoutes.patch('/:id', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const { title } = await readBody(c, RenameMaterialRequest);
  return c.json(await renameMaterial(depsOf(c), c.get('learner').id, materialId, title));
});

/** Her questions from this material, with how each went last — never the solution. */
materialRoutes.get('/:id/items', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  return c.json(await materialItems(depsOf(c).db, c.get('learner').id, materialId));
});

/** A bad question is taken out (archived); idempotent. */
materialRoutes.delete('/:materialId/items/:itemId', async (c) => {
  const materialId = check(Uuid, c.req.param('materialId'));
  const itemId = check(Uuid, c.req.param('itemId'));
  await archiveMaterialItem(depsOf(c), c.get('learner').id, materialId, itemId);
  return c.body(null, 204);
});

/**
 * Queue a reading with `queue` and start it right away. The answer is the state this request
 * left (queued), read before the reading starts: otherwise it depends on how far the background
 * work got (flaky 'processing').
 */
async function queueReading(c: AppContext, queue: typeof submitMaterial): Promise<Response> {
  const materialId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const { jobId } = await queue(deps, learnerId, materialId);
  const view = await materialView(deps.db, learnerId, materialId);
  if (jobId) deps.background(() => runQueuedExtraction(deps, learnerId));
  return c.json(view, 202);
}

/** Photos are uploaded: verify, queue the reading, and start it right away. */
materialRoutes.post('/:id/submit', (c) => queueReading(c, submitMaterial));

materialRoutes.post('/:id/retry', (c) => queueReading(c, retryMaterial));

/** "Passt so": the pages Buddy could not read are fine as they are. */
materialRoutes.post('/:id/pages-ok', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  await acceptMissingPages(deps, learnerId, materialId);
  return c.json(await materialView(deps.db, learnerId, materialId));
});

/**
 * Her answer to one spot the reading could not settle (issue #164 point 1): the reading she
 * confirms, or "weiß ich nicht". The question for that task is written from HER reading — one
 * more look at the same photos, started right away like a submit, so she is not left waiting on
 * the next scheduler run.
 */
materialRoutes.post('/:id/unclear', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, ClarifyUnclearRequest);
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const { view, jobId } = await clarifyUnclearSpot(deps, learnerId, materialId, input);
  if (jobId) deps.background(() => runQueuedExtraction(deps, learnerId));
  return c.json(view, 202);
});

materialRoutes.delete('/:id', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  await archiveMaterial(depsOf(c), c.get('learner').id, materialId);
  return c.body(null, 204);
});
