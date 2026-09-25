// Voice HTTP surface. docs/architecture.md §Voice.

import { TranscribeRequest } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { readBody } from '../../http/validate.js';
import { transcribe } from './service.js';

export const voiceRoutes = new Hono<AppEnv>();
voiceRoutes.use('*', requireUser, requireAccount, requireLearner);

voiceRoutes.post('/transcribe', async (c) => {
  const input = await readBody(c, TranscribeRequest);
  return c.json(await transcribe(depsOf(c), c.get('learner'), input));
});
