// The screen-reader form of a text with math, in the app language
// (locales/<lang>/math.json "spoken"). The arranging lives in lib/math/words.ts, so the
// tests read the same locale file the app does (issue #175).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { sayMath, speakMathText, type SpokenWords } from '../../lib/math/speak.js';
import { spokenWordsFrom } from '../../lib/math/words.js';

export function useSpokenWords(): SpokenWords {
  const { t, i18n } = useTranslation('math');
  // i18n.language: rebuild the words when the language changes.
  return useMemo(() => spokenWordsFrom((key, vars) => t(key, vars)), [t, i18n.language]);
}

/** The text read out in words ("3 Viertel"). */
export function useSpokenMath(text: string): string {
  const words = useSpokenWords();
  return useMemo(() => speakMathText(text, words), [text, words]);
}

/** Texts with their math said in words, in the app language (lib/speech/say.ts `useSay`). */
export function useSayMath(): (text: string) => string {
  const words = useSpokenWords();
  return useMemo(() => sayMath(words), [words]);
}
