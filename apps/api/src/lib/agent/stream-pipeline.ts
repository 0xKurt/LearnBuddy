// Streaming pipeline for the voice tutor path. Glues three async
// surfaces together:
//
//   1. DeepSeek streaming chat completion — yields chunks of text
//      (the model's JSON reply, character by character).
//   2. An incremental JSON-reply extractor — pulls the running value of
//      the `reply` field out of partial JSON without waiting for the
//      closing brace.
//   3. A sentence-boundary detector + TTS synthesiser — every time a
//      complete sentence lands in `reply`, kick off a TTS call so the
//      mobile can start playback while the model is still generating.
//
// The whole point is voice latency: instead of waiting ~3 s for the
// LLM + ~2 s for TTS before any audio plays, the kid hears the first
// sentence ~1.2 s after they stop talking. The remaining sentences
// stream in while the first one is still playing.
//
// Text-only callers can use the same pipeline minus the TTS step —
// they get progressive on-screen text by listening to `onTextDelta`.

import type { Env } from '../env.js';
import type { TTSGateway } from '../voice/gateway.js';
import type { Locale } from '@learnbuddy/shared-types';
import { synthesizeMultilingual } from '../voice/multilingual-tts.js';
import {
  streamVertexOpenAIChat,
  type OpenAIChatRequest,
  type OpenAIChatResponse,
} from '../llm/vertex-openai.js';

export type StreamPipelineInput = {
  env: Env;
  modelId: string;
  systemContent: string;
  history: ReadonlyArray<{ role: 'learner' | 'tutor'; content: string }>;
  learnerMessage: string;
  /** Base UI locale for TTS (German for our app). */
  baseLocale: Locale;
  /** When non-null, foreign-language tokens wrapped in « » are spoken
   *  with this locale's Chirp voice (mid-utterance switch). */
  foreignLocale: Locale | null;
  /** Caller's Chirp voice character (`Aoede`, `Leda`, …). Same
   *  character for all segments so it sounds like one bilingual
   *  speaker. */
  voiceId?: string | null;
  /** Synthesise per-sentence TTS as the reply streams. Set to false
   *  for text-only turns where TTS would just burn cycles. */
  withAudio: boolean;
  tts: TTSGateway;
};

export type StreamPipelineEvents = {
  /** Fired every time new text is appended to `reply`. The argument
   *  is the full reply text so far (not just the delta) — easier for
   *  the caller to overwrite the chat bubble. */
  onReplySoFar: (replySoFar: string) => void | Promise<void>;
  /** Fired once per sentence boundary, after TTS for that sentence
   *  completes. Order is guaranteed (we await sequentially). When
   *  `withAudio` is false, never fires. */
  onAudioChunk: (chunk: {
    base64: string;
    mime: string;
    durationMs: number;
    index: number;
  }) => void | Promise<void>;
};

export type StreamPipelineResult = {
  /** Final accumulated raw JSON text from the LLM. The caller parses
   *  this for verdict / intent / etc. */
  rawJson: string;
  /** Final reply text (markers preserved — same as the model emitted). */
  reply: string;
  /** Number of audio chunks emitted. */
  audioChunksEmitted: number;
  /** Provider usage stats (token counts + cached hits) when available. */
  usage: OpenAIChatResponse['usage'] | undefined;
};

/** Greedy extractor: walks the accumulated JSON text and returns the
 *  current value of the `reply` field, unescaped, even if the JSON is
 *  mid-string with no closing quote yet. Returns '' when the field
 *  hasn't started yet. */
