// requires live verification in Claude Code session
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { encode } from 'wav-encoder';
import { openAIClient } from '../../llm/openai-client.js';
import type { LlmRequest } from '../../llm/gateway.js';
import { OpenAIAudioGateway } from '../audio.js';
import { realtimePcm } from '../audio-codec.js';
import { ScriptedGateway } from '../../testing/fakes.js';
import { OpenAISpeech } from '../openai.js';
import { speechVoices } from '../openai-config.js';
import { READ_ALOUD_INSTRUCTION } from '../realtime-speech.js';

class Socket extends EventTarget {
  static instances: Socket[] = [];
  sent: Record<string, unknown>[] = [];
  closed = false;
  constructor(readonly url: string) {
    super();
    Socket.instances.push(this);
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.closed = true;
  }
  emit(event: object) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
  }
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Unexpected HTTP call');
    }),
  ),
);
afterEach(() => {
  vi.unstubAllGlobals();
  Socket.instances = [];
});
const models = {
  OPENAI_MODEL_PRONOUNCE: 'gpt-realtime-2.1-mini',
  OPENAI_MODEL_TRANSCRIBE: 'gpt-4o-transcribe',
} as const;
const client = () =>
  openAIClient({ OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' });
async function request(): Promise<LlmRequest> {
  const wav = await encode(
    { sampleRate: 24000, channelData: [new Float32Array(2400).fill(0.25)] },
    { bitDepth: 16 },
  );
  return {
    purpose: 'pronounce',
    tier: 'smart',
    promptVersion: 'test',
    system: 'Judge sounds',
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Target' },
          { inlineData: { mimeType: 'audio/wav', data: Buffer.from(wav).toString('base64') } },
        ],
      },
    ],
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    maxOutputTokens: 500,
    temperature: 0,
    timeoutMs: 1000,
    thinking: 'off',
  };
}
async function opened() {
  await vi.waitFor(() => expect(Socket.instances).toHaveLength(1));
  const socket = Socket.instances[0]!;
  socket.emit({ type: 'session.created', session: {} });
  socket.emit({ type: 'session.updated', session: {} });
  return socket;
}
const response = (status = 'completed', reason?: string) => ({
  type: 'response.done',
  response: {
    status,
    status_details: { reason },
    usage: { input_tokens: 100, input_token_details: { audio_tokens: 90 }, output_tokens: 20 },
    output: [
      {
        type: 'function_call',
        name: 'pronunciation',
        arguments: '{"ok":false}',
      },
    ],
  },
});
it('judges original PCM over the EU socket, streams text, bills audio and closes the session', async () => {
  vi.stubGlobal('WebSocket', Socket);
  const chat = new ScriptedGateway();
  const req = await request();
  const partial = vi.fn();
  const result = new OpenAIAudioGateway(client(), chat, models).generate({
    ...req,
    onPartial: partial,
  });
  const socket = await opened();
  expect(socket.url).toBe('wss://eu.api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
  expect(socket.sent[0]).toMatchObject({
    session: { tracing: null, audio: { input: { turn_detection: null } } },
  });
  expect(socket.sent[1]).toMatchObject({
    response: {
      conversation: 'none',
      output_modalities: ['text'],
      input: [{ content: [{ type: 'input_text' }, { type: 'input_audio' }] }],
    },
  });
  expect(JSON.stringify(socket.sent)).not.toContain('transcript');
  socket.emit({ type: 'response.function_call_arguments.delta', delta: '{"ok":' });
  expect(partial).toHaveBeenCalledWith('{"ok":');
  socket.emit(response());
  expect(await result).toMatchObject({ json: { ok: false }, usage: { costMicros: 1050 } });
  expect(socket.closed).toBe(true);
  expect(chat.callsFor('pronounce')).toHaveLength(0);
});
it.each([
  ['content_filter', 'blocked'],
  ['max_output_tokens', 'invalid_output'],
] as const)('preserves the paid receipt for %s', async (reason, kind) => {
  vi.stubGlobal('WebSocket', Socket);
  const promise = new OpenAIAudioGateway(client(), new ScriptedGateway(), models).generate(
    await request(),
  );
  const rejected = expect(promise).rejects.toMatchObject({ kind, usage: { costMicros: 1050 } });
  const socket = await opened();
  socket.emit(response('incomplete', reason));
  await rejected;
  expect(socket.closed).toBe(true);
});
it('closes an in-flight session at the single deadline without another call', async () => {
  vi.stubGlobal('WebSocket', Socket);
  const promise = new OpenAIAudioGateway(client(), new ScriptedGateway(), models).generate({
    ...(await request()),
    timeoutMs: 100,
  });
  const rejected = expect(promise).rejects.toMatchObject({ kind: 'timeout' });
  const socket = await opened();
  await rejected;
  expect(socket.closed).toBe(true);
  expect(Socket.instances).toHaveLength(1);
});
it('resamples PCM to the required duration and rejects cancelled or malformed recordings', async () => {
  const wav = await encode(
    { sampleRate: 48000, channelData: [new Float32Array(48000).fill(0.5)] },
    { bitDepth: 16 },
  );
  const recording = { mimeType: 'audio/wav', data: Buffer.from(wav).toString('base64') };
  const pcm = Buffer.from(await realtimePcm(recording), 'base64');
  expect(pcm.length).toBe(48000);
  expect(pcm.readInt16LE(100)).toBeCloseTo(16383, -1);
  await expect(realtimePcm(recording, AbortSignal.abort())).rejects.toBeDefined();
  await expect(realtimePcm({ mimeType: 'audio/wav', data: 'abcd' })).rejects.toMatchObject({
    kind: 'refused',
  });
});

it('reads with a fixed calm instruction, one EU response, a PCM-derived WAV and token receipt', async () => {
  vi.stubGlobal('WebSocket', Socket);
  const model = 'gpt-realtime-2.1-mini';
  const speech = new OpenAISpeech(client(), speechVoices(model, {}), model);
  const pending = speech.synthesize({
    text: 'Gemeinsam üben.',
    locale: 'de-DE',
    voice: 'warm',
    rate: 0.88,
    timeoutMs: 1000,
  });
  const socket = await opened();
  socket.emit({ type: 'session.updated', session: {} });
  expect(socket.sent.filter((e) => e.type === 'response.create')).toHaveLength(1);
  expect(socket.sent[0]).toMatchObject({
    session: { tracing: null, audio: { output: { voice: 'marin', speed: 0.88 } } },
  });
  expect(socket.sent[1]).toMatchObject({
    response: { conversation: 'none', instructions: `${READ_ALOUD_INSTRUCTION}\nLanguage: de-DE.` },
  });
  socket.emit({
    type: 'response.output_audio.delta',
    delta: Buffer.alloc(4800).toString('base64'),
  });
  socket.emit({
    type: 'response.done',
    response: {
      status: 'completed',
      usage: {
        input_tokens: 100,
        input_token_details: { audio_tokens: 0 },
        output_tokens: 60,
        output_token_details: { audio_tokens: 40 },
      },
      output: [
        { type: 'message', content: [{ type: 'output_audio', transcript: 'Gemeinsam üben.' }] },
      ],
    },
  });
  const audio = await pending;
  expect(audio).toMatchObject({ mime: 'audio/wav', costMicros: 999 });
  expect(audio.audio.subarray(0, 4).toString()).toBe('RIFF');
  expect(speech.voiceId('warm', 'de-DE')).toContain(`${model}:de-DE:marin`);
  expect(socket.closed).toBe(true);
});

it('refuses an incomplete reading and preserves its paid receipt', async () => {
  vi.stubGlobal('WebSocket', Socket);
  const model = 'gpt-realtime-2.1-mini';
  const pending = new OpenAISpeech(client(), speechVoices(model, {}), model).synthesize({
    text: 'Gemeinsam üben.',
    locale: 'de-DE',
    voice: 'warm',
    rate: 1,
    timeoutMs: 1000,
  });
  const rejected = expect(pending).rejects.toMatchObject({ kind: 'refused', costMicros: 999 });
  const socket = await opened();
  socket.emit({
    type: 'response.output_audio.delta',
    delta: Buffer.alloc(4800).toString('base64'),
  });
  socket.emit({
    type: 'response.done',
    response: {
      status: 'incomplete',
      usage: {
        input_tokens: 100,
        input_token_details: { audio_tokens: 0 },
        output_tokens: 60,
        output_token_details: { audio_tokens: 40 },
      },
      output: [
        { type: 'message', content: [{ type: 'output_audio', transcript: 'Etwas anderes.' }] },
      ],
    },
  });
  await rejected;
  expect(socket.closed).toBe(true);
});
