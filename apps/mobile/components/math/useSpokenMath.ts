// The screen-reader form of a text with math, in the app language
// (locales/<lang>/math.json "spoken").

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SYMBOL_KEYS, speakMathText, type SpokenWords } from '../../lib/math/speak.js';

const KEEP_PLACEHOLDERS = {
  num: '{{num}}',
  den: '{{den}}',
  exp: '{{exp}}',
  sub: '{{sub}}',
  body: '{{body}}',
  index: '{{index}}',
} as const;

export function useSpokenWords(): SpokenWords {
  const { t, i18n } = useTranslation('math');
  return useMemo(() => {
    const symbols: Record<string, string> = {};
    for (const [char, key] of Object.entries(SYMBOL_KEYS)) {
      symbols[char] = t(`spoken.symbols.${key}`);
    }
    // Templates keep their {{placeholders}} (each filled with itself); speak.ts fills them.
    const raw = (key: string) => t(`spoken.${key}`, KEEP_PLACEHOLDERS);
    return {
      frac: raw('frac'),
      frac_long: raw('frac_long'),
      power: raw('power'),
      squared: raw('squared'),
      cubed: raw('cubed'),
      sub: raw('sub'),
      sqrt: raw('sqrt'),
      root: raw('root'),
      cbrt: raw('cbrt'),
      symbols,
    };
    // i18n.language: rebuild the words when the language changes.
  }, [t, i18n.language]);
}

/** The text read out in words ("3 durch 4"). */
export function useSpokenMath(text: string): string {
  const words = useSpokenWords();
  return useMemo(() => speakMathText(text, words), [text, words]);
}
