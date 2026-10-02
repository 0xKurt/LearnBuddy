// Voice HTTP surface. docs/architecture.md §Voice.

import {
  RehearseRequest,
  SpeechRequest,
  TranscribeRequest,
  Uuid,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { readBody } from '../../http/validate.js';
import { isAppError } from '../../lib/errors.js';
import { AppError } from '../../lib/errors.js';
import { rehearsalBrief, rehearse } from './rehearse.js';
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
  if (!(c.req.header('accept') ?? '').includes('text/event-stream'))
    return c.json(await transcribe(deps, learner, input));
  return streamSSE(c, async (stream) => {
    // Errors are answered here, as a code only: nothing internal reaches the app.
    try {
      let sent = Promise.resolve();
      const answer = await transcribe(deps, learner, input, (event) => {
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

/**
 * A rehearsal talk or a read-aloud (issue #264): what the recorder shows before she starts, and
 * the recording itself, measured. The offer she tapped is the only source of the text and the
 * talk; the app sends its id and the recording, nothing else.
 */
voiceRoutes.get('/rehearse/:action', async (c) => {
  const id = Uuid.safeParse(c.req.param('action'));
  if (!id.success) throw new AppError('not_found', 'Rehearsal not found');
  return c.json(await rehearsalBrief(depsOf(c), c.get('learner').id, id.data));
});

voiceRoutes.post('/rehearse', async (c) => {
  const input = await readBody(c, RehearseRequest);
  return c.json(await rehearse(depsOf(c), c.get('learner'), input));
});
