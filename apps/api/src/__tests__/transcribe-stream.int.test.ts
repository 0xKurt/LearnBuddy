// Writing down what she said, while the model is still listening (issue #9):
// `progress` events carry the words so far, the `done` event the text that is used.
// Nothing counts as heard before that (CLAUDE.md rule 5).
// requires live verification in Claude Code session (needs a running Postgres)

import type { TranscribeResponse, TranscribeStreamEvent } from '@learnbuddy/shared-types/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(2000, 7).toString('base64');

type Streamed = {
  status: number;
  progress: TranscribeStreamEvent[];
  done: TranscribeResponse | null;
  error: { code: string } | null;
};

async function listen(env: TestEnv, l: Learner, purpose: 'message' | 'answer'): Promise<Streamed> {
  const res = await env.app.request('/v1/voice/transcribe', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${l.token}`,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ mime: 'audio/m4a', audio_base64: audio, purpose }),
  });
  const out: Streamed = { status: res.status, progress: [], done: null, error: null };
  for (const block of (await res.text()).split('\n\n')) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (!event || !data) continue;
    if (event === 'progress') out.progress.push(JSON.parse(data) as TranscribeStreamEvent);
    if (event === 'done') out.done = JSON.parse(data) as TranscribeResponse;
    if (event === 'error') out.error = JSON.parse(data) as { code: string };
  }
  return out;
}

describe.skipIf(!dbReady)('streamed transcription', () => {
  let env: TestEnv;
  let l: Learner;

  beforeAll(async () => {
    env = await createTestEnv({ start: '2026-09-28T08:00:00Z' });
    l = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('shows the words while they are written down and ends with the text that is used', async () => {
    env.llm.script('transcribe', {
      json: { heard_speech: true, text: 'Ich möchte Brüche üben' },
    });
    const s = await listen(env, l, 'message');
    expect(s.status).toBe(200);
    expect(s.error).toBeNull();
    // Progress only grows, and never says more than the model has written.
    expect(s.progress.length).toBeGreaterThan(0);
    const lengths = s.progress.map((p) => p.text.length);
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
    const whole = 'Ich möchte Brüche üben';
    for (const p of s.progress) expect(whole.startsWith(p.text)).toBe(true);
    // Only the result is used.
    expect(s.done).toEqual({ text: whole });
    expect(env.llm.callsFor('transcribe')).toHaveLength(1);
  });

  it('hears nothing in a silent recording, and says so as an empty text', async () => {
    env.llm.script('transcribe', { json: { heard_speech: false, text: '' } });
    const s = await listen(env, l, 'answer');
    expect(s.status).toBe(200);
    expect(s.done).toEqual({ text: '' });
    expect(s.error).toBeNull();
  });

  it('says the reason as a code when the model cannot listen, and writes nothing down', async () => {
    env.llm.script('transcribe', { json: { heard_speech: true, text: 42 } });
    const s = await listen(env, l, 'message');
    expect(s.status).toBe(200);
    expect(s.done).toBeNull();
    expect(s.error).toEqual({ code: 'model_unavailable' });
  });
});
