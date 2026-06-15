// Multi-voice TTS for foreign-language tutoring replies.
//
// Chirp 3 HD voices are monolingual: a German `Aoede` reading the
// French phrase "Quelle heure est-il?" pronounces it Germanly, which
// is exactly the wrong pedagogical signal in a French lesson. SSML
// `<lang>` tags would be the textbook fix but Chirp 3 HD doesn't
// implement them as of 2026-05.
//
// Workaround: have the tutor wrap foreign-language tokens in « »
// guillemets (the prompt enforces this for language_foreign items),
// then split the reply on those markers, synthesise each segment with
// the matching voice, concatenate the MP3 byte streams. Modern MP3
// decoders handle frame-aligned concatenation cleanly — the audio
// plays as one continuous utterance with a tiny gap at each boundary
// (usually inaudible at our 32 kbps sample rate).
//
// When no markers are present OR no foreign locale was passed, falls
// back to a single base-voice synthesis (zero overhead).

import type { Locale } from '@learnbuddy/shared-types';

import type { TTSGateway, TTSResult } from './gateway.js';

/** Match a guillemet-delimited foreign token. We accept both
 *  «text» (French style — our prompt contract) and »text« (German
 *  style — the model occasionally flips them because of native
 *  typography). Either ordering yields the inner text as the foreign
 *  token. */
const FOREIGN_RE = /«([^«»]+)»|»([^«»]+)«/g;

/** Light heuristic: pick the target locale a German prompt is asking
 *  about by looking for the language name in the question. Used by
 *  the agent route as a default when the item doesn't carry an
 *  explicit `targetLocale` field. */
export function detectForeignLocaleFromQuestion(question: string): Locale | null {
  const q = question.toLowerCase();
  if (q.includes('französisch')) return 'fr';
  if (q.includes('englisch') || q.includes('english')) return 'en';
  if (q.includes('spanisch') || q.includes('español')) return 'es';
  if (q.includes('italienisch') || q.includes('italiano')) return 'it';
  return null;
}

type Segment = { text: string; locale: Locale };

/** Split a reply into segments tagged with their target locale. Inner
 *  text of `« »` (or flipped) markers gets `foreignLocale`; everything
 *  outside stays on `baseLocale`. Markers themselves are stripped. */
export function splitForeignSegments(
  text: string,
  baseLocale: Locale,
  foreignLocale: Locale,
): Segment[] {
  const out: Segment[] = [];
  let lastIdx = 0;
  for (const match of text.matchAll(FOREIGN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) {
      const seg = text.slice(lastIdx, idx);
      if (seg.trim()) out.push({ text: seg, locale: baseLocale });
    }
    const inner = match[1] ?? match[2] ?? '';
    if (inner.trim()) out.push({ text: inner, locale: foreignLocale });
    lastIdx = idx + match[0].length;
  }
  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx);
    if (tail.trim()) out.push({ text: tail, locale: baseLocale });
  }
  // Merge adjacent same-locale segments to minimise TTS calls.
  const merged: Segment[] = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.locale === s.locale) prev.text += s.text;
    else merged.push({ ...s });
  }
  return merged;
}

/** Strip guillemet markers from text — used when we DON'T want
 *  multi-voice synthesis (no foreign locale known) but still need to
 *  keep the markers out of the spoken audio. */
export function stripForeignMarkers(text: string): string {
  return text.replace(FOREIGN_RE, (_, a, b) => (a ?? b ?? '').trim());
}

/** Synthesise a reply with mid-utterance language switching. When the
 *  text has no markers OR `foreignLocale` is null, falls through to a
 *  single tts.synthesize() call (no overhead). Otherwise: one TTS call
 *  per segment, MP3 byte concatenation, sum the usage. */
export async function synthesizeMultilingual(args: {
  tts: TTSGateway;
  text: string;
  baseLocale: Locale;
  foreignLocale: Locale | null;
  voiceId?: string | null;
  rate?: number;
}): Promise<TTSResult> {
  const { tts, baseLocale, foreignLocale, voiceId, rate } = args;
  const hasMarkers = FOREIGN_RE.test(args.text);
  // matchAll-state-reset: the global regex is stateful via .test();
  // splitForeignSegments uses matchAll which is independent, but reset
  // anyway so future callers don't accidentally inherit lastIndex.
  FOREIGN_RE.lastIndex = 0;

  if (!hasMarkers || !foreignLocale) {
    return tts.synthesize({
      text: stripForeignMarkers(args.text),
      locale: baseLocale,
      voiceId: voiceId ?? undefined,
      rate: rate ?? 1.0,
    });
  }

  const segments = splitForeignSegments(args.text, baseLocale, foreignLocale);
  if (segments.length === 0) {
    return tts.synthesize({
      text: stripForeignMarkers(args.text),
      locale: baseLocale,
      voiceId: voiceId ?? undefined,
      rate: rate ?? 1.0,
    });
  }

  const parts: Buffer[] = [];
  let chars = 0;
  let costMicros = 0;
  let mime: 'audio/mp3' | 'audio/wav' = 'audio/mp3';
  let totalDurationMs = 0;
  let modelTag = '';
  let promptVersion = '';

  for (const seg of segments) {
    // The foreign voice uses the SAME character (e.g. "Aoede") as the
    // base voice — Chirp character names are stable across locales,
    // so de-DE-Chirp3-HD-Aoede and fr-FR-Chirp3-HD-Aoede are the same
    // "voice persona" in two languages. Continuity for the kid: same
    // person talking, two languages, instead of two strangers.
    const result = await tts.synthesize({
      text: seg.text,
      locale: seg.locale,
      voiceId: voiceId ?? undefined,
      rate: rate ?? 1.0,
    });
    parts.push(Buffer.from(result.audioBase64, 'base64'));
    chars += result.usage.chars;
    costMicros += result.usage.costMicros;
    totalDurationMs += result.durationMs;
    mime = result.mime;
    modelTag = result.usage.model;
    promptVersion = result.usage.promptVersion;
  }

  const combined = Buffer.concat(parts);
  return {
    audioBase64: combined.toString('base64'),
    mime,
    durationMs: totalDurationMs,
    usage: {
      chars,
      costMicros,
      model: `${modelTag}+multilingual`,
      promptVersion,
    },
  };
}
