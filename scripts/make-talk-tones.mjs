// Synthesises the two soft tones of talk mode (gap 17) — no recorded or licensed
// audio: a short sine glide with a warm second partial and a gentle envelope.
//   listen-start.wav  Buddy starts listening (a small step up)
//   listen-end.wav    Buddy stops listening (a small step down)
// Run: node scripts/make-talk-tones.mjs  (writes apps/mobile/assets/sounds/)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const OUT = join(import.meta.dirname, '../apps/mobile/assets/sounds');

function tone({ from, to, ms, gain }) {
  const n = Math.round((RATE * ms) / 1000);
  const samples = new Int16Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Glide in the first 40 %, then hold.
    const f = from + (to - from) * Math.min(1, t / 0.4) ** 0.6;
    phase += (2 * Math.PI * f) / RATE;
    // 8 ms attack, then a soft exponential fade to silence.
    const attack = Math.min(1, i / (RATE * 0.008));
    const decay = Math.exp(-4.2 * t) * (1 - t);
    const s = Math.sin(phase) + 0.18 * Math.sin(2 * phase) + 0.05 * Math.sin(3 * phase);
    samples[i] = Math.round(s * attack * decay * gain * 32767);
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.from(samples.buffer);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

writeFileSync(
  join(OUT, 'listen-start.wav'),
  wav(tone({ from: 660, to: 880, ms: 220, gain: 0.32 })),
);
writeFileSync(join(OUT, 'listen-end.wav'), wav(tone({ from: 880, to: 587, ms: 240, gain: 0.28 })));
