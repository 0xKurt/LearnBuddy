// Practice HTTP surface. docs/architecture.md §Practice.

import {
  AnswerRequest,
  HintRequest,
  ReexplainRequest,
  SpeakRequest,
  StartPracticeRequest,
  StartTopicRequest,
  Uuid,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { check, readBody } from '../../http/validate.js';
import { isAppError } from '../../lib/errors.js';
import { runLearnerJobs } from '../buddy/check.js';
import { startTopic } from './generate.js';
import { prepareHints } from './hints.js';
import { reexplain } from './reexplain.js';
import {
  answerItem,
  deferItem,
  finishSession,
  flagItem,
  hintItem,
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
  return c.json(await sessionView(deps.db, learnerId, id, deps.storage), 201);
});

practiceRoutes.get('/sessions/:id', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const deps = depsOf(c);
  return c.json(await sessionView(deps.db, c.get('learner').id, sessionId, deps.storage));
});

practiceRoutes.post('/sessions/:id/answer', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, AnswerRequest);
  return c.json(await answerItem(depsOf(c), c.get('learner'), sessionId, input));
});

practiceRoutes.post('/sessions/:id/hint', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, HintRequest);
  return c.json(await hintItem(depsOf(c), c.get('learner'), sessionId, input));
});

/** "Anders erklären": a new explanation after the explanation or a closed question's solution. */
practiceRoutes.post('/sessions/:id/reexplain', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, ReexplainRequest);
  return c.json(await reexplain(depsOf(c), c.get('learner'), sessionId, input));
});

practiceRoutes.post('/sessions/:id/reveal', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const { item_id } = await readBody(c, z.object({ item_id: Uuid }));
  return c.json(await revealItem(depsOf(c), c.get('learner').id, sessionId, item_id));
});

/** Homework help "Später": the task stays open and comes back after the others. */
practiceRoutes.post('/sessions/:id/items/:itemId/defer', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const itemId = check(Uuid, c.req.param('itemId'));
  return c.json(await deferItem(depsOf(c), c.get('learner').id, sessionId, itemId));
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
  // Hints for the new questions, while she reads the first one. Best effort: if this
  // never runs, the tutor model helps as before (hints.ts).
  if (input.kind === 'practice' || input.kind === 'explain') {
    deps.background(async () => {
      await prepareHints(deps, learner, id).catch(() => 0);
    });
  }
  return c.json(await sessionView(deps.db, learner.id, id, deps.storage), 201);
});

// The judgement while the model is still listening (issue #8): `progress` events
// colour the words one by one, the `done` event carries the stored result. Without
// `Accept: text/event-stream` the same call answers with plain JSON.
practiceRoutes.post('/sessions/:id/speak', async (c) => {
  const sessionId = check(Uuid, c.req.param('id'));
  const input = await readBody(c, SpeakRequest);
  const learner = c.get('learner');
  const deps = depsOf(c);
  if (!(c.req.header('accept') ?? '').includes('text/event-stream'))
    return c.json(await speakItem(deps, learner, sessionId, input));
  return streamSSE(c, async (stream) => {
    // Errors are answered here, as a code only: nothing internal reaches the app.
    try {
      let sent = Promise.resolve();
      const answer = await speakItem(deps, learner, sessionId, input, (event) => {
        sent = sent.then(() => stream.writeSSE({ event: 'progress', data: JSON.stringify(event) }));
      });
      await sent;
      await stream.writeSSE({ event: 'done', data: JSON.stringify(answer) });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ code: isAppError(err) ? err.code : 'internal' }),
      });
    }
  });
});