export function extractReplySoFar(buffer: string): string {
  const keyIdx = buffer.indexOf('"reply"');
  if (keyIdx < 0) return '';
  // Skip whitespace and the colon to the opening quote.
  let i = keyIdx + '"reply"'.length;
  while (i < buffer.length && /\s/.test(buffer[i]!)) i++;
  if (buffer[i] !== ':') return '';
  i++;
  while (i < buffer.length && /\s/.test(buffer[i]!)) i++;
  if (buffer[i] !== '"') return '';
  i++;
  // Walk through the string, handling escapes.
  let out = '';
  for (; i < buffer.length; i++) {
    const c = buffer[i]!;
    if (c === '\\') {
      const n = buffer[i + 1];
      if (n === undefined) break; // partial escape — wait for next chunk
      switch (n) {
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case '/':
          out += '/';
          break;
        case 'n':
          out += '\n';
          break;
        case 't':
          out += '\t';
          break;
        case 'r':
          out += '\r';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'u': {
          const hex = buffer.slice(i + 2, i + 6);
          if (hex.length < 4) return out; // wait for full \uXXXX
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        default:
          out += n; // unknown escape — preserve next char
      }
      i++;
    } else if (c === '"') {
      // Closing quote of the reply string.
      return out;
    } else {
      out += c;
    }
  }
  return out;
}

/** Find sentence boundaries in `reply` and return the array of new
 *  COMPLETED sentences since `lastIndex`. A sentence is complete when
 *  followed by whitespace or end-of-buffer AFTER one of `.?!`. We
 *  don't split inside « » markers (guillemet depth > 0).
 *
 *  Returns:
 *    { sentences: [...], nextIndex }
 *  where `nextIndex` is the position in `reply` where the next
 *  sentence starts (after the trailing whitespace / EOL). */
export function splitNewSentences(
  reply: string,
  lastIndex: number,
  treatTailAsComplete = false,
): { sentences: string[]; nextIndex: number } {
  const sentences: string[] = [];
  let depth = 0;
  let start = lastIndex;
  let i = lastIndex;
  for (; i < reply.length; i++) {
    const c = reply[i]!;
    if (c === '«') depth++;
    else if (c === '»') depth = Math.max(0, depth - 1);
    if (depth > 0) continue;
    if (c === '.' || c === '?' || c === '!') {
      // Look ahead: sentence is complete on whitespace or end.
      const next = reply[i + 1];
      const isBoundary = next === undefined || /\s/.test(next);
      if (isBoundary) {
        // Skip trailing whitespace after the punctuation.
        let j = i + 1;
        while (j < reply.length && /\s/.test(reply[j]!)) j++;
        const seg = reply.slice(start, j).trim();
        if (seg) sentences.push(seg);
        start = j;
        i = j - 1;
      }
    }
  }
  // On the final pass (LLM emitted [DONE]), flush whatever's left even
  // without trailing punctuation so the last fragment still gets TTS.
  if (treatTailAsComplete && start < reply.length) {
    const tail = reply.slice(start).trim();
    if (tail) sentences.push(tail);
    start = reply.length;
  }
  return { sentences, nextIndex: start };
}

/** Run the full pipeline. Sentence-boundary TTS calls are awaited
 *  SEQUENTIALLY so audio chunks are emitted in playback order — the
 *  mobile queue can just append. */
export async function runStreamPipeline(
  input: StreamPipelineInput,
  events: StreamPipelineEvents,
): Promise<StreamPipelineResult> {
  const messages = [
    { role: 'system' as const, content: input.systemContent },
    ...input.history.map((m) => ({
      role: m.role === 'learner' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    })),
    { role: 'user' as const, content: input.learnerMessage },
  ];

  const body: OpenAIChatRequest = {
    model: input.modelId,
    messages,
    temperature: 0.4,
    top_p: 0.9,
    max_tokens: 800,
    response_format: { type: 'json_object' },
  };

  let buffer = '';
  let replySoFar = '';
  let lastSentenceIdx = 0;
  let audioCount = 0;
  let usage: OpenAIChatResponse['usage'] | undefined;
  let lastEmittedReply = '';
  let lastEmitAt = 0;
  // Minimum time between client-bound reply_chunk frames. DeepSeek
  // sends ~1-2 chars per token, so without throttling we emit ~50
  // frames/second — RN re-layouts the bubble per frame and the kid
  // sees a juddery, letter-by-letter unfold. 80 ms gives a smooth
  // word-by-word feel that still looks "live."
  const MIN_EMIT_INTERVAL_MS = 80;

  const flushSentences = async (treatTailAsComplete: boolean): Promise<void> => {
    const { sentences, nextIndex } = splitNewSentences(
      replySoFar,
      lastSentenceIdx,
      treatTailAsComplete,
    );
    lastSentenceIdx = nextIndex;
    if (!input.withAudio || sentences.length === 0) return;
    for (const sentence of sentences) {
      try {
        const audio = await synthesizeMultilingual({
          tts: input.tts,
          text: sentence,
          baseLocale: input.baseLocale,
          foreignLocale: input.foreignLocale,
          voiceId: input.voiceId,
          rate: 1.0,
        });
        const idx = audioCount++;
        await events.onAudioChunk({
          base64: audio.audioBase64,
          mime: audio.mime,
          durationMs: audio.durationMs,
          index: idx,
        });
      } catch (err) {
        // Don't fail the whole turn over one bad sentence — log + keep
        // streaming. Mobile will just have a gap in audio there.
        console.warn(
          `[stream-pipeline] sentence TTS failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  };

  for await (const delta of streamVertexOpenAIChat({
    project: input.env.GOOGLE_CLOUD_PROJECT!,
    location: input.env.PARTNER_MODEL_LOCATION,
    body,
  })) {
    if (delta.usage) usage = delta.usage;
    if (delta.content) {
      buffer += delta.content;
      const newReply = extractReplySoFar(buffer);
      if (newReply !== replySoFar) {
        replySoFar = newReply;
        // Throttle reply_chunk emission. We emit ONLY when:
        //   - it's been > MIN_EMIT_INTERVAL_MS since the last frame, OR
        //   - the buffer ends at a word boundary (space, punctuation),
        //     so we ride out a multi-token word as one chunk and emit
        //     when the word completes — that's the smoothest cadence.
        const endsAtBoundary = /[\s.,;:!?)\]}»»]$/.test(replySoFar);
        const now = Date.now();
        if (endsAtBoundary || now - lastEmitAt >= MIN_EMIT_INTERVAL_MS) {
          if (replySoFar !== lastEmittedReply) {
            lastEmittedReply = replySoFar;
            lastEmitAt = now;
            await events.onReplySoFar(replySoFar);
          }
        }
        // Sentence detection always runs — TTS chunks are gated by
        // the sentence-boundary regex, not by the throttle.
        await flushSentences(false);
      }
    }
    if (delta.done) {
      // Final flush — any text after the last `.` should still get
      // TTS. This is also the path that handles tiny replies with no
      // terminal punctuation at all.
      const finalReply = extractReplySoFar(buffer);
      if (finalReply !== replySoFar) replySoFar = finalReply;
      if (replySoFar !== lastEmittedReply) {
        // Always send the final accumulated reply even if it hasn't
        // changed since the last throttle window.
        lastEmittedReply = replySoFar;
        await events.onReplySoFar(replySoFar);
      }
      await flushSentences(true);
      break;
    }
  }

  return {
    rawJson: buffer,
    reply: replySoFar,
    audioChunksEmitted: audioCount,
    usage,
  };
}
