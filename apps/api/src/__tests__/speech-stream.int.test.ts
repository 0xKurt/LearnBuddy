// requires live verification in Claude Code session
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestEnv, onboard, type TestEnv, type Learner } from '../testing/harness.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { OpenAISpeech } from '../speech/openai.js';
import { openAIClient } from '../llm/openai-client.js';

const dbReady = await testDatabaseAvailable();
describe.skipIf(!dbReady)('progressive speech HTTP', () => {
  let env: TestEnv;
  let learner: Learner;
  beforeAll(async () => {
    env = await createTestEnv();
    learner = await onboard(env);
  });
  afterAll(async () => {
    await env?.close();
  });
  const request = (text: string, method = 'POST', token = learner.token) =>
    env.app.request('/v1/voice/speech', {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'audio/mpeg',
        'content-type': 'application/json',
        ...(method === 'GET'
          ? { 'x-speech-request': encodeURIComponent(JSON.stringify({ text, locale: 'de-DE' })) }
          : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ text, locale: 'de-DE' }) } : {}),
    });
  it('streams before EOF and serves the completed audio from the learner cache', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              controller = c;
              c.enqueue(Buffer.from('first'));
            },
          }),
          { headers: { 'content-type': 'audio/mpeg' } },
        ),
    );
    env.deps.speech = new OpenAISpeech(
      openAIClient(
        { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' },
        fetch,
      ),
    );
    const res = await request('Streaming prüfen.');
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const reader = res.body!.getReader();
    expect(Buffer.from((await reader.read()).value!).toString()).toBe('first');
    controller.enqueue(Buffer.from('last'));
    controller.close();
    expect(Buffer.from((await reader.read()).value!).toString()).toBe('last');
    expect((await reader.read()).done).toBe(true);
    const cached = await request('Streaming prüfen.', 'GET');
    expect(await cached.text()).toBe('firstlast');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await env.db.query('select outcome from speech_calls order by outcome')).toEqual([
      { outcome: 'cached' },
      { outcome: 'ok' },
    ]);
  });
  it('does not cache a truncated provider response and aborts when playback is cancelled', async () => {
    let upstream!: AbortSignal;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => {
      upstream = init!.signal!;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
            c.enqueue(Buffer.from('partial'));
            upstream.addEventListener('abort', () => c.error(new Error('cancelled')), {
              once: true,
            });
          },
        }),
        { headers: { 'content-type': 'audio/mpeg' } },
      );
    });
    env.deps.speech = new OpenAISpeech(
      openAIClient(
        { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' },
        fetch,
      ),
    );
    const before = await env.db.query('select key from speech_cache');
    const res = await request('Abgebrochen.');
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(upstream.aborted).toBe(true));
    await vi.waitFor(async () =>
      expect(
        await env.db.query("select outcome from speech_calls where outcome = 'error'"),
      ).toHaveLength(1),
    );
    expect(await env.db.query('select key from speech_cache')).toEqual(before);
    // A provider failure after its first bytes is a broken stream, never a complete cached clip.
    const failed = await request('Unterbrochen.');
    const partial = failed.body!.getReader();
    await partial.read();
    controller.error(new Error('provider disconnected'));
    await expect(partial.read()).rejects.toThrow();
    expect(await env.db.query('select key from speech_cache')).toEqual(before);
  });

  it('returns ordinary errors before audio and keeps the legacy JSON contract', async () => {
    env.deps.speech = env.speech;
    const old = await learner.api.post('/voice/speech', { text: 'Alte Version.', locale: 'de-DE' });
    expect(old.status).toBe(200);
    expect(old.body).toHaveProperty('audio_base64');
    const invalid = await request('');
    expect(invalid.status).toBe(422);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{}', { status: 503 }));
    env.deps.speech = new OpenAISpeech(
      openAIClient(
        { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' },
        fetch,
      ),
    );
    const unavailable = await request('Anbieter ausgefallen.');
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('content-type')).toContain('application/json');
  });

  it('preserves a provider token receipt through the complete-file streaming fallback', async () => {
    env.deps.speech = env.speech;
    const synthesize = vi.spyOn(env.speech, 'synthesize').mockResolvedValueOnce({
      mime: 'audio/wav',
      audio: Buffer.from('complete-wav'),
      costMicros: 1234,
    });
    try {
      const res = await request('Tokenbeleg bewahren.');
      expect(await res.text()).toBe('complete-wav');
      expect(
        await env.db.query('select cost_micros::int from speech_calls where cost_micros = 1234'),
      ).toEqual([{ cost_micros: 1234 }]);
    } finally {
      synthesize.mockRestore();
    }
  });

  it('negotiates PCM for the queue, keeps WAV in cache and scopes reuse to the authenticated learner', async () => {
    const prepare = vi.fn(
      async (_input: import('../speech/gateway.js').SpeechSessionInput) => undefined,
    );
    const synthesize = vi.fn(async (input: import('../speech/gateway.js').SpeechInput) => {
      await input.onAudio?.({ mime: 'audio/pcm', audio: Buffer.alloc(960) });
      return { mime: 'audio/wav' as const, audio: Buffer.from('RIFFcached'), costMicros: 4567 };
    });
    env.deps.speech = {
      available: true,
      microsPerCharacter: 0,
      localeFor: () => 'de-DE',
      voiceId: () => 'test-pcm',
      prepare,
      synthesize,
    };
    const body = { text: 'PCM ohne Warten.', locale: 'de-DE' };
    const warm = await learner.api.post('/voice/speech/prepare', { locale: 'de-DE' });
    expect(warm.status).toBe(200);
    expect(prepare.mock.calls[0]?.[0]).not.toHaveProperty('text');
    const pcm = await env.app.request('/v1/voice/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${learner.token}`,
        accept: 'audio/pcm',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    expect(pcm.headers.get('content-type')).toBe('audio/pcm');
    expect((await pcm.arrayBuffer()).byteLength).toBe(960);
    const again = await request(body.text);
    expect(again.headers.get('content-type')).toBe('audio/wav');
    expect(await again.text()).toBe('RIFFcached');
    expect(synthesize).toHaveBeenCalledOnce();
    expect(synthesize.mock.calls[0]?.[0].sessionKey).toBeTruthy();
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: synthesize.mock.calls[0]?.[0].sessionKey }),
    );
    expect(
      await env.db.query('select cost_micros::int from speech_calls where cost_micros = 4567'),
    ).toEqual([{ cost_micros: 4567 }]);
    expect(
      (
        await env.app.request('/v1/voice/speech/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: 'de-DE' }),
        })
      ).status,
    ).toBe(401);
  });

  it('buffers PCM for older clients that only accept complete media files', async () => {
    env.deps.speech = {
      available: true,
      microsPerCharacter: 0,
      localeFor: () => 'de-DE',
      voiceId: () => 'test-legacy-pcm',
      synthesize: async (input) => {
        await input.onAudio?.({ mime: 'audio/pcm', audio: Buffer.alloc(960) });
        return { mime: 'audio/wav', audio: Buffer.from('RIFFlegacy'), costMicros: 123 };
      },
    };
    const res = await request('Altes Gerät mit neuer Stimme.');
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(await res.text()).toBe('RIFFlegacy');
  });

  it('requires authentication and validates the native header', async () => {
    expect((await request('Privat.', 'GET', 'wrong')).status).toBe(401);
    const res = await env.app.request('/v1/voice/speech', {
      headers: { authorization: `Bearer ${learner.token}`, 'x-speech-request': '%broken' },
    });
    expect(res.status).toBe(422);
  });
});
