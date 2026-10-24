import {
  conversationPronunciationPlan,
  type ConversationPronunciation,
  type PronunciationPlan,
} from '@learnbuddy/shared-types/contracts';
import { File } from 'expo-file-system';
import { pronunciationPacks } from './pronunciation.js';
import { nativeVosk, pronunciationPcm } from './voskNative.js';
import { voskChecker } from './vosk.js';

/** This path has no upload fallback. Missing capability/evidence leaves the conversation alone. */
export async function checkConversationPronunciation(
  text: string,
  language: string,
  uri: string,
  prepared?: PronunciationPlan | null,
): Promise<ConversationPronunciation | undefined> {
  try {
    const plan = conversationPronunciationPlan(text, language, prepared);
    const bridge = nativeVosk();
    if (!plan || !bridge) return;
    const pack = await pronunciationPacks.state(language);
    if (pack.state !== 'ready') return;
    const file = new File(uri);
    // Bound the temporary WAV before allocating base64 (30 seconds mono PCM plus headers).
    if (!file.exists || file.size > 3_000_000) return;
    const checked = await voskChecker(bridge, pack.path, pronunciationPcm).check(plan, {
      mime: 'audio/wav',
      audio_base64: await file.base64(),
    });
    return { plan, evidence: { ...checked.evidence, source: 'vosk' } };
  } catch {
    return;
  }
}

export function removeRecognitionAudio(uri: string | null): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup cannot turn a successful transcript into an error.
  }
}
