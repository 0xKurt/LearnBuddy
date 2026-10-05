// Voice HTTP surface. docs/architecture.md §Voice.

import { SpeechRequest, TranscribeRequest } from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { streamed, wantsStream } from '../../http/stream.js';
import { readBody } from '../../http/validate.js';
import { transcribe } from './service.js';
import { synthesizeSpeech } from './speech.js';

export const voiceRoutes = new Hono<AppEnv>();
voiceRoutes.use('*', requireUser, requireAccount, requireLearner);

// The words while the model is still listening (issue #9): `progress` events carry what
// is written down so far, the `done` event the text that is sent off. Without
// `Accept: text/event-stream` the same call answers with plain JSON.
voiceRoutes.post('/transcribe', async (c) => {
  const input = await readBody(c, TranscribeRequest);
  const deps = depsOf(c);
  const learner = c.get('learner');
  if (!wantsStream(c)) return c.json(await transcribe(deps, learner, input));
  return streamed(c, 'progress', (emit) => transcribe(deps, learner, input, emit));
});

/** Buddy's natural voice: one sentence → audio (ADR 0008). */
voiceRoutes.post('/speech', async (c) => {
  const input = await readBody(c, SpeechRequest);
  return c.json(
    await synthesizeSpeech(
      depsOf(c),
      { accountId: c.get('account').id, learnerId: c.get('learner').id },
      input,
    ),
  );
});
