// How a text is read aloud in Buddy's natural voice (ADR 0008). Pure (no React Native),
// unit-tested; lib/speech/listen.ts plays it.
//
// - A text is read sentence by sentence (lib/speech/sentences.ts): each sentence is one
//   request to POST /voice/speech, the next is fetched while one plays, and the sentence being
//   played is what read-along highlights.
// - When the server says no, or cannot be reached, the phone's own voice reads instead — for
//   a while, so a reply does not wait on a failing request for every sentence.

import { nextSentences } from './sentences.js';

/** SpeechRequest.text allows at most 600 characters. */
export const MAX_SPEECH_CHARS = 600;

export type ReadingPart = {
  /** Index of the sentence in `sentencesOf(text)` (what is highlighted). */
  at: number;
  /** What is sent to be spoken (math in words), in pieces the server accepts. */
  spoken: string[];
};

/** The sentences of a text as it is read (and highlighted). */
export function sentencesOf(text: string): string[] {
  return nextSentences(text, 0, true).parts;
}

/** Where each sentence of `sentencesOf(text)` stands in the text: [start, end). */
export function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let from = 0;
  for (const s of sentencesOf(text)) {
    const start = text.indexOf(s, from);
    if (start < 0) break;
    spans.push([start, start + s.length]);
    from = start + s.length;
  }
  return spans;
}

/** Cuts a long spoken sentence at spaces into pieces of at most `max` characters. */
export function chunkSpoken(text: string, max = MAX_SPEECH_CHARS): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+/g, ' ').trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(' ', max);
    const at = cut > max / 2 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * A long opening sentence is cut at its first clause boundary, so the first audio is
 * short (issue #41: ~0.85 s for a normal sentence, ~1.8 s for a long one). Only at a
 * comma, dash, colon or semicolon — a cut mid-clause would sound wrong, and then it is
 * better to wait. The piece stays in the same sentence, so read-along still highlights it.
 */
const OPENING_MAX = 110;
const OPENING_MIN = 40;

export function shortOpening(spoken: string): string[] {
  if (spoken.length <= OPENING_MAX) return [spoken];
  const window = spoken.slice(0, OPENING_MAX);
  let cut = -1;
  for (const m of window.matchAll(/[,;:—–]\s/g)) {
    const at = (m.index ?? 0) + m[0].length;
    if (at >= OPENING_MIN) cut = at;
  }
  if (cut < 0) return [spoken];
  return [spoken.slice(0, cut).trim(), spoken.slice(cut).trim()];
}

/** The parts to read: every sentence with something to say, in order. */
export function readingParts(text: string, transform: (s: string) => string): ReadingPart[] {
  const parts = sentencesOf(text)
    .map((s, at) => ({ at, spoken: chunkSpoken(transform(s)) }))
    .filter((p) => p.spoken.length > 0);
  const first = parts[0];
  const opening = first?.spoken[0];
  if (!first || opening === undefined) return parts;
  const split = shortOpening(opening);
  if (split.length === 1) return parts;
  return [{ at: first.at, spoken: [...split, ...first.spoken.slice(1)] }, ...parts.slice(1)];
}

/** A refused or failed /voice/speech call, as the app's ApiError carries it. */
export type SpeechFailure = {
  status: number;
  code: string;
  reason: string | null;
  retryAfterS: number | null;
};

const MINUTE = 60_000;

/**
 * How long the natural voice rests after a failure (the phone's voice reads meanwhile):
 * not configured → 30 min; a language it lacks → that language for the app run; the budget →
 * until it refills; offline → 30 s; anything else → 1 min.
 */
export function restAfter(f: SpeechFailure): { scope: 'all' | 'language'; ms: number } {
  if (f.reason === 'language') return { scope: 'language', ms: 24 * 60 * MINUTE };
  if (f.reason === 'speech_off') return { scope: 'all', ms: 30 * MINUTE };
  if (f.status === 429) return { scope: 'all', ms: (f.retryAfterS ?? 600) * 1000 };
  if (f.code === 'network') return { scope: 'all', ms: 30_000 };
  if (f.status === 401 || f.status === 403) return { scope: 'all', ms: 5 * MINUTE };
  return { scope: 'all', ms: MINUTE };
}

/** Whether to ask for the natural voice now; remembers failures and her speed. */
export class NaturalGate {
  private allOffUntil = 0;
  private readonly languageOffUntil = new Map<string, number>();
  /** Her speed step as the server last said (-2 … +2), also for the phone's voice. */
  speed = 0;

  constructor(private readonly now: () => number = Date.now) {}

  allows(locale: string): boolean {
    const t = this.now();
    return t >= this.allOffUntil && t >= (this.languageOffUntil.get(locale) ?? 0);
  }

  failed(locale: string, f: SpeechFailure): void {
    const rest = restAfter(f);
    const until = this.now() + rest.ms;
    if (rest.scope === 'language') this.languageOffUntil.set(locale, until);
    else this.allOffUntil = Math.max(this.allOffUntil, until);
  }
}

/** Rates of the speed steps (the server's rateFor, apps/api/src/speech/gateway.ts). */
const STEP_RATE = [0.75, 0.88, 1, 1.12, 1.25] as const;

/** The phone voice's rate for her speed step, on top of normal or "langsam". */
export function deviceRate(base: number, speed: number): number {
  const step = Math.max(-2, Math.min(2, Math.round(speed)));
  return Math.round(base * STEP_RATE[step + 2]! * 100) / 100;
}

/**
 * Progress in a sentence (0…1) from the player's position; null while its length is unknown.
 */
export function playbackProgress(currentTime: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(0, Math.min(1, currentTime / duration));
}
