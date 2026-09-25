// Practice HTTP surface. docs/architecture.md §Practice.

import { AnswerRequest, StartPracticeRequest, Uuid } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';
import { z } from 'zod';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { answerItem, finishSession, revealItem, sessionView, startManual } from './service.js';

export const practiceRoutes = new Hono<AppEnv>();
practiceRoutes.use('*', requireUser, requireAccount, requireLearner);

practiceRoutes.post('/sessions', async (c) => {
  const input = await readBody(c, StartPracticeRequest);
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const id = await startManual(
    deps,
    learnerId,
    {
      subjectId: input.subject_id ?? null,
      materialId: input.material_id ?? null,
      goalId: input.goal_id ?? null,
    },
    input.mode,
  );
  return c.json(await sessionView(deps.db, learnerId, id), 201);
});

practiceRoutes.get('/sessions/:id', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  return c.json(await sessionView(depsOf(c).db, c.get('learner').id, sessionId));
});

practiceRoutes.post('/sessions/:id/answer', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, AnswerRequest);
  return c.json(await answerItem(depsOf(c), c.get('learner'), sessionId, input));
});

practiceRoutes.post('/sessions/:id/reveal', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const { item_id } = await readBody(c, z.object({ item_id: Uuid }));
  return c.json(await revealItem(depsOf(c), c.get('learner').id, sessionId, item_id));
});

practiceRoutes.post('/sessions/:id/finish', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  return c.json(await finishSession(depsOf(c), c.get('learner').id, sessionId));
});
