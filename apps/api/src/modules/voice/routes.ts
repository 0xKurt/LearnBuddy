// Voice HTTP surface. docs/architecture.md §Voice.

import {
  SpeechPrepareRequest,
  SpeechRequest,
  TranscribeRequest,
} from '@learnbuddy/shared-types/contracts';
import { Hono } from 'hono';

import {
  depsOf,
  requireAccount,
  requireLearner,
  requireUser,
  type AppEnv,
} from '../../http/context.js';
import { streamed, wantsStream } from '../../http/stream.js';
import { check, readBody } from '../../http/validate.js';
import { consume, limitError } from '../../lib/limits.js';
import { transcribe } from './service.js';
import { speechSettings, synthesizeSpeech } from './speech.js';
import { streamSpeech } from './speech-stream.js';
import { AppError } from '../../lib/errors.js';

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
  // A dictation nobody reads any more is stopped with its stream (#684).
  return streamed(c, 'progress', (emit, signal) => transcribe(deps, learner, input, emit, signal));
});

/** Buddy's natural voice: one sentence → audio (ADR 0008). */
voiceRoutes.post('/speech', async (c) => {
  const input = await readBody(c, SpeechRequest);
  if ((c.req.header('accept') ?? '').includes('audio/')) return streamSpeech(c, input);
  return c.json(
    await synthesizeSpeech(
      depsOf(c),
      { accountId: c.get('account').id, learnerId: c.get('learner').id },
      input,
    ),
  );
});

/** Native media players make GET requests; private text and credentials stay out of URLs. */
voiceRoutes.get('/speech', async (c) => {
  let raw: unknown;
  const header = c.req.header('x-speech-request');
  if (!header || header.length > 12_000)
    throw new AppError('invalid_input', 'Missing speech request');
  try {
    raw = JSON.parse(decodeURIComponent(header));
  } catch {
    throw new AppError('invalid_input', 'Invalid speech request');
  }
  return streamSpeech(c, check(SpeechRequest, raw));
});

// Wakes a bounded connection while the reply is still being written. No paid generation.
voiceRoutes.post('/speech/prepare', async (c) => {
  const input = await readBody(c, SpeechPrepareRequest);
  const deps = depsOf(c);
  if (!deps.speech.prepare) return c.json({ ready: false });
  const budget = await consume(deps.db, 'speech', c.get('account').id, deps.now());
  if (!budget.allowed) throw limitError(budget);
  const settings = await speechSettings(deps, c.get('learner').id, input);
  await deps.speech.prepare({
    ...settings,
    sessionKey: c.get('learner').id,
    timeoutMs: 5000,
    signal: c.req.raw.signal,
  });
  return c.json({ ready: true });
});
