// Material HTTP surface. docs/architecture.md §Material.

import {
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
  type AppEnv,
} from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { runQueuedExtraction } from '../scheduler/tick.js';
import {
  acceptMissingPages,
  archiveMaterial,
  archiveMaterialItem,
  createMaterial,
  libraryView,
  materialItems,
  materialView,
  renameMaterial,
  retryMaterial,
  submitMaterial,
} from './service.js';

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

/** Photos are uploaded: verify, queue the reading, and start it right away. */
materialRoutes.post('/:id/submit', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const { jobId } = await submitMaterial(deps, learnerId, materialId);
  if (jobId) deps.background(() => runQueuedExtraction(deps, learnerId));
  return c.json(await materialView(deps.db, learnerId, materialId), 202);
});

materialRoutes.post('/:id/retry', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const { jobId } = await retryMaterial(deps, learnerId, materialId);
  if (jobId) deps.background(() => runQueuedExtraction(deps, learnerId));
  return c.json(await materialView(deps.db, learnerId, materialId), 202);
});

/** "Passt so": the pages Buddy could not read are fine as they are. */
materialRoutes.post('/:id/pages-ok', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  await acceptMissingPages(deps, learnerId, materialId);
  return c.json(await materialView(deps.db, learnerId, materialId));
});

materialRoutes.delete('/:id', async (c) => {
  const materialId = check(Uuid, c.req.param('id'));
  await archiveMaterial(depsOf(c), c.get('learner').id, materialId);
  return c.body(null, 204);
});
