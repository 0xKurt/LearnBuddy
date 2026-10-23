// Work only a dropped stream would read stops with it (issue #684, KI-Audit K12 / E-F6): the
// pronunciation judgement and the dictation end their model call when she is gone, recorded as
// `cancelled`; a recording sent again while its first judgement still runs joins that run — one
// model call, one result. Only the model is scripted.
// requires live verification in Claude Code session (needs a running Postgres)

import type { AnswerResponse, SessionView } from '@learnbuddy/shared-types/contracts';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmRequest } from '../llm/gateway.js';
import { scriptPronunciationTip } from '../testing/pronunciation.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';
import { gate } from '../testing/sync.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');
const SENTENCE = "Je m'appelle Lena.";

const judgement = {
  audible: true,
  heard: "Je m'appelle Lena",
  words: [
    { heard: 'Je', confidence: 1 },
    { heard: "m'appelle", confidence: 1 },
    { heard: 'Lena', confidence: 1 },
  ],
};

/** A scripted model that never finishes by itself, and notes when the caller stops waiting. */
function neverDone(seen: { aborted: boolean }) {
  return (req: LlmRequest) => {
    req.signal?.addEventListener('abort', () => {
      seen.aborted = true;
    });
    return new Promise(() => undefined);
  };
}

describe.skipIf(!dbReady)('a dropped stream stops the work only it would read (#684)', () => {
  let env: TestEnv;
  let l: Learner;
  let sessionId: string;
  let itemId: string;

  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    env.llm.script('explain', {
      json: {
        usable: true,
        title: 'Französisch sprechen',
        subject: { name: 'Französisch', kind: 'french' },
        items: [
          {
            kind: 'speak',
            prompt: SENTENCE,
            answer: SENTENCE,
            accepted_answers: [],
            unit: null,
            choices: null,
            correct_choice: null,
            topic: 'Vorstellen',
            difficulty: 2,
            prompt_lang: 'fr',
            lang: 'fr',
            figure: null,
            source_excerpt: null,
          },
        ],
      },
    });
    const s = await l.api.post<SessionView>('/practice/topic', {
      client_request_id: randomUUID(),
      kind: 'speak',
      text: SENTENCE,
    });
    sessionId = s.body.id;
    itemId = s.body.items[0]!.item.id;
  });
  afterEach(() => env.closeChecked());

  const post = (path: string, body: unknown, stream: boolean) =>
    env.app.request(`/v1${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${l.token}`,
        'content-type': 'application/json',
        ...(stream ? { accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify(body),
    });

  /** Opens the stream, then goes away like a phone that lost its connection. */
  async function dropAfterStart(path: string, body: unknown, started: Promise<void>) {
    const res = await post(path, body, true);
    await started;
    await res.body?.cancel();
  }

  const callsOf = (purpose: string) =>
    env.db.query<{ outcome: string; error_code: string | null }>(
      `select outcome, error_code from llm_calls where learner_id = $1 and purpose = $2`,
      [l.learnerId, purpose],
    );

  it('ends the pronunciation judgement when she is gone, recorded as cancelled', async () => {
    const seen = { aborted: false };
    const started = gate();
    env.llm.script('pronounce', (req: LlmRequest) => {
      started.markCalled();
      return neverDone(seen)(req);
    });
    await dropAfterStart(
      `/practice/sessions/${sessionId}/speak`,
      { client_turn_id: randomUUID(), item_id: itemId, mime: 'audio/m4a', audio_base64: audio },
      started.called,
    );
    await env.flushBackground();
    await expect.poll(() => seen.aborted).toBe(true);
    await expect
      .poll(() => callsOf('pronounce'))
      .toEqual([{ outcome: 'error', error_code: 'cancelled' }]);
  });

  it('ends the dictation when she is gone', async () => {
    const seen = { aborted: false };
    const started = gate();
    env.llm.script('transcribe', (req: LlmRequest) => {
      started.markCalled();
      return neverDone(seen)(req);
    });
    await dropAfterStart(
      '/voice/transcribe',
      { mime: 'audio/m4a', audio_base64: audio, purpose: 'message' },
      started.called,
    );
    await expect.poll(() => seen.aborted).toBe(true);
    await expect
      .poll(() => callsOf('transcribe'))
      .toEqual([{ outcome: 'error', error_code: 'cancelled' }]);
  });

  it('a recording sent again while its judgement still runs joins it: one model call', async () => {
    scriptPronunciationTip(env, 3);
    const turn = randomUUID();
    const g = gate();
    env.llm.script('pronounce', async () => {
      g.markCalled();
      await g.wait;
      return judgement;
    });
    const body = { client_turn_id: turn, item_id: itemId, mime: 'audio/m4a', audio_base64: audio };
    const first = post(`/practice/sessions/${sessionId}/speak`, body, false);
    await g.called;
    const again = post(`/practice/sessions/${sessionId}/speak`, body, false);
    g.release();
    const [a, b] = await Promise.all([first, again]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const [ja, jb] = (await Promise.all([a.json(), b.json()])) as [AnswerResponse, AnswerResponse];
    expect(jb.verdict).toBe(ja.verdict);
    expect(env.llm.callsFor('pronounce')).toHaveLength(1);
  });
});
