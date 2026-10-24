// requires live verification in Claude Code session
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import { openAIClient } from '../../llm/openai-client.js';
import { RealtimeSpeechSessions } from '../realtime-sessions.js';

class Socket extends EventEmitter {
  socket = new EventTarget();
  sent: Array<{ type: string; response?: { input?: unknown; conversation?: string } }> = [];
  close = vi.fn(() => this.socket.dispatchEvent(new Event('close')));
  send(event: { type: string }) {
    this.sent.push(event);
    if (event.type === 'session.update') queueMicrotask(() => this.emit('session.updated', {}));
  }
  event(event: object) {
    this.emit('event', event);
  }
}
const input = {
  text: 'Bitte lies weiter.',
  locale: 'de-DE',
  voice: 'warm' as const,
  rate: 1,
  timeoutMs: 1000,
  sessionKey: 'learner-a',
};
const pools: RealtimeSpeechSessions[] = [];
function setup() {
  const sockets: Socket[] = [];
  const pool = new RealtimeSpeechSessions(
    openAIClient({ OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'https://eu.api.openai.com/v1' }),
    'gpt-realtime-1.5',
    () => {
      const socket = new Socket();
      sockets.push(socket);
      queueMicrotask(() => socket.emit('session.created', {}));
      return socket as unknown as OpenAIRealtimeWebSocket;
    },
  );
  pools.push(pool);
  return { pool, sockets };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function done(socket: Socket, transcript = input.text) {
  socket.event({ type: 'response.output_audio_transcript.done', transcript });
  socket.event({
    type: 'response.done',
    response: {
      status: 'completed',
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        input_token_details: { audio_tokens: 0 },
        output_token_details: { audio_tokens: 4 },
      },
    },
  });
}
afterEach(() => {
  for (const pool of pools.splice(0)) pool.close();
});

describe('learner-scoped persistent read-aloud sessions', () => {
  it('prewarms without generating and streams bytes before response completion, then reuses the session', async () => {
    const { pool, sockets } = setup();
    await pool.prepare(input, 'marin', AbortSignal.timeout(1000));
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.sent.map((e) => e.type)).toEqual(['session.update']);
    const onAudio = vi.fn(async () => {});
    const run = pool.synthesize({ ...input, onAudio }, 'marin', AbortSignal.timeout(1000));
    await flush();
    sockets[0]!.event({
      type: 'response.output_audio.delta',
      delta: Buffer.alloc(960).toString('base64'),
    });
    await flush();
    expect(onAudio).toHaveBeenCalledWith({ mime: 'audio/pcm', audio: Buffer.alloc(960) });
    done(sockets[0]!);
    expect(await run).toMatchObject({ mime: 'audio/wav', costMicros: expect.any(Number) });
    const again = pool.synthesize(input, 'marin', AbortSignal.timeout(1000));
    await flush();
    sockets[0]!.event({ type: 'response.output_audio.delta', delta: 'AAA=' });
    done(sockets[0]!);
    await again;
    expect(sockets).toHaveLength(1);
    for (const event of sockets[0]!.sent.filter((e) => e.type === 'response.create'))
      expect(event.response).toMatchObject({ conversation: 'none' });
  });
  it('partitions by learner and voice, and tears down on cancellation without retrying', async () => {
    const { pool, sockets } = setup();
    await pool.prepare(input, 'marin', AbortSignal.timeout(1000));
    await pool.prepare({ ...input, sessionKey: 'learner-b' }, 'marin', AbortSignal.timeout(1000));
    await pool.prepare(input, 'cedar', AbortSignal.timeout(1000));
    expect(sockets).toHaveLength(3);
    const controller = new AbortController();
    const run = pool.synthesize(input, 'marin', controller.signal);
    const rejected = expect(run).rejects.toMatchObject({ kind: 'cancelled' });
    await flush();
    controller.abort();
    await rejected;
    expect(sockets[0]!.close).toHaveBeenCalled();
    expect(sockets[1]!.close).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(3);
  });
  it('rejects a paraphrase and preserves its usage receipt instead of caching it', async () => {
    const { pool, sockets } = setup();
    const run = pool.synthesize(input, 'marin', AbortSignal.timeout(1000));
    const rejected = expect(run).rejects.toMatchObject({
      kind: 'refused',
      costMicros: expect.any(Number),
    });
    await flush();
    sockets[0]!.event({ type: 'response.output_audio.delta', delta: 'AAA=' });
    done(sockets[0]!, 'Es gibt nichts zu lesen.');
    await rejected;
  });
  it('serializes requests within a session and rejects incomplete audio', async () => {
    const { pool, sockets } = setup();
    const a = pool.synthesize(input, 'marin', AbortSignal.timeout(1000));
    const b = pool.synthesize(input, 'marin', AbortSignal.timeout(1000));
    const rejected = expect(a).rejects.toMatchObject({ kind: 'refused' });
    await flush();
    expect(sockets[0]!.sent.filter((e) => e.type === 'response.create')).toHaveLength(1);
    done(sockets[0]!);
    await rejected;
    await flush();
    sockets[0]!.event({ type: 'response.output_audio.delta', delta: 'AAA=' });
    done(sockets[0]!);
    await b;
    expect(sockets[0]!.sent.filter((e) => e.type === 'response.create')).toHaveLength(2);
  });
});

it('cancels a blocked consumer after the provider completed and retains the receipt', async () => {
  const { pool, sockets } = setup();
  const controller = new AbortController();
  const run = pool.synthesize(
    { ...input, onAudio: () => new Promise(() => {}) },
    'marin',
    controller.signal,
  );
  const rejected = expect(run).rejects.toMatchObject({
    kind: 'cancelled',
    costMicros: expect.any(Number),
  });
  await flush();
  sockets[0]!.event({ type: 'response.output_audio.delta', delta: 'AAA=' });
  done(sockets[0]!);
  await flush();
  controller.abort();
  await rejected;
}, 1000);
