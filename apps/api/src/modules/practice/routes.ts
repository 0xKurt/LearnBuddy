// Practice HTTP surface. docs/architecture.md §Practice.

import {
  AnswerRequest,
  SpeakRequest,
  StartPracticeRequest,
  StartTopicRequest,
  Uuid,
} from '@learnbuddy/shared-types/contracts';
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
import { runLearnerJobs } from '../buddy/check.js';
import { startTopic } from './generate.js';
import {
  answerItem,
  finishSession,
  flagItem,
  revealItem,
  sessionView,
  startManual,
} from './service.js';
import { speakItem } from './speak.js';

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

/** "Frage passt nicht": out of this session (skipped, no FSRS) and out of future practice. */
practiceRoutes.post('/sessions/:id/items/:itemId/flag', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const itemId = check(Uuid, c.req.param('itemId'));
  return c.json(await flagItem(depsOf(c), c.get('learner').id, sessionId, itemId));
});

practiceRoutes.post('/sessions/:id/finish', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  const learnerId = c.get('learner').id;
  const view = await finishSession(deps, learnerId, sessionId);
  // Buddy plans what comes next now instead of on the next scheduler run.
  deps.background(async () => {
    await runLearnerJobs(deps, learnerId);
  });
  return c.json(view);
});

// Learning from something the learner named or typed (no photo).
practiceRoutes.post('/topic', async (c) => {
  const input = await readBody(c, StartTopicRequest);
  const deps = depsOf(c);
  const learner = c.get('learner');
  const id = await startTopic(deps, learner, input);
  return c.json(await sessionView(deps.db, learner.id, id), 201);
});

practiceRoutes.post('/sessions/:id/speak', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, SpeakRequest);
  return c.json(await speakItem(depsOf(c), c.get('learner'), sessionId, input));
});
