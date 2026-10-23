import { z } from 'zod';
import { AudioMime } from './voice.js';

/** Recognition confidence is not phonetic accuracy. 24.10 adult/espeak calibration:
 * even confidence 1 produced false corrections. Local corrections are deferred to audio.
 * Child recordings must retune these conservative acceptance thresholds; see measurement. */
export const PRONUNCIATION_THRESHOLDS = {
  reliable: 0.65,
  clear: 0.85,
  vosk: { reliable: 0.99, clear: 0.99, correction: 1.01 },
} as const;
const Word = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[\p{L}\p{M}\p{N}]+(?:['’ʼ-][\p{L}\p{M}\p{N}]+)*$/u);
export const PronunciationConfusions = z.array(z.array(Word).max(5)).min(1).max(40);
export const PronunciationPlan = z.object({
  version: z.literal(1),
  language: z.string().regex(/^[a-z]{2}$/),
  words: z
    .array(z.object({ expected: Word, confusions: z.array(Word).max(5) }))
    .min(1)
    .max(40),
});
export type PronunciationPlan = z.infer<typeof PronunciationPlan>;

export function pronunciationWords(text: string): string[] {
  return text
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .split(/[^\p{L}\p{M}\p{N}'-]+/u)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);
}
export const pronunciationKey = (text: string): string =>
  text.normalize('NFC').replace(/[‘’ʼ]/g, "'").toLowerCase();

/** Model supplies competitors in target order; code supplies targets, version and bounds. */
export function checkedPronunciationPlan(
  target: string,
  language: string,
  candidates: unknown,
): PronunciationPlan | null {
  const parsed = PronunciationConfusions.safeParse(candidates);
  const words = pronunciationWords(target);
  if (!parsed.success || words.length !== parsed.data.length) return null;
  const result = PronunciationPlan.safeParse({
    version: 1,
    language,
    words: words.map((expected, i) => ({ expected, confusions: parsed.data[i] })),
  });
  if (
    !result.success ||
    result.data.words.some((w) => {
      const all = [w.expected, ...w.confusions].map(pronunciationKey);
      return new Set(all).size !== all.length;
    })
  )
    return null;
  return result.data;
}

export const PronunciationEvidence = z.object({
  source: z.enum(['vosk', 'audio-model']),
  heard: z.string().max(500),
  elapsed_ms: z.number().finite().min(0).max(300_000),
  words: z
    .array(
      z.object({ heard: z.string().min(1).max(60), confidence: z.number().finite().min(0).max(1) }),
    )
    .max(80),
  unavailable: z.array(z.string().max(60)).max(240),
});
export type PronunciationEvidence = z.infer<typeof PronunciationEvidence>;
/** An offline take never contains audio. Mixed audio/evidence fields are rejected, not silently uploaded. */
export const PronunciationSubmission = z.union([
  z.object({
    mime: AudioMime,
    audio_base64: z.string().min(100).max(1_400_000),
    evidence: z.never().optional(),
  }),
  z.object({
    evidence: PronunciationEvidence.extend({ source: z.literal('vosk') }),
    mime: z.never().optional(),
    audio_base64: z.never().optional(),
  }),
]);
export const PronunciationVerdict = z.enum(['passt', 'fast', 'nochmal', 'unsicher']);
export const PronunciationResult = z.object({
  source: PronunciationEvidence.shape.source,
  elapsed_ms: PronunciationEvidence.shape.elapsed_ms,
  overall: PronunciationVerdict,
  words: z
    .array(
      z.object({
        expected: Word,
        heard: z.string().nullable(),
        confidence: z.number().min(0).max(1),
        verdict: PronunciationVerdict,
      }),
    )
    .min(1)
    .max(40),
});
export type PronunciationResult = z.infer<typeof PronunciationResult>;
export type PronunciationAudio = { mime: z.infer<typeof AudioMime>; audio_base64: string };
/** Both implementations return evidence and the same code-derived breakdown. Audio is ephemeral. */
export interface PronunciationChecker {
  check(
    plan: PronunciationPlan,
    audio: PronunciationAudio,
    signal?: AbortSignal,
  ): Promise<{
    evidence: PronunciationEvidence;
    result: PronunciationResult;
  }>;
}

/** Sequence alignment preserves omissions/repetitions. Competitors count as a match for alignment only. */
export function gradePronunciation(
  plan: PronunciationPlan,
  input: PronunciationEvidence,
): PronunciationResult {
  const e = PronunciationEvidence.parse(input);
  const n = plan.words.length,
    m = e.words.length;
  const belongs = (i: number, j: number) => {
    const w = plan.words[i]!;
    return [w.expected, ...w.confusions].some(
      (v) => pronunciationKey(v) === pronunciationKey(e.words[j]!.heard),
    );
  };
  // Prefer a known competitor plus an insertion/omission over two unrelated substitutions.
  const costs = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      costs[i]![j] = Math.min(
        costs[i - 1]![j]! + 1,
        costs[i]![j - 1]! + 1,
        costs[i - 1]![j - 1]! + (belongs(i - 1, j - 1) ? 0 : 1.5),
      );
    }
  const aligned = new Map<number, number>();
  let i = n,
    j = m;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      costs[i]![j] === costs[i - 1]![j - 1]! + (belongs(i - 1, j - 1) ? 0 : 1.5)
    ) {
      aligned.set(--i, --j);
    } else if (i > 0 && costs[i]![j] === costs[i - 1]![j]! + 1) i--;
    else j--;
  }
  const unavailable = new Set(e.unavailable.map(pronunciationKey));
  const thresholds = e.source === 'vosk' ? PRONUNCIATION_THRESHOLDS.vosk : PRONUNCIATION_THRESHOLDS;
  const words = plan.words.map((w, at): PronunciationResult['words'][number] => {
    const observed = aligned.has(at) ? e.words[aligned.get(at)!] : undefined;
    const confidence = observed?.confidence ?? 0;
    const heard = observed?.heard ?? null;
    const uncertain =
      !heard ||
      pronunciationKey(heard) === '[unk]' ||
      confidence < thresholds.reliable ||
      (e.source === 'vosk' &&
        pronunciationKey(heard) !== pronunciationKey(w.expected) &&
        confidence < PRONUNCIATION_THRESHOLDS.vosk.correction) ||
      [w.expected, ...w.confusions].some((v) => unavailable.has(pronunciationKey(v)));
    const verdict = uncertain
      ? 'unsicher'
      : pronunciationKey(heard!) !== pronunciationKey(w.expected)
        ? 'nochmal'
        : confidence >= thresholds.clear
          ? 'passt'
          : 'fast';
    return { expected: w.expected, heard, confidence, verdict };
  });
  const overall =
    aligned.size < m || words.some((w) => w.verdict === 'unsicher')
      ? 'unsicher'
      : words.some((w) => w.verdict === 'nochmal')
        ? 'nochmal'
        : words.some((w) => w.verdict === 'fast')
          ? 'fast'
          : 'passt';
  return { source: e.source, elapsed_ms: e.elapsed_ms, words, overall };
}
