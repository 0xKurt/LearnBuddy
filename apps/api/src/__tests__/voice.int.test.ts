// Speech to text: talking instead of typing. docs/architecture.md §Voice.
// requires live verification in Claude Code session (needs a running Postgres)

import type { TranscribeResponse } from '@learnbuddy/shared-types/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LlmError } from '../llm/gateway.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();
const audio = Buffer.alloc(120_000, 3).toString('base64');

describe.skipIf(!dbReady)('voice', () => {
  let env: TestEnv;
  let l: Learner;
  beforeEach(async () => {
    env = await createTestEnv({ start: '2026-09-28T14:00:00Z' });
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(async () => {
    const report = {
      scriptErrors: [...env.llm.scriptErrors],
      unexpected: env.llm.unexpected.length,
      pending: env.llm.pending(),
    };
    await env.close();
    expect(report).toEqual({ scriptErrors: [], unexpected: 0, pending: 0 });
  });

  it('writes down a spoken answer, tells the model the mode and language, stores nothing', async () => {
    env.llm.script('transcribe', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('MODE: ANSWER\nEXPECTED LANGUAGE: fr');
      expect(
        req.contents[0]!.parts.some(
          (p) => 'inlineData' in p && p.inlineData.mimeType === 'audio/webm',
        ),
      ).toBe(true);
      return { heard_speech: true, text: ' la chambre ' };
    });
    const res = await l.api.post<TranscribeResponse>('/voice/transcribe', {
      mime: 'audio/webm',
      audio_base64: audio,
      purpose: 'answer',
      lang: 'fr',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'la chambre' });
    const tables = await env.db.query(
      `select 1 from practice_turns union all select 1 from buddy_messages`,
    );
    expect(tables).toEqual([]);
  });

  it('returns empty text for silence, and an honest error when the model is down', async () => {
    env.llm.script(
      'transcribe',
      { json: { heard_speech: false, text: 'ähm' } },
      { error: new LlmError('unavailable', 'down') },
    );
    const silent = await l.api.post<TranscribeResponse>('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(silent.body).toEqual({ text: '' });
    const down = await l.api.post('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(down.status).toBe(503);
  });

  it('refuses recordings that are too long, and unknown formats', async () => {
    const tooLong = await l.api.post('/voice/transcribe', {
      mime: 'audio/mp4',
      audio_base64: 'A'.repeat(1_500_000),
      purpose: 'message',
    });
    expect(tooLong.status).toBe(422);
    const odd = await l.api.post('/voice/transcribe', {
      mime: 'video/mp4',
      audio_base64: audio,
      purpose: 'message',
    });
    expect(odd.status).toBe(422);
  });
});
