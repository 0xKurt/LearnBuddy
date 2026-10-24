// The authenticated speech route's byte transport. No successful response before real audio.
import type { SpeechRequest } from '@learnbuddy/shared-types/contracts';
import { depsOf, type AppContext } from '../../http/context.js';
import type { SpeechChunk } from '../../speech/gateway.js';
import { synthesizeSpeech } from './speech.js';

export async function streamSpeech(c: AppContext, input: SpeechRequest): Promise<Response> {
  const gone = new AbortController();
  const pipe = new TransformStream<Uint8Array, Uint8Array>();
  const writer = pipe.writable.getWriter();
  void writer.closed.catch(() => gone.abort());
  const abort = () => gone.abort();
  c.req.raw.signal.addEventListener('abort', abort, { once: true });
  if (c.req.raw.signal.aborted) gone.abort();
  let first!: (mime: SpeechChunk['mime']) => void;
  let failed!: (error: unknown) => void;
  const headers = new Promise<SpeechChunk['mime']>((resolve, reject) => {
    first = resolve;
    failed = reject;
  });
  const started = performance.now();
  let sent = false;
  const work = synthesizeSpeech(
    depsOf(c),
    {
      accountId: c.get('account').id,
      learnerId: c.get('learner').id,
    },
    input,
    {
      signal: gone.signal,
      pcm: (c.req.header('accept') ?? '').includes('audio/pcm'),
      onAudio: async (chunk) => {
        if (!sent) {
          sent = true;
          first(chunk.mime);
          console.info('[voice] first audio', { ms: Math.round(performance.now() - started) });
        }
        await writer.write(new Uint8Array(chunk.audio));
      },
    },
  )
    .then(
      async () => {
        await writer.close();
      },
      async (error: unknown) => {
        failed(error);
        await writer.abort(error);
      },
    )
    .finally(() => c.req.raw.signal.removeEventListener('abort', abort));
  // The response owns the work; observe all failures, including a disconnected client.
  void work.catch(() => undefined);
  const mime = await headers;
  return new Response(pipe.readable, {
    headers: {
      'content-type': mime,
      'cache-control': 'private, no-store, no-transform',
      'x-accel-buffering': 'no',
      'accept-ranges': 'none',
    },
  });
}
