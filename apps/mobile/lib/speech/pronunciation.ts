import { mayDownloadPack } from './packDownload.js';
import type {
  PronunciationPlan,
  PronunciationAudio,
  PronunciationSubmission,
} from '@learnbuddy/shared-types/contracts';
import type { z } from 'zod';
import { Platform } from 'react-native';
import { PronunciationPacks } from './pronunciationPacks.js';
import { pronunciationPackStorage } from './pronunciationPackStorage.js';
import { nativeVosk, pronunciationPcm } from './voskNative.js';
import { voskChecker } from './vosk.js';

/** Preview APKs are native builds too. iOS remains a developer capability. */
const localPronunciationAvailable = () =>
  (Platform.OS === 'android' || (typeof __DEV__ !== 'undefined' && __DEV__)) &&
  nativeVosk() !== null;
export const pronunciationPacks = new PronunciationPacks(
  pronunciationPackStorage,
  localPronunciationAvailable,
  mayDownloadPack,
);

/** The recorder discloses this hybrid path before recording. Uncertainty sends original audio. */
export async function pronunciationSubmission(
  item: { pronunciation_plan?: PronunciationPlan | null },
  audio: PronunciationAudio,
  local: boolean,
  signal?: AbortSignal,
): Promise<z.infer<typeof PronunciationSubmission>> {
  const assertActive = () => {
    if (signal?.aborted) throw new Error('pronunciation_cancelled');
  };
  assertActive();
  if (!local) return audio;
  try {
    const plan = item.pronunciation_plan;
    const pack = plan ? await pronunciationPacks.state(plan.language) : null;
    const bridge = localPronunciationAvailable() ? nativeVosk() : null;
    assertActive();
    if (!plan || !bridge || pack?.state !== 'ready') return audio;
    const checked = await voskChecker(bridge, pack.path, pronunciationPcm).check(
      plan,
      audio,
      signal,
    );
    if (checked.result.overall === 'unsicher') return audio;
    return { evidence: { ...checked.evidence, source: 'vosk' } };
  } catch {
    assertActive();
    return audio;
  }
}
