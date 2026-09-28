// Synthesises the two soft cues of talk mode (gap 17) — no recorded or licensed
// audio. Discrete short notes, deliberately WITHOUT any pitch glide: the earlier
// glissando version read as a whimpering animal (user feedback 2026-09-28).
//   listen-start.wav  Buddy starts listening (two soft taps, upward: C5 → E5)
//   listen-end.wav    Buddy stops listening (one lower soft tap: G4)
// Run: node scripts/make-talk-tones.mjs  (writes apps/mobile/assets/sounds/)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 22050;
const OUT = join(import.meta.dirname, '../apps/mobile/assets/sounds');

/** One static-pitch note: soft attack, warm body, fast fade — a tap, not a whine. */
function note({ freq, ms, gain }) {
  const n = Math.round((RATE * ms) / 1000);
  const samples = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (2 * Math.PI * freq) / RATE;
    const attack = Math.min(1, i / (RATE * 0.006));
    const decay = Math.exp(-5.5 * t) * (1 - t);
    // Mostly fundamental; a whisper of the octave keeps it warm, nothing above.
    const s = Math.sin(phase) + 0.12 * Math.sin(2 * phase);
    samples[i] = s * attack * decay * gain;
  }
  return samples;
}

function silence(ms) {
  return new Float64Array(Math.round((RATE * ms) / 1000));
}

function toInt16(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) out[at + i] = Math.round(p[i] * 32767);
    at += p.length;
  }
  return out;
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
  wav(
    toInt16([
      note({ freq: 523.25, ms: 70, gain: 0.2 }), // C5
      silence(30),
      note({ freq: 659.25, ms: 80, gain: 0.24 }), // E5
    ]),
  ),
);
writeFileSync(join(OUT, 'listen-end.wav'), wav(toInt16([note({ freq: 392, ms: 110, gain: 0.2 })])));
