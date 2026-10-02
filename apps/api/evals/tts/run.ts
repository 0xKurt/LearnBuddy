// Where does the wait in a voice-mode turn come from (issue #24)? Against the live model and
// the live speech provider, per sentence of Buddy's reply: when its text is written, how long
// the provider takes to synthesise it, and how long the audio plays. From those three the
// timeline of a whole turn is computed for the schedule the app runs today and for pipelined
// ones — so a gap between two sentences is a measured number, not a guess.
//
// Needs LLM_BACKEND=vertex, SPEECH_BACKEND=google, GOOGLE_* variables and a local Postgres.
//   cd apps/api && SPEECH_BACKEND=google npx tsx evals/tts/run.ts [rounds]
// requires live verification in Claude Code session (stand-ins for the outside world; live model)

import type { SendMessageResponse } from '@learnbuddy/shared-types/contracts';

import { loadConfig } from '../../src/config.js';
import { evalEnv } from '../eval-env.js';
import type { LlmGateway, LlmRequest } from '../../src/llm/gateway.js';
import { partialString } from '../../src/llm/partial.js';
import { VertexGateway } from '../../src/llm/vertex.js';
import { GoogleSpeech } from '../../src/speech/google.js';
import { rateFor } from '../../src/speech/gateway.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';

// The Vertex variables live in apps/api/.env.local, like every other eval.
const dotenv = await import('dotenv');
dotenv.config({ path: '.env.local' });

const config = loadConfig({
  ...evalEnv(),
  SPEECH_BACKEND: 'google',
  DATABASE_URL: 'postgres://unused/unused',
  SUPABASE_URL: 'http://x.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
});
const speech = new GoogleSpeech(config);
const real = new VertexGateway(config);

// ─────────────── how long an MP3 plays ───────────────

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

/**
 * Playing time of an MP3 in seconds, from its Layer III frame headers (the provider answers
 * with MP3; the phone plays exactly these bytes). Frames are walked, not estimated from the
 * average bitrate, so a variable-rate stream is right too.
 */
export function mp3Seconds(buf: Buffer): number {
  let at = 0;
  let seconds = 0;
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff || (buf[at + 1]! & 0xe0) !== 0xe0) {
      at++;
      continue;
    }
    const version = (buf[at + 1]! >> 3) & 0x3;
    const layer = (buf[at + 1]! >> 1) & 0x3;
    const bitrateBits = (buf[at + 2]! >> 4) & 0xf;
    const rateBits = (buf[at + 2]! >> 2) & 0x3;
    const padding = (buf[at + 2]! >> 1) & 0x1;
    const rates = RATES[version];
    // Layer III only (01); anything else is a false sync inside the payload.
    if (layer !== 1 || !rates || rateBits === 3 || bitrateBits === 0 || bitrateBits === 15) {
      at++;
      continue;
    }
    const sampleRate = rates[rateBits]!;
    const kbps = (version === 3 ? MPEG1_L3 : MPEG2_L3)[bitrateBits]!;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor((samples / 8) * ((kbps * 1000) / sampleRate)) + padding;
    if (length <= 4) {
      at++;
      continue;
    }
    seconds += samples / sampleRate;
    at += length;
  }
  return seconds;
}

// ─────────────── the sentences of a reply, as the app cuts them ───────────────

/**
 * The complete sentences of `text` — the same rule as the app's
 * apps/mobile/lib/speech/sentences.ts `nextSentences(text, 0, true)`, which decides what one
 * request to /voice/speech carries. Kept here because the eval cannot import across packages.
 */
