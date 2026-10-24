// requires live verification in Claude Code session
import { describe, expect, it, vi } from 'vitest';
import { openAIClient } from '../../llm/openai-client.js';
import { OpenAISpeech } from '../openai.js';
import { rateFor } from '../gateway.js';
import { DEFAULT_OPENAI_VOICES, openAISpeechFields, speechVoices } from '../openai-config.js';
const config = { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' };
const input = {
  text: 'Guten Morgen.',
  locale: 'de-DE',
  voice: 'warm' as const,
  rate: 0.88,
  timeoutMs: 1000,
};
describe('EU speech', () => {
  it('applies an operator voice override to both audio and its cache key', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('audio', { headers: { 'content-type': 'audio/mpeg' } }));
    const voices = speechVoices(
      'tts-1',
      openAISpeechFields.OPENAI_TTS_VOICES.parse('{"warm":"ash"}'),
    );
    const speech = new OpenAISpeech(openAIClient(config, fetch), voices);
    await speech.synthesize(input);
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).voice).toBe('ash');
    expect(speech.voiceId('warm', 'de-DE')).not.toBe(
      new OpenAISpeech(openAIClient(config)).voiceId('warm', 'de-DE'),
    );
    expect(voices.bright).toBe(DEFAULT_OPENAI_VOICES.bright);
    expect(() => openAISpeechFields.OPENAI_TTS_VOICES.parse('{broken')).toThrow();
    expect(() => openAISpeechFields.OPENAI_TTS_VOICES.parse('{"unknown":"ash"}')).toThrow();
  });
  it('requests MP3, preserves the speed steps, and separates its cache from the old provider', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('ID3audio', { headers: { 'content-type': 'audio/mpeg' } }));
    const speech = new OpenAISpeech(openAIClient(config, fetch));
    expect(await speech.synthesize(input)).toEqual({
      mime: 'audio/mpeg',
      audio: Buffer.from('ID3audio'),
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://eu.api.openai.com/v1/audio/speech');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'tts-1',
      input: input.text,
      voice: 'nova',
      speed: 0.88,
      response_format: 'mp3',
    });
    expect(speech.voiceId('warm', 'de-DE')).toContain('tts-1');
    expect(speech.voiceId('warm', 'de-DE')).not.toBe(speech.voiceId('warm', 'fr-FR'));
    expect([-2, -1, 0, 1, 2].map((s) => rateFor(s, false))).toEqual([0.75, 0.88, 1, 1.12, 1.25]);
  });
  it('supports each app language and regional variants', () => {
    const speech = new OpenAISpeech(openAIClient(config));
    expect(['de', 'en', 'fr', 'es', 'it', 'de-AT'].map((l) => speech.localeFor(l))).toEqual([
      'de-DE',
      'en-GB',
      'fr-FR',
      'es-ES',
      'it-IT',
      'de-DE',
    ]);
    expect(speech.localeFor('xx')).toBeNull();
    expect(
      new Set(
        ['warm', 'friendly', 'bright', 'clear', 'soft', 'deep'].map((v) =>
          speech.voiceId(v as 'warm', 'de-DE'),
        ),
      ).size,
    ).toBe(6);
  });
  it.each([
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [400, 'refused'],
  ] as const)('maps HTTP %i without retrying', async (status, kind) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{}', { status }));
    await expect(
      new OpenAISpeech(openAIClient(config, fetch)).synthesize(input),
    ).rejects.toMatchObject({ kind });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects empty audio and does not send unsupported locales', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('', { headers: { 'content-type': 'audio/mpeg' } }));
    const speech = new OpenAISpeech(openAIClient(config, fetch));
    await expect(speech.synthesize(input)).rejects.toMatchObject({ kind: 'refused' });
    await expect(speech.synthesize({ ...input, locale: 'xx' })).rejects.toMatchObject({
      kind: 'refused',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('maps a cancelled SDK request at its deadline to timeout', async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    await expect(
      new OpenAISpeech(openAIClient(config, fetch)).synthesize({ ...input, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('bounds response-body consumption as well as waiting for headers', async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), {
              once: true,
            });
          },
        }),
        { headers: { 'content-type': 'audio/mpeg' } },
      );
    await expect(
      new OpenAISpeech(openAIClient(config, fetch)).synthesize({ ...input, timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});
