import {
  gradePronunciation,
  pronunciationKey,
  PronunciationEvidence,
  type PronunciationChecker,
  type PronunciationPlan,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

export type VoskBridge = {
  checkPcm(path: string, pcm: string, grammar: string): Promise<string>;
  releaseCheckModel(): Promise<void>;
};
const NativeResult = z.object({
  words: z
    .array(z.object({ word: z.string().min(1).max(60), conf: z.number().min(0).max(1) }))
    .max(80),
  unavailable: z.array(z.string().max(60)).max(240),
});
export function voskGrammar(plan: PronunciationPlan): string[] {
  return [
    ...new Set(plan.words.flatMap((w) => [w.expected, ...w.confusions]).map(pronunciationKey)),
    '[unk]',
  ];
}
/** No network capability: even an inference failure must never upload an offline take. */
export function voskChecker(
  bridge: VoskBridge,
  path: string,
  pcm: (base64: string) => Promise<string>,
  now: () => number = () => performance.now(),
): PronunciationChecker {
  return {
    async check(plan, audio, signal) {
      const started = now();
      const assertActive = () => {
        if (signal?.aborted) throw new Error('pronunciation_cancelled');
      };
      assertActive();
      const decoded = await pcm(audio.audio_base64);
      assertActive();
      const raw = NativeResult.parse(
        JSON.parse(await bridge.checkPcm(path, decoded, JSON.stringify(voskGrammar(plan)))),
      );
      assertActive();
      const evidence = PronunciationEvidence.parse({
        source: 'vosk',
        heard: raw.words.map((w) => w.word).join(' '),
        elapsed_ms: now() - started,
        words: raw.words.map((w) => ({ heard: w.word, confidence: w.conf })),
        unavailable: raw.unavailable,
      });
      return { evidence, result: gradePronunciation(plan, evidence) };
    },
  };
}
