// Decode in memory; no temporary recording or native executable is created.
import decode from '@audio/decode';
import { encode } from 'wav-encoder';
import { LlmError, TOO_LARGE } from '../llm/gateway.js';

type Recording = { mimeType: string; data: string };
const MAX_PCM_SAMPLES = 6_000_000; // mono PCM16 + base64 remains below the gateway's 20 MB bound
export async function pronunciationAudio(
  recording: Recording,
  signal?: AbortSignal,
): Promise<{ format: 'wav' | 'mp3'; data: string }> {
  if (recording.mimeType === 'audio/mpeg') return { format: 'mp3', data: recording.data };
  if (recording.mimeType === 'audio/wav') return { format: 'wav', data: recording.data };
  const { mono, sampleRate } = await decodeMono(recording, signal);
  const wav = await encode({ sampleRate, channelData: [mono] }, { bitDepth: 16 });
  return { format: 'wav', data: Buffer.from(wav).toString('base64') };
}

/** Realtime consumes the original sound as PCM16 mono at 24 kHz, without transcription. */
export async function realtimePcm(recording: Recording, signal?: AbortSignal): Promise<string> {
  const { mono, sampleRate } = await decodeMono(recording, signal);
  const ratio = sampleRate / 24000;
  const length = Math.floor(mono.length / ratio);
  if (length > MAX_PCM_SAMPLES)
    throw new LlmError('refused', 'Resampled recording exceeds the audio bound', null, TOO_LARGE);
  const pcm = Buffer.alloc(length * 2);
  for (let i = 0; i < length; i++) {
    if (i % 24000 === 0) signal?.throwIfAborted();
    const position = i * ratio;
    const left = Math.floor(position);
    const fraction = position - left;
    const sample =
      mono[left]! * (1 - fraction) + mono[Math.min(left + 1, mono.length - 1)]! * fraction;
    const bounded = Math.max(-1, Math.min(1, sample));
    pcm.writeInt16LE(Math.round(bounded * (bounded < 0 ? 32768 : 32767)), i * 2);
  }
  return pcm.toString('base64');
}

async function decodeMono(
  recording: Recording,
  signal?: AbortSignal,
): Promise<{ mono: Float32Array; sampleRate: number }> {
  const format =
    recording.mimeType === 'audio/wav'
      ? 'wav'
      : recording.mimeType === 'audio/mpeg'
        ? 'mp3'
        : recording.mimeType === 'audio/webm'
          ? 'webm'
          : recording.mimeType === 'audio/aac'
            ? 'aac'
            : 'm4a';
  const bytes = Buffer.from(recording.data, 'base64');
  async function* chunks() {
    for (let at = 0; at < bytes.length; at += 65536) {
      signal?.throwIfAborted();
      yield bytes.subarray(at, at + 65536);
    }
  }
  const parts: Float32Array[] = [];
  let total = 0,
    sampleRate = 0;
  try {
    for await (const decoded of decode(chunks(), format)) {
      signal?.throwIfAborted();
      if (!decoded.channelData.length || !decoded.channelData[0]?.length) continue;
      if (
        decoded.channelData.length > 2 ||
        !Number.isInteger(decoded.sampleRate) ||
        decoded.sampleRate < 8000 ||
        decoded.sampleRate > 48000 ||
        (sampleRate !== 0 && sampleRate !== decoded.sampleRate)
      )
        throw new LlmError('refused', 'Unsupported recording channels or sample rate');
      sampleRate = decoded.sampleRate;
      const mono = decoded.channelData[0].slice();
      total += mono.length;
      if (total > MAX_PCM_SAMPLES)
        throw new LlmError('refused', 'Decoded recording exceeds the audio bound', null, TOO_LARGE);
      if (decoded.channelData.length === 2) {
        const right = decoded.channelData[1]!;
        for (let i = 0; i < mono.length; i++) mono[i] = (mono[i]! + right[i]!) / 2;
      }
      parts.push(mono);
    }
    if (total === 0) throw new LlmError('refused', 'Recording contains no decodable samples');
    const mono = new Float32Array(total);
    let at = 0;
    for (const part of parts) {
      mono.set(part, at);
      at += part.length;
    }
    return { mono, sampleRate };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof LlmError) throw error;
    throw new LlmError('refused', 'Recording could not be decoded');
  }
}
