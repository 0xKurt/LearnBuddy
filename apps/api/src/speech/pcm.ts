import { encode } from 'wav-encoder';
import { SpeechError } from './gateway.js';

/** Cache/legacy clients receive a real WAV; streaming clients consume the original PCM. */
export async function pcmWav(pcm: Buffer): Promise<Buffer> {
  if (!pcm.length || pcm.length % 2) throw new SpeechError('refused', 'Invalid PCM output');
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return Buffer.from(await encode({ sampleRate: 24000, channelData: [samples] }, { bitDepth: 16 }));
}
