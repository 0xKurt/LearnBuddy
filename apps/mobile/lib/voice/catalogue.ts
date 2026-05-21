// Curated Chirp HD voices offered in admin → Stimme.
//
// We only surface a SHORT, opinionated list. Google's Chirp3 HD catalogue
// has 30+ characters; most are too quirky for a kid-facing tutor. The
// six below cover the realistic vibes:
//   - 3 female voices: calm / gentle / lively
//   - 3 male   voices: deep-calm / warm / playful
//
// Each character is a Chirp3 HD voice name (the bare character without
// the language prefix). The server pairs it with the learner's
// ui_locale at synth time: `<lang>-Chirp3-HD-<character>`.
//
// `descriptionKey` resolves into admin.json → voice.descriptions.<key>.

import type { TtsVoiceCharacter } from '@learnbuddy/shared-types';

export type CatalogueVoice = {
  character: TtsVoiceCharacter;
  /** "Female" / "Male" — drives a small chip in the row. Mirrors the
   *  vibe Google's Chirp3 HD catalogue assigns to each character. */
  gender: 'female' | 'male';
  /** i18n key under admin.json → voice.descriptions.<key>. */
  descriptionKey: string;
};

export const VOICE_CATALOGUE: readonly CatalogueVoice[] = [
  { character: 'Aoede', gender: 'female', descriptionKey: 'aoede' },
  { character: 'Leda', gender: 'female', descriptionKey: 'leda' },
  { character: 'Kore', gender: 'female', descriptionKey: 'kore' },
  { character: 'Charon', gender: 'male', descriptionKey: 'charon' },
  { character: 'Fenrir', gender: 'male', descriptionKey: 'fenrir' },
  { character: 'Puck', gender: 'male', descriptionKey: 'puck' },
];

/** Voice the server uses when the learner has no preference set yet. */
export const DEFAULT_VOICE_CHARACTER: TtsVoiceCharacter = 'Aoede';
