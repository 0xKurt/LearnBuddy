// The real words of a language for the tests: the same locales/<lang>/math.json the app
// loads, arranged by the same function (lib/math/words.ts). Hand-written copies are what
// let "2/5 → zwei durch fünf" pass every test run for months (issue #175).

import de from '../../../locales/de/math.json' with { type: 'json' };
import en from '../../../locales/en/math.json' with { type: 'json' };
import es from '../../../locales/es/math.json' with { type: 'json' };
import fr from '../../../locales/fr/math.json' with { type: 'json' };
import it from '../../../locales/it/math.json' with { type: 'json' };
import type { SpokenWords } from '../speak.js';
import { spokenWordsFrom } from '../words.js';

const FILES: Record<string, unknown> = { de, en, fr, es, it };

/** i18next's `t` for one language, over the locale file itself. */
function lookup(lang: string) {
  const file = FILES[lang];
  return (key: string, vars?: Record<string, string>): string => {
    let node: unknown = file;
    for (const part of key.split('.')) {
      node =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined;
    }
    if (typeof node !== 'string') throw new Error(`${lang}/math.json has no string at "${key}"`);
    // Placeholders are kept (each filled with itself), exactly as the hook asks for them.
    return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => vars?.[name] ?? whole);
  };
}

export function wordsOf(lang: 'de' | 'en' | 'fr' | 'es' | 'it'): SpokenWords {
  return spokenWordsFrom(lookup(lang));
}

/** The German words, as the app speaks them. */
export const DE = wordsOf('de');
