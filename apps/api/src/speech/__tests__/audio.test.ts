// requires live verification in Claude Code session
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { openAIClient } from '../../llm/openai-client.js';
import { OpenAIAudioGateway } from '../audio.js';
import { audioUsage } from '../audio-usage.js';
import { pronunciationAudio } from '../audio-codec.js';
import { ScriptedGateway } from '../../testing/fakes.js';
import { LlmError, type LlmRequest } from '../../llm/gateway.js';
const config = { OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' };
const input = (purpose: 'transcribe' | 'pronounce'): LlmRequest => ({
  purpose,
  audioLanguage: 'de',
  tier: 'smart',
  promptVersion: 'test',
  system: 'Return JSON',
  contents: [
    {
      role: 'user',
      parts: [
        { text: 'EXPECTED LANGUAGE: de' },
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: Buffer.from('RIFFrecording').toString('base64'),
          },
        },
      ],
    },
  ],
  schema: { type: 'object', properties: { text: { type: 'string' } } },
  maxOutputTokens: 500,
  temperature: 0,
  timeoutMs: 1000,
  thinking: 'off',
});
const usage = {
  type: 'tokens',
  input_tokens: 100,
  input_token_details: { audio_tokens: 90, text_tokens: 10 },
  output_tokens: 20,
  total_tokens: 120,
};
describe('recorded audio routing', () => {
  it.each([
    ['gpt-4o-transcribe', 765],
    ['gpt-4o-mini-transcribe', 383],
  ] as const)('prices %s with separate audio input tokens', (model, expected) => {
    expect(audioUsage(model, usage, 1, 100).costMicros).toBe(expected);
  });
  it('uploads transcription as a file, preserves formatting and safeguarding, and aggregates cost', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ text: 'drei Viertel', usage }));
    const chat = new ScriptedGateway();
    chat.script('transcribe', { json: { heard_speech: true, text: '3/4', distress: false } });
    const gateway = new OpenAIAudioGateway(
      openAIClient(config, Object.assign(fetch, { Response })),
      chat,
    );
    const result = await gateway.generate(input('transcribe'));
    expect(result.json).toEqual({ heard_speech: true, text: '3/4', distress: false });
    expect(String(fetch.mock.calls[0]![0])).toContain('/audio/transcriptions');
    const body = fetch.mock.calls[0]![1]?.body as FormData;
    expect(body.get('model')).toBe('gpt-4o-transcribe');
    expect(body.get('language')).toBe('de');
    expect(body.get('file')).toBeInstanceOf(File);
    const called = chat.callsFor('transcribe')[0]!;
    expect(called.contents.flatMap((m) => m.parts).every((p) => 'text' in p)).toBe(true);
    expect(JSON.stringify(called.contents)).toContain('drei Viertel');
    expect(result.usage.costMicros).toBeGreaterThan(0);
  });
  it('does not let the formatter invent words for an empty transcript', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ text: '', usage }));
    const chat = new ScriptedGateway();
    const result = await new OpenAIAudioGateway(
      openAIClient(config, Object.assign(fetch, { Response })),
      chat,
    ).generate(input('transcribe'));
    expect(result.json).toEqual({ heard_speech: false, text: '', distress: false });
    expect(chat.callsFor('transcribe')).toHaveLength(0);
  });
  it('aborts an in-flight upload at the request deadline', async () => {
    const fetch: typeof globalThis.fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    await expect(
      new OpenAIAudioGateway(
        openAIClient(config, Object.assign(fetch, { Response })),
        new ScriptedGateway(),
      ).generate({ ...input('transcribe'), timeoutMs: 20 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('leaves image transcription on the chat gateway', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const chat = new ScriptedGateway();
    chat.script('transcribe', { json: { lines: '2+2' } });
    const req = input('transcribe');
    req.contents = [
      { role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'abcd' } }] },
    ];
    await new OpenAIAudioGateway(
      openAIClient(config, Object.assign(fetch, { Response })),
      chat,
    ).generate(req);
    expect(fetch).not.toHaveBeenCalled();
    expect(chat.callsFor('transcribe')[0]).toBe(req);
  });
  it.each(['gpt-audio-1.5', 'gpt-audio'] as const)(
    'passes original sounds to configured %s, never a transcript grade',
    async (model) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ heard: 'bonjour', ok: false, heard_ipa: 'bɔnʒur' }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 30,
            prompt_tokens_details: { audio_tokens: 90 },
          },
        }),
      );
      const chat = new ScriptedGateway();
      const gateway = new OpenAIAudioGateway(
        openAIClient(config, Object.assign(fetch, { Response })),
        chat,
        { OPENAI_MODEL_PRONOUNCE: model, OPENAI_MODEL_TRANSCRIBE: 'gpt-4o-transcribe' },
      );
      const result = await gateway.generate(input('pronounce'));
      expect(result.json).toMatchObject({ ok: false });
      expect(result.usage.costMicros).toBe(3205);
      const body = JSON.parse(String(fetch.mock.calls[0]![1]?.body));
      expect(body.model).toBe(model);
      expect(result.usage.model).toBe(model);
      expect(body.store).toBe(false);
      expect(body.messages[1].content[1].type).toBe('input_audio');
      expect(chat.callsFor('pronounce')).toHaveLength(0);
    },
  );
  it.each([
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [400, 'refused'],
  ] as const)('propagates HTTP %i without falling back', async (status, kind) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{}', { status }));
    const chat = new ScriptedGateway();
    await expect(
      new OpenAIAudioGateway(
        openAIClient(config, Object.assign(fetch, { Response })),
        chat,
      ).generate(input('transcribe')),
    ).rejects.toMatchObject({ kind });
    expect(chat.callsFor('transcribe')).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains billed transcription when the formatting stage fails', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ text: 'Hilfe', usage }));
    const chat = new ScriptedGateway();
    chat.script('transcribe', { error: new LlmError('unavailable', 'outage') });
    await expect(
      new OpenAIAudioGateway(
        openAIClient(config, Object.assign(fetch, { Response })),
        chat,
      ).generate(input('transcribe')),
    ).rejects.toMatchObject({ kind: 'unavailable', usage: { inputTokens: 100 } });
  });
  it('stops before a paid call after cancellation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const req = input('transcribe');
    req.signal = AbortSignal.abort();
    await expect(
      new OpenAIAudioGateway(
        openAIClient(config, Object.assign(fetch, { Response })),
        new ScriptedGateway(),
      ).generate(req),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects refusal, truncation and malformed pronunciation responses', async () => {
    for (const choice of [
      { finish_reason: 'stop', message: { refusal: 'no' } },
      { finish_reason: 'length', message: { content: '{}' } },
      { finish_reason: 'stop', message: { content: 'bad' } },
    ]) {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(Response.json({ choices: [choice] }));
      await expect(
        new OpenAIAudioGateway(
          openAIClient(config, Object.assign(fetch, { Response })),
          new ScriptedGateway(),
        ).generate(input('pronounce')),
      ).rejects.toBeInstanceOf(LlmError);
    }
  });
  it.each([
    ['m4a', 'audio/mp4'],
    ['webm', 'audio/webm'],
    ['aac', 'audio/aac'],
  ])('converts %s into actual WAV without a native binary', async (extension, mimeType) => {
    const bytes = readFileSync(
      new URL(`../../testing/fixtures/audio/speak8.${extension}`, import.meta.url),
    );
    const result = await pronunciationAudio({
      mimeType: mimeType!,
      data: bytes.toString('base64'),
    });
    expect(result.format).toBe('wav');
    const wav = Buffer.from(result.data, 'base64');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.length).toBeGreaterThan(100_000);
  });
});
