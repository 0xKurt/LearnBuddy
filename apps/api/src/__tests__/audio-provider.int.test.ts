// requires live verification in Claude Code session (real Postgres, fake external HTTP only)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAIAudioGateway } from '../speech/audio.js';
import { openAIClient } from '../llm/openai-client.js';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../testing/harness.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { ScriptedGateway } from '../testing/fakes.js';
import { DAILY_LIMITS } from '../config.js';
import { learnerDay } from '../lib/zone.js';
const audio_base64 = Buffer.alloc(100, 1).toString('base64');
describe.skipIf(!(await testDatabaseAvailable()))('recorded audio through the API', () => {
  let env: TestEnv, l: Learner;
  const http = vi.fn<typeof globalThis.fetch>();
  beforeEach(async () => {
    http.mockReset();
    env = await createTestEnv();
    env.deps.llm = new OpenAIAudioGateway(
      openAIClient(
        { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' },
        Object.assign(http, { Response }),
      ),
      env.llm,
    );
    l = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
  });
  afterEach(async () => env.closeChecked());
  function transcript(text: string) {
    http.mockResolvedValueOnce(
      Response.json({
        text,
        usage: {
          type: 'tokens',
          input_tokens: 100,
          output_tokens: 5,
          input_token_details: { audio_tokens: 90 },
          total_tokens: 105,
        },
      }),
    );
  }
  const speak = (purpose: 'message' | 'answer' = 'message') =>
    l.api.post('/voice/transcribe', { audio_base64, mime: 'audio/webm', purpose });
  it('keeps answer formatting, one daily reservation and both stages of cost without persisting speech', async () => {
    transcript('drei Viertel');
    env.llm.script('transcribe', (req) => {
      expect(ScriptedGateway.textOf(req)).toContain('drei Viertel');
      expect(req.contents.flatMap((m) => m.parts).every((p) => 'text' in p)).toBe(true);
      return { heard_speech: true, text: '3/4', distress: false };
    });
    const result = await speak('answer');
    expect(result.status).toBe(200);
    expect((http.mock.calls[0]![1]?.body as FormData).get('language')).toBe('de');
    expect(result.body).toEqual({ text: '3/4' });
    const usage = await env.db.one<{ calls: number; cost_micros: number }>(
      `select calls,cost_micros from usage_daily where learner_id=$1 and kind='transcribe'`,
      [l.learnerId],
    );
    expect(usage.calls).toBe(1);
    expect(usage.cost_micros).toBeGreaterThan(0);
    const call = await env.db.one<{ model: string; attempts: number }>(
      `select model,attempts from llm_calls where learner_id=$1 and purpose='transcribe'`,
      [l.learnerId],
    );
    expect(call.model).toContain('gpt-4o-transcribe');
    expect(call.attempts).toBe(2);
    expect(
      await env.db.query('select 1 from buddy_messages union all select 1 from practice_turns'),
    ).toEqual([]);
  });
  it('preserves uncertain words of distress for the existing safeguarding path', async () => {
    transcript('Ich werde zu Hause geschlagen.');
    env.llm.script('transcribe', {
      json: { heard_speech: false, distress: true, text: 'Ich werde zu Hause geschlagen.' },
    });
    expect((await speak()).body).toEqual({ text: 'Ich werde zu Hause geschlagen.' });
  });
  it('checks the daily limit before sending a recording, and records throttling honestly', async () => {
    http.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    expect((await speak()).status).toBe(503);
    expect(
      await env.db.one(
        `select error_code from llm_calls where learner_id=$1 and purpose='transcribe'`,
        [l.learnerId],
      ),
    ).toEqual({ error_code: 'rate_limited' });
    const day = await learnerDay(env.db, l.learnerId, env.clock.now());
    await env.db.query(
      `insert into usage_daily(learner_id,day,kind,calls) values($1,$2,'transcribe',$3) on conflict(learner_id,day,kind) do update set calls=excluded.calls`,
      [l.learnerId, day, DAILY_LIMITS.transcribe],
    );
    expect((await speak()).status).toBe(429);
    expect(http).toHaveBeenCalledTimes(1);
  });
});
