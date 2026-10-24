// requires live verification in Claude Code session (real SDK/HTTP boundary and Postgres).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mediaConfig,
  mediaHttp,
  withLearner,
  type MediaScenario,
} from '../../llm/__tests__/media-fixtures.js';
import { testDatabaseAvailable } from '../../testing/database.js';
import { FakeSpeech } from '../../testing/fakes.js';
import { openAIClient } from '../../llm/openai-client.js';
import { SpeechError, type SpeechGateway, type SpeechInput } from '../gateway.js';
import { GoogleSpeech } from '../google.js';
import { OpenAISpeech } from '../openai.js';
const dbReady = await testDatabaseAvailable();
const input: SpeechInput = {
  text: 'Gemeinsam üben.',
  locale: 'de-DE',
  voice: 'warm',
  rate: 1,
  timeoutMs: 1000,
};
function setup(name: 'fake' | 'google' | 'openai', scenario: MediaScenario) {
  const bytes = Buffer.from('ID3-audio');
  const fetch = mediaHttp(
    scenario,
    name === 'google'
      ? Response.json({ audioContent: bytes.toString('base64') })
      : new Response(bytes, { headers: { 'content-type': 'audio/mpeg' } }),
  );
  vi.stubGlobal('fetch', fetch);
  let gateway: SpeechGateway;
  if (name === 'google')
    gateway = new GoogleSpeech(mediaConfig, { getAccessToken: async () => 'test' });
  else if (name === 'openai') gateway = new OpenAISpeech(openAIClient(mediaConfig, fetch));
  else {
    const fake = new FakeSpeech();
    if (scenario === 'timeout' || scenario === 'cancelled') fake.waitForAbort = true;
    else if (scenario !== 'ok') fake.failNext(new SpeechError(scenario, 'scripted'));
    gateway = fake;
  }
  return { gateway, fetch };
}
afterEach(() => vi.unstubAllGlobals());
it.skipIf(!dbReady)(
  'records a token-priced speech receipt once, then free cached playback',
  async () => {
    await withLearner(async (env, learner) => {
      const speech = new FakeSpeech();
      const synthesize = speech.synthesize.bind(speech);
      speech.synthesize = async (input) => ({ ...(await synthesize(input)), costMicros: 1234 });
      env.deps.speech = speech;
      const body = { text: input.text, locale: input.locale };
      expect((await learner.api.post('/voice/speech', body)).status).toBe(200);
      expect((await learner.api.post('/voice/speech', body)).status).toBe(200);
      expect(
        await env.db.query(
          'select outcome, cost_micros from speech_calls order by cost_micros desc',
        ),
      ).toEqual([
        { outcome: 'ok', cost_micros: 1234 },
        { outcome: 'cached', cost_micros: 0 },
      ]);
    });
  },
);
describe.each(['fake', 'google', 'openai'] as const)('%s SpeechGateway contract', (name) => {
  it('returns playable audio, voice identity and the supported locale', async () => {
    const { gateway } = setup(name, 'ok');
    const audio = await gateway.synthesize(input);
    expect(['audio/mpeg', 'audio/wav']).toContain(audio.mime);
    expect(audio.audio.length).toBeGreaterThan(0);
    expect(gateway.voiceId('warm', 'de-DE')).not.toBe(gateway.voiceId('deep', 'de-DE'));
    expect(gateway.localeFor('de')).toBe('de-DE');
  });
  it.each(['timeout', 'rate_limited', 'refused'] as const)('classifies %s', async (scenario) => {
    await expect(
      setup(name, scenario).gateway.synthesize({ ...input, timeoutMs: 25 }),
    ).rejects.toMatchObject({ kind: scenario });
  });
  it('aborts before transport and during an in-flight call', async () => {
    const { gateway, fetch } = setup(name, 'cancelled');
    await expect(
      gateway.synthesize({ ...input, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = gateway.synthesize({ ...input, signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    if (name !== 'fake') expect(fetch.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
  });
  it.skipIf(!dbReady)('records the adapter price once; cached playback costs zero', async () => {
    const { gateway } = setup(name, 'ok');
    await withLearner(async (env, learner) => {
      env.deps.speech = gateway;
      const body = { text: input.text, locale: input.locale };
      expect((await learner.api.post('/voice/speech', body)).status).toBe(200);
      expect((await learner.api.post('/voice/speech', body)).status).toBe(200);
      expect(
        await env.db.query(
          'select outcome,cost_micros from speech_calls order by cost_micros desc',
        ),
      ).toEqual([
        { outcome: 'ok', cost_micros: input.text.length * gateway.microsPerCharacter },
        { outcome: 'cached', cost_micros: 0 },
      ]);
    });
  });
});