function sentencesOf(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  const end = /[.!?…]+["“”»)]?(?=\s)|\n/g;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const stop = m.index + m[0].length;
    if (m[0] !== '\n' && /(?:^|[\s(„"])\p{L}$/u.test(text.slice(start, m.index))) continue;
    const part = text.slice(start, stop).trim();
    if (part) parts.push(part);
    start = stop;
  }
  const rest = text.slice(start).trim();
  if (rest) parts.push(rest);
  return parts;
}

// ─────────────── when each sentence of the reply is written ───────────────

type Written = { text: string; at: number };
/** Per model call: the reply's text over time, so a sentence's finishing time is known. */
let snapshots: Written[] = [];
let replyDone = NaN;

const gateway: LlmGateway = {
  available: true,
  async generate(req: LlmRequest) {
    const t0 = performance.now();
    if (req.purpose === 'buddy_turn') {
      snapshots = [];
      replyDone = NaN;
    }
    return real.generate({
      ...req,
      onPartial: (soFar) => {
        if (req.purpose !== 'buddy_turn') return;
        const r = partialString(soFar, 'reply');
        if (!r) return;
        snapshots.push({ text: r.text, at: performance.now() - t0 });
        if (r.done && Number.isNaN(replyDone)) replyDone = performance.now() - t0;
      },
    });
  },
};

/** When the text of each sentence of `reply` was complete (ms after the turn started). */
function writtenAt(reply: string): Array<{ text: string; known: number }> {
  return sentencesOf(reply).map((s) => {
    const upTo = reply.indexOf(s) + s.length;
    const snap = snapshots.find(
      (w) => w.text.length >= upTo && w.text.startsWith(reply.slice(0, upTo)),
    );
    return { text: s, known: snap?.at ?? (Number.isNaN(replyDone) ? 0 : replyDone) };
  });
}

// ─────────────── synthesising, for real ───────────────

const RATE = rateFor(0, false);

async function synth(text: string): Promise<{ ms: number; seconds: number; bytes: number }> {
  const t0 = performance.now();
  const audio = await speech.synthesize({
    text,
    locale: 'de-DE',
    voice: 'warm',
    rate: RATE,
    timeoutMs: 8000,
  });
  return {
    ms: performance.now() - t0,
    seconds: mp3Seconds(audio.audio),
    bytes: audio.audio.length,
  };
}

// ─────────────── the three schedules ───────────────

type Piece = {
  text: string;
  /** ms after the turn started, when this sentence's text was complete. */
  known: number;
  /** Synthesis time when requests do not overlap. */
  serial: number;
  /** Synthesis time when every sentence is requested at once. */
  parallel: number;
  /** How long the audio plays. */
  play: number;
};

type Mode = 'before' | 'after' | 'all';

/**
 * - `before` — until 29.09. the app called speak() once per sentence (createStreamSpeaker), so
 *   the next sentence was only asked for once the one before had finished playing.
 * - `after`  — one reading for the whole reply (issue #24): the next sentence is asked for as
 *   soon as the current audio has arrived, so it is synthesised while that one plays.
 * - `all`    — every sentence asked for as soon as its text is written, all in flight.
 */
function timeline(pieces: Piece[], mode: Mode): { first: number; gaps: number[]; end: number } {
  let end = 0;
  let arrived = 0;
  const gaps: number[] = [];
  let first = 0;
  for (const [i, p] of pieces.entries()) {
    const request =
      mode === 'all'
        ? p.known
        : i === 0
          ? p.known
          : Math.max(p.known, mode === 'before' ? end : arrived);
    arrived = request + (mode === 'all' ? p.parallel : p.serial);
    const start = Math.max(arrived, end);
    if (i === 0) first = start;
    else gaps.push(start - end);
    end = start + p.play;
  }
  return { first, gaps, end };
}

// ─────────────── run ───────────────

const env = await createTestEnv({ start: '2026-09-28T13:30:00Z', gateway });
const l = await onboard(env, {
  relation: 'child',
  name: 'Lena',
  birthDate: '2014-02-10',
  pin: '4826',
});

const prompts = [
  'was ist nochmal ein nenner',
  'kannst du mir erklären wie man brüche addiert',
  'ich hab morgen englisch test und keine ahnung wie ich lernen soll',
];
const rounds = Number(process.argv[2] ?? 1);
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const turns: Array<{ prompt: string; pieces: Piece[] }> = [];

for (let round = 0; round < rounds; round++) {
  for (const prompt of prompts) {
    const r = await l.api.post<SendMessageResponse>('/buddy/messages', {
      client_message_id: crypto.randomUUID(),
      text: prompt,
    });
    if (r.status !== 200) {
      console.log(`chat ${r.status} for "${prompt}" — skipped`);
      continue;
    }
    const thread = r.body.home.thread;
    const reply = [...thread].reverse().find((m) => m.role === 'buddy')?.text ?? '';
    const written = writtenAt(reply);
    if (written.length === 0) continue;

    // Serial, cold: exactly what one /voice/speech call costs today.
    const serial: Array<{ ms: number; seconds: number; bytes: number }> = [];
    for (const w of written) serial.push(await synth(w.text));

    // The same sentences, all at once: what a pipelined schedule would see.
    const t0 = performance.now();
    const parallel = await Promise.all(written.map((w) => synth(w.text)));
    const parallelWall = performance.now() - t0;

    const pieces: Piece[] = written.map((w, i) => ({
      text: w.text,
      known: w.known,
      serial: serial[i]!.ms,
      parallel: parallel[i]!.ms,
      play: serial[i]!.seconds * 1000,
    }));
    turns.push({ prompt, pieces });

    console.log(`\n── "${prompt}"`);
    console.log('  #  written  synth(serial)  synth(parallel)  plays   chars');
    for (const [i, p] of pieces.entries())
      console.log(
        `  ${i + 1}  ${fmt(p.known).padStart(7)}  ${fmt(p.serial).padStart(13)}  ${fmt(
          p.parallel,
        ).padStart(15)}  ${fmt(p.play).padStart(6)}   ${String(p.text.length).padStart(5)}`,
      );
    console.log(`  all sentences in parallel: wall ${fmt(parallelWall)}`);
    for (const mode of ['before', 'after', 'all'] as const) {
      const t = timeline(pieces, mode);
      console.log(
        `  ${mode.padEnd(6)} first audio ${fmt(t.first)} · gaps ${
          t.gaps.length ? t.gaps.map(fmt).join(' ') : '–'
        } · silence ${fmt(t.gaps.reduce((a, b) => a + b, 0))} · done ${fmt(t.end)}`,
      );
    }
  }
}

// Does the provider itself cache? If it did, the parallel numbers above would flatter the
// pipelined schedule. Same sentence twice, one after the other.
const probe = turns[0]?.pieces[0]?.text;
if (probe) {
  const a = await synth(probe);
  const b = await synth(probe);
  console.log(`\nprovider cache probe: ${fmt(a.ms)} then ${fmt(b.ms)} for the same sentence`);
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};
if (turns.length > 0) {
  const all = turns.flatMap((t) => t.pieces);
  console.log(
    `\nmedian per sentence: synth ${fmt(med(all.map((p) => p.serial)))} (serial) · ${fmt(
      med(all.map((p) => p.parallel)),
    )} (parallel) · plays ${fmt(med(all.map((p) => p.play)))} · ${all.length} sentences`,
  );
  console.log('mode    first audio   silence between sentences   turn done');
  for (const mode of ['before', 'after', 'all'] as const) {
    const ts = turns.map((t) => timeline(t.pieces, mode));
    console.log(
      `${mode.padEnd(6)}  ${fmt(med(ts.map((t) => t.first))).padStart(11)}   ${fmt(
        med(ts.map((t) => t.gaps.reduce((a, b) => a + b, 0))),
      ).padStart(25)}   ${fmt(med(ts.map((t) => t.end))).padStart(9)}`,
    );
  }
}

await env.close();
